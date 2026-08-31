"use client";

import { useId, useState, type ComponentProps } from "react";

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4.5"
      aria-hidden
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4.5"
      aria-hidden
    >
      <path d="M9.9 5.7A8.9 8.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.5 16.5 0 0 1-3 3.85M6.5 8.15A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.85-.4 4.05-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </svg>
  );
}

/**
 * Campo de contraseña con el típico botón de ojito para mostrarla/ocultarla.
 * Acepta las mismas props que un `<input>` salvo `type`, que lo maneja el toggle.
 */
export function PasswordInput({
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        aria-describedby={hintId}
        className={`input pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // `tabIndex={-1}`: al tabular desde la contraseña se va al siguiente
        // campo del formulario, no al ojito.
        tabIndex={-1}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-xl
                   text-ink-400 transition hover:text-ink-100
                   focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
      <span id={hintId} className="sr-only">
        {visible ? "La contraseña está visible." : "La contraseña está oculta."}
      </span>
    </div>
  );
}
