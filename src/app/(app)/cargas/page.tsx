import Link from "next/link";
import type { Metadata } from "next";

import { RecordsTable } from "@/components/records-table";
import { ColorDot, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireSession } from "@/lib/auth/session";
import { formatCurrency, formatKm, formatNumber } from "@/lib/format";
import { getDashboardData } from "@/lib/queries";

export const metadata: Metadata = { title: "Cargas" };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ vehiculo?: string; actualizada?: string }>;
}) {
  const { vehiculo, actualizada } = await searchParams;
  const session = await requireSession();
  const { vehicles, stats, summary } = await getDashboardData(session.userId);

  const activeVehicle = vehiculo && vehicles.some((v) => v.id === vehiculo) ? vehiculo : null;

  const records = stats
    .filter((s) => !activeVehicle || s.vehicleId === activeVehicle)
    .flatMap((s) => s.records)
    .sort((a, b) => b.filledAt.getTime() - a.filledAt.getTime());

  const filtered = activeVehicle ? stats.find((s) => s.vehicleId === activeVehicle) : null;

  const totals = {
    spent: filtered ? filtered.totalSpent : summary.totalSpent,
    liters: filtered ? filtered.totalLiters : summary.totalLiters,
    distance: filtered ? filtered.totalDistance : summary.totalDistance,
    avgPrice: filtered ? filtered.avgPricePerLiter : summary.avgPricePerLiter,
    unit: (filtered ? filtered.unit : summary.unit) ?? "L",
  };

  return (
    <>
      <PageHeader
        title="Cargas de combustible"
        description="Todo el historial, con el consumo y el costo por kilómetro de cada tramo."
      >
        <Link href="/api/exportar" className="btn btn-secondary" prefetch={false}>
          Exportar CSV
        </Link>
        <Link href="/cargas/nueva" className="btn btn-primary">
          + Nueva carga
        </Link>
      </PageHeader>

      {actualizada ? (
        <p className="alert-info mb-5" role="status">
          Carga actualizada. Las métricas se recalcularon.
        </p>
      ) : null}

      {vehicles.length > 1 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/cargas"
            className={`chip transition ${!activeVehicle ? "border-accent/40 bg-accent/12 text-accent" : "hover:border-white/25"}`}
          >
            Todos
          </Link>
          {vehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/cargas?vehiculo=${vehicle.id}`}
              className={`chip transition ${
                activeVehicle === vehicle.id
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "hover:border-white/25"
              }`}
            >
              <ColorDot color={vehicle.color} />
              {vehicle.name}
            </Link>
          ))}
        </div>
      ) : null}

      {records.length === 0 ? (
        <EmptyState
          title="Todavía no hay cargas registradas"
          description="Cada vez que cargues combustible, anotá la fecha, los kilómetros y el total. Con dos registros ya vas a ver tu consumo real."
          actionLabel="Registrar primera carga"
          actionHref="/cargas/nueva"
        />
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Gasto acumulado" value={formatCurrency(totals.spent)} accent="#22d3ee" />
            <StatCard
              label="Combustible cargado"
              value={
                totals.liters !== null ? `${formatNumber(totals.liters, 0)} ${totals.unit}` : "—"
              }
              hint={
                totals.liters !== null
                  ? `${records.length} cargas`
                  : `${records.length} cargas en unidades distintas`
              }
              accent="#a78bfa"
            />
            <StatCard label="Distancia registrada" value={formatKm(totals.distance)} accent="#34d399" />
            <StatCard
              label={totals.unit === "L" ? "Precio promedio del litro" : `Precio promedio del ${totals.unit}`}
              value={totals.avgPrice ? formatCurrency(totals.avgPrice) : "—"}
              accent="#fbbf24"
            />
          </section>

          <RecordsTable records={records} vehicles={vehicles} showVehicle={!activeVehicle} />
        </div>
      )}
    </>
  );
}
