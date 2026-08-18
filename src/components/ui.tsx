import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { formatPercent } from "@/lib/format";

/* -------------------------------------------------------------------------- */

export function Card({
  className = "",
  children,
  ...props
}: ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/6 px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-base font-semibold text-ink-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Tarjeta de KPI: valor grande, contexto abajo y variación opcional. */
export function StatCard({
  label,
  value,
  hint,
  changePct,
  /** `true` cuando que el número suba es una mala noticia (gasto, consumo). */
  invertChangeColor = false,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  changePct?: number | null;
  invertChangeColor?: boolean;
  accent?: string;
  icon?: ReactNode;
}) {
  const hasChange = changePct !== null && changePct !== undefined && Number.isFinite(changePct);
  const isUp = hasChange && changePct! > 0;
  const good = invertChangeColor ? !isUp : isUp;
  const changeClass = !hasChange
    ? ""
    : changePct === 0
      ? "text-ink-400"
      : good
        ? "text-emerald-300"
        : "text-rose-300";

  return (
    <div className="card card-pad relative overflow-hidden">
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">{label}</p>
        {icon ? <span className="text-ink-500">{icon}</span> : null}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold text-ink-50 sm:text-[1.7rem]">{value}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {hasChange ? (
          <span className={`tabular text-xs font-semibold ${changeClass}`}>
            {isUp ? "▲" : changePct === 0 ? "•" : "▼"} {formatPercent(changePct)}
          </span>
        ) : null}
        {hint ? <span className="text-xs text-ink-400">{hint}</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon = "⛽",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-2xl">
        {icon}
      </span>
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      <p className="max-w-md text-sm text-ink-400">{description}</p>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="btn btn-primary mt-2">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-400">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  color,
  className = "",
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  if (!color) return <span className={`chip ${className}`}>{children}</span>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      style={{ color, backgroundColor: `${color}1f`, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  );
}

export function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}22` }}
    />
  );
}
