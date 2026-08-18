"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de submit que pide confirmación antes de disparar la acción.
 * Se usa para borrar y archivar, donde un click accidental duele.
 */
export function ConfirmButton({
  message,
  children,
  className = "btn btn-danger",
  pendingLabel = "…",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
