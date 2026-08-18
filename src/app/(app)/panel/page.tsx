import Link from "next/link";
import type { Metadata } from "next";

import {
  DistributionChart,
  MonthlySpendChart,
  PriceEvolutionChart,
  VehicleComparisonChart,
} from "@/components/charts";
import { InsightsList } from "@/components/insights-list";
import { RecordsTable } from "@/components/records-table";
import { Card, CardHeader, ColorDot, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireSession } from "@/lib/auth/session";
import { formatCurrency, formatDate, formatKm, formatNumber } from "@/lib/format";
import { buildInsights } from "@/lib/insights";
import { getDashboardData } from "@/lib/queries";

export const metadata: Metadata = { title: "Panel" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ guardada?: string }>;
}) {
  const { guardada } = await searchParams;
  const session = await requireSession();
  const { vehicles, stats, summary } = await getDashboardData(session.userId);

  const firstName = session.name.split(" ")[0];

  if (!vehicles.length) {
    return (
      <>
        <PageHeader title={`Hola, ${firstName}`} description="Arranquemos por el principio." />
        <EmptyState
          icon="🚗"
          title="Creá tu primer vehículo"
          description="Todo el control de combustible se organiza por vehículo. Dalo de alta y empezá a registrar cargas."
          actionLabel="Crear vehículo"
          actionHref="/vehiculos/nuevo"
        />
      </>
    );
  }

  if (summary.fills === 0) {
    return (
      <>
        <PageHeader title={`Hola, ${firstName}`} description="Ya tenés el vehículo. Falta la primera carga.">
          <Link href="/cargas/nueva" className="btn btn-primary">
            + Registrar carga
          </Link>
        </PageHeader>
        <EmptyState
          title="Sin cargas todavía"
          description="Registrá la primera carga con la fecha, los kilómetros del tablero y el total pagado. Si no anotaste los litros, alcanza con el precio por litro: la app los calcula."
          actionLabel="Registrar primera carga"
          actionHref="/cargas/nueva"
        />
      </>
    );
  }

  /* Series y datos derivados para los gráficos del panel */
  const priceSeries = stats
    .flatMap((s) => s.priceSeries)
    .sort((a, b) => a.timestamp - b.timestamp);

  const recentRecords = stats
    .flatMap((s) => s.records)
    .sort((a, b) => b.filledAt.getTime() - a.filledAt.getTime())
    .slice(0, 8);

  const months = summary.monthly.slice(-12).map((m) => m.label);
  const comparisonSeries = stats.map((s) => ({
    id: s.vehicleId,
    name: s.vehicleName,
    color: s.color,
    values: Object.fromEntries(s.monthly.map((m) => [m.label, m.spent])),
  }));

  /* Observaciones del vehículo con más datos: es donde más valor aportan */
  const leadStats = [...stats].sort((a, b) => b.fills - a.fills)[0];
  const insights = leadStats ? buildInsights(leadStats).slice(0, 4) : [];

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description={`${summary.fills} cargas registradas en ${summary.vehicles} ${summary.vehicles === 1 ? "vehículo" : "vehículos"}.`}
      >
        <Link href="/cargas/nueva" className="btn btn-primary">
          + Nueva carga
        </Link>
      </PageHeader>

      {guardada ? (
        <p className="alert-info mb-5" role="status">
          Carga guardada correctamente.
        </p>
      ) : null}

      <div className="grid gap-6">
        {/* -------------------------------- KPIs -------------------------------- */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Gasto de este mes"
            value={formatCurrency(summary.spentThisMonth)}
            changePct={summary.spentChangePct}
            invertChangeColor
            hint={
              summary.spentPreviousMonth
                ? `Mes en curso · anterior: ${formatCurrency(summary.spentPreviousMonth)}`
                : "Primer mes con registros"
            }
            accent="#22d3ee"
          />
          <StatCard
            label="Consumo promedio"
            value={
              summary.avgConsumption
                ? `${formatNumber(summary.avgConsumption, 2)} ${summary.unit}/100km`
                : "—"
            }
            hint={
              summary.avgConsumption
                ? `${formatNumber(100 / summary.avgConsumption, 2)} km/${summary.unit}`
                : summary.unit === null
                  ? "Tus vehículos usan unidades distintas: miralo por vehículo"
                  : "Necesitás dos cargas a tanque lleno"
            }
            accent="#a78bfa"
          />
          <StatCard
            label="Costo por kilómetro"
            value={summary.costPerKm ? formatCurrency(summary.costPerKm) : "—"}
            hint={summary.costPerKm ? `${formatCurrency(summary.costPerKm * 100)} cada 100 km` : undefined}
            accent="#f472b6"
          />
          <StatCard
            label={
              summary.unit === null
                ? "Último precio unitario"
                : summary.unit === "L"
                  ? "Último precio del litro"
                  : `Último precio del ${summary.unit}`
            }
            value={summary.lastPricePerLiter ? formatCurrency(summary.lastPricePerLiter) : "—"}
            hint={
              summary.avgPricePerLiter
                ? `Promedio histórico ${formatCurrency(summary.avgPricePerLiter)}`
                : summary.unit === null
                  ? "Hay más de una unidad en juego: miralo por vehículo"
                  : undefined
            }
            accent="#fbbf24"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Gasto acumulado"
            value={formatCurrency(summary.totalSpent)}
            hint={
              summary.totalLiters !== null
                ? `${formatNumber(summary.totalLiters, 0)} ${summary.unit} en total`
                : "Cantidades en unidades distintas"
            }
          />
          <StatCard label="Distancia registrada" value={formatKm(summary.totalDistance)} />
          <StatCard
            label={
              summary.unit === null
                ? "Combustible este mes"
                : summary.unit === "L"
                  ? "Litros este mes"
                  : `${summary.unit} este mes`
            }
            value={
              summary.litersThisMonth !== null
                ? `${formatNumber(summary.litersThisMonth, 1)} ${summary.unit}`
                : "—"
            }
            hint={
              summary.litersThisMonth === null
                ? `${formatKm(summary.distanceThisMonth)} recorridos · cantidades en unidades distintas`
                : `${formatKm(summary.distanceThisMonth)} recorridos`
            }
          />
          <StatCard
            label="Proyección mensual"
            value={summary.projectedMonthlySpend ? formatCurrency(summary.projectedMonthlySpend) : "—"}
            hint={
              summary.projectedMonthlySpend
                ? `≈ ${formatCurrency(summary.projectedMonthlySpend * 12)} al año`
                : "Con más meses cargados aparece la proyección"
            }
          />
        </section>

        {/* ----------------------------- Observaciones --------------------------- */}
        {insights.length ? (
          <section>
            <h2 className="section-title mb-3">
              Qué dicen tus números
              {stats.length > 1 && leadStats ? (
                <span className="ml-2 font-normal text-ink-500">· {leadStats.vehicleName}</span>
              ) : null}
            </h2>
            <InsightsList insights={insights} />
          </section>
        ) : null}

        {/* ------------------------------- Gráficos ------------------------------ */}
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Gasto mensual en combustible"
              subtitle={
                summary.unit === null
                  ? "Barras: pesos gastados · La línea de cantidad mezcla unidades distintas"
                  : `Barras: pesos gastados · Línea: ${summary.unit === "L" ? "litros" : summary.unit} cargados`
              }
            />
            <div className="p-4 sm:p-5">
              <MonthlySpendChart data={summary.monthly} unit={summary.unit ?? "L"} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Evolución del precio por ${summary.unit ?? "unidad"}`}
              subtitle={
                summary.unit === null
                  ? "Ojo: tus vehículos cargan en unidades distintas, así que la curva mezcla precios que no son comparables"
                  : "Cada punto es una carga, ordenadas por fecha"
              }
            />
            <div className="p-4 sm:p-5">
              <PriceEvolutionChart data={priceSeries} unit={summary.unit ?? "L"} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={stats.length > 1 ? "Gasto por vehículo" : "Gasto por estación"}
              subtitle="Sobre el total acumulado"
            />
            <div className="p-4 sm:p-5">
              <DistributionChart
                data={stats.length > 1 ? summary.byVehicle : summary.byStation}
              />
            </div>
          </Card>

          {stats.length > 1 ? (
            <Card className="xl:col-span-2">
              <CardHeader title="Comparación entre vehículos" subtitle="Gasto mensual de cada uno" />
              <div className="p-4 sm:p-5">
                <VehicleComparisonChart months={months} series={comparisonSeries} />
              </div>
            </Card>
          ) : null}
        </section>

        {/* ---------------------------- Resumen por auto -------------------------- */}
        <section>
          <h2 className="section-title mb-3">Tus vehículos</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.map((vehicleStats) => (
              <Link
                key={vehicleStats.vehicleId}
                href={`/vehiculos/${vehicleStats.vehicleId}`}
                className="block transition hover:-translate-y-0.5"
              >
                <Card className="card-pad h-full">
                  <h3 className="flex items-center gap-2 font-semibold text-ink-50">
                    <ColorDot color={vehicleStats.color} />
                    {vehicleStats.vehicleName}
                  </h3>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <dt className="text-xs text-ink-500">Consumo</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {vehicleStats.avgConsumption
                          ? `${formatNumber(vehicleStats.avgConsumption, 2)} ${vehicleStats.consumptionUnit}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">$/km</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {vehicleStats.costPerKm ? formatCurrency(vehicleStats.costPerKm) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Gastado</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {formatCurrency(vehicleStats.totalSpent)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Última carga</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {formatDate(vehicleStats.lastFillAt)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* ----------------------------- Últimas cargas --------------------------- */}
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="section-title">Últimas cargas</h2>
            <Link href="/cargas" className="text-xs font-semibold text-accent hover:underline">
              Ver todas →
            </Link>
          </div>
          <RecordsTable records={recentRecords} vehicles={vehicles} showVehicle={stats.length > 1} />
        </section>
      </div>
    </>
  );
}
