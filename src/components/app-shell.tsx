"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/panel", label: "Panel", icon: "◧" },
  { href: "/cargas", label: "Cargas", icon: "⛽" },
  { href: "/vehiculos", label: "Vehículos", icon: "🚗" },
  { href: "/estadisticas", label: "Estadísticas", icon: "📊" },
  { href: "/cuenta", label: "Cuenta", icon: "⚙" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-1 gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-accent/12 text-accent shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]"
                : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
            }`}
          >
            <span className="w-5 text-center text-base">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  logout,
  children,
}: {
  user: { name: string; email: string };
  logout: React.ReactNode;
  children: React.ReactNode;
}) {
  // El menú móvil se cierra desde el `onNavigate` de cada link.
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Barra superior en móvil */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/6 bg-ink-950/85 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/panel" className="inline-flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent">⛽</span>
          Combustible
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Abrir menú"
          className="btn btn-secondary px-3 py-2"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Panel lateral */}
      <aside
        className={`${
          menuOpen ? "block" : "hidden"
        } border-b border-white/6 bg-ink-950/95 p-4 lg:sticky lg:top-0 lg:block lg:h-dvh lg:border-r lg:border-b-0 lg:p-5`}
      >
        <Link href="/panel" className="mb-7 hidden items-center gap-2.5 font-semibold lg:flex">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">⛽</span>
          <span className="leading-tight">
            Gestión de
            <br />
            Combustible
          </span>
        </Link>

        <NavLinks onNavigate={() => setMenuOpen(false)} />

        <div className="mt-6 border-t border-white/6 pt-4 lg:absolute lg:inset-x-5 lg:bottom-5 lg:mt-0">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-xs font-semibold text-ink-200">
              {initials || "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-100">{user.name}</p>
              <p className="truncate text-xs text-ink-500">{user.email}</p>
            </div>
          </div>
          {logout}
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
