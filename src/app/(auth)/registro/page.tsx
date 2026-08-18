import Link from "next/link";
import type { Metadata } from "next";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <div>
      <Link href="/" className="mb-8 inline-flex items-center gap-2.5 font-semibold lg:hidden">
        <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">⛽</span>
        Gestión de Combustible
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-ink-50">Crear cuenta</h1>
      <p className="mt-1.5 text-sm text-ink-400">
        En un minuto vas a estar cargando tu primer registro de combustible.
      </p>

      <RegisterForm />

      <p className="mt-6 text-sm text-ink-400">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-accent hover:underline">
          Ingresá
        </Link>
      </p>
    </div>
  );
}
