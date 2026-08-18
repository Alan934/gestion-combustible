"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { createSessionCookie, destroySessionCookie, requireSession } from "./session";

export type AuthState = { error?: string } | null;

const emailSchema = z
  .string()
  .trim()
  .min(1, "Ingresá tu email")
  .email("El email no parece válido")
  .transform((v) => v.toLowerCase());

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresá tu nombre"),
    email: emailSchema,
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisá los datos ingresados";
}

/** Normaliza el destino post-login para evitar redirecciones a sitios externos. */
function safeRedirect(value: FormDataEntryValue | null) {
  const target = typeof value === "string" ? value : "";
  return target.startsWith("/") && !target.startsWith("//") ? target : "/panel";
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existing) return { error: "Ya existe una cuenta con ese email" };

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .returning({ id: users.id, name: users.name, email: users.email });

  await createSessionCookie({ userId: user.id, email: user.email, name: user.name });
  redirect("/vehiculos/nuevo?bienvenida=1");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Ingresá tu contraseña") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });

  // Mismo mensaje para email inexistente y contraseña incorrecta: no revelamos
  // qué emails están registrados.
  const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) return { error: "Email o contraseña incorrectos" };

  await createSessionCookie({ userId: user.id, email: user.email, name: user.name });
  redirect(safeRedirect(formData.get("redirigir")));
}

export async function logoutAction() {
  await destroySessionCookie();
  redirect("/ingresar");
}

export type PasswordState = { error?: string; ok?: boolean } | null;

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const session = await requireSession();

  const parsed = z
    .object({
      currentPassword: z.string().min(1, "Ingresá tu contraseña actual"),
      newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Las contraseñas nuevas no coinciden",
      path: ["confirmPassword"],
    })
    .safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return { error: "No encontramos tu cuenta" };

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "La contraseña actual no es correcta" };

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), updatedAt: new Date() })
    .where(eq(users.id, session.userId));

  return { ok: true };
}

export async function deleteAccountAction(formData: FormData) {
  const session = await requireSession();

  const confirmation = String(formData.get("confirmacion") ?? "").trim();
  if (confirmation.toLowerCase() !== "borrar") return;

  // Vehículos y cargas caen por el ON DELETE CASCADE.
  await db.delete(users).where(eq(users.id, session.userId));
  await destroySessionCookie();
  redirect("/");
}
