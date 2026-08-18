"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { registerAction, type AuthState } from "@/lib/auth/actions";
import { Field } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Creando cuenta…" : "Crear cuenta"}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(registerAction, null);

  return (
    <form action={formAction} className="mt-8 grid gap-4">
      <Field label="Nombre" htmlFor="name">
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Cómo te llamás"
          className="input"
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@email.com"
          className="input"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Contraseña" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Mínimo 8 caracteres"
            className="input"
          />
        </Field>

        <Field label="Repetir contraseña" htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="••••••••"
            className="input"
          />
        </Field>
      </div>

      {state?.error ? (
        <p className="alert-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
