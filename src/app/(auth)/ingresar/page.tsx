import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirigir?: string }>;
}) {
  const { redirigir } = await searchParams;

  return (
    <div>
      <Link href="/" className="mb-8 inline-flex items-center gap-2.5 font-semibold lg:hidden">
        <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">⛽</span>
        Gestión de Combustible
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-ink-50">Ingresar</h1>
      <p className="mt-1.5 text-sm text-ink-400">Accedé al control de combustible de tus vehículos.</p>

      <LoginForm redirectTo={redirigir} />

      <p className="mt-6 text-sm text-ink-400">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/registro" className="font-semibold text-accent hover:underline">
          Creá una gratis
        </Link>
      </p>
    </div>
  );
}
