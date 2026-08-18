import type { Metadata } from "next";

import { ConfirmButton } from "@/components/confirm-button";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { deleteAccountAction, logoutAction } from "@/lib/auth/actions";
import { requireSession } from "@/lib/auth/session";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getDashboardData } from "@/lib/queries";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Cuenta" };

export default async function AccountPage() {
  const session = await requireSession();
  const { vehicles, summary } = await getDashboardData(session.userId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tu cuenta" description="Datos de acceso y estado de tu información." />

      <div className="grid gap-5">
        <Card>
          <CardHeader title="Datos" />
          <dl className="card-pad grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-500">Nombre</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink-100">{session.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Email</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink-100">{session.email}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Tu información" subtitle="Todo lo que llevás registrado hasta ahora" />
          <dl className="card-pad grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-500">Vehículos</dt>
              <dd className="tabular mt-0.5 text-lg font-semibold text-ink-50">{vehicles.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Cargas</dt>
              <dd className="tabular mt-0.5 text-lg font-semibold text-ink-50">{summary.fills}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">
                {summary.unit && summary.unit !== "L" ? summary.unit : "Litros"}
              </dt>
              <dd className="tabular mt-0.5 text-lg font-semibold text-ink-50">
                {summary.totalLiters !== null ? formatNumber(summary.totalLiters, 0) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Gastado</dt>
              <dd className="tabular mt-0.5 text-lg font-semibold text-ink-50">
                {formatCurrency(summary.totalSpent, true)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Cambiar contraseña" />
          <PasswordForm />
        </Card>

        <Card>
          <CardHeader title="Sesión" />
          <div className="card-pad">
            <form action={logoutAction}>
              <button type="submit" className="btn btn-secondary">
                Cerrar sesión
              </button>
            </form>
          </div>
        </Card>

        <Card className="border-rose-500/20">
          <CardHeader
            title="Borrar la cuenta"
            subtitle="Se eliminan tus vehículos y todas tus cargas. No hay vuelta atrás."
          />
          <form action={deleteAccountAction} className="card-pad grid gap-4">
            <label className="label" htmlFor="confirmacion">
              Escribí <span className="text-rose-300">borrar</span> para confirmar
            </label>
            <input
              id="confirmacion"
              name="confirmacion"
              required
              placeholder="borrar"
              className="input max-w-xs"
              autoComplete="off"
            />
            <div>
              <ConfirmButton
                message="Se van a borrar tu cuenta, tus vehículos y todas tus cargas. ¿Confirmás?"
                pendingLabel="Borrando…"
              >
                Borrar mi cuenta
              </ConfirmButton>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
