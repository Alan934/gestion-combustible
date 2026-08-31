"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { changePasswordAction, type PasswordState } from "@/lib/auth/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Cambiar contraseña"}
    </button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<PasswordState, FormData>(changePasswordAction, null);

  return (
    <form action={formAction} className="card-pad grid gap-4">
      <Field label="Contraseña actual" htmlFor="currentPassword">
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" htmlFor="newPassword">
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label="Repetir nueva contraseña" htmlFor="confirmPassword">
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
      </div>

      {state?.error ? (
        <p className="alert-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="alert-info" role="status">
          Listo, tu contraseña quedó actualizada.
        </p>
      ) : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
