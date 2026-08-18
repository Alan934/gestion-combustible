import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  ConsumptionChart,
  CostPerKmChart,
  DistanceChart,
  DistributionChart,
  MonthlySpendChart,
  PriceEvolutionChart,
} from "@/components/charts";
import { ConfirmButton } from "@/components/confirm-button";
import { InsightsList } from "@/components/insights-list";
import { RecordsTable } from "@/components/records-table";
import { Badge, Card, CardHeader, ColorDot, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { deleteVehicleAction, toggleArchiveVehicleAction } from "@/lib/actions/vehicles";
import { requireSession } from "@/lib/auth/session";
import { fuelType } from "@/lib/catalogs";
import { formatCurrency, formatDate, formatKm, formatNumber } from "@/lib/format";
import { buildInsights } from "@/lib/insights";
import { getVehicleStats } from "@/lib/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const data = await getVehicleStats(session.userId, id);
  return { title: data?.vehicle.name ?? "Vehículo" };
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const data = await getVehicleStats(session.userId, id);

  if (!data) notFound();

  const { vehicle, stats } = data;
  const fuel = fuelType(vehicle.fuelType);
  const secondaryFuel = vehicle.secondaryFuelType ? fuelType(vehicle.secondaryFuelType) : null;
  const insights = buildInsights(stats);
  const lastMonth = stats.monthly.at(-1);
  const previousMonth = stats.monthly.at(-2);
  const spendChange =
    lastMonth && previousMonth && previousMonth.spent > 0
      ? ((lastMonth.spent - previousMonth.spent) / previousMonth.spent) * 100
      : null;

  return (
    <>
      <PageHeader
        title={vehicle.name}
        description={
          [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" · ") ||
          "Ficha completa del vehículo"
        }
      >
        <Link href={`/cargas/nueva?vehiculo=${vehicle.id}`} className="btn btn-primary">
          + Nueva carga
        </Link>
        <Link href={`/vehiculos/${vehicle.id}/editar`} className="btn btn-secondary">
          Editar
        </Link>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge color={vehicle.color}>
          <ColorDot color={vehicle.color} /> {vehicle.name}
        </Badge>
        <Badge color={fuel.color}>{fuel.label}</Badge>
        {vehicle.plate ? <Badge>Patente {vehicle.plate}</Badge> : null}
        {secondaryFuel ? <Badge color={secondaryFuel.color}>+ {secondaryFuel.label}</Badge> : null}
        {vehicle.tankCapacity ? (
          <Badge>
            Tanque {formatNumber(vehicle.tankCapacity, 0)} {fuel.unit}
          </Badge>
        ) : null}
        {secondaryFuel && vehicle.secondaryTankCapacity ? (
          <Badge>
            Segundo tanque {formatNumber(vehicle.secondaryTankCapacity, 0)} {secondaryFuel.unit}
          </Badge>
        ) : null}
        {vehicle.targetConsumption ? (
          <Badge>
            Referencia {formatNumber(vehicle.targetConsumption, 1)} {fuel.unit}/100km
          </Badge>
        ) : null}
        {vehicle.isArchived ? <Badge color="#fbbf24">Archivado</Badge> : null}
      </div>

      {stats.mixedFuelUnits ? (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/6 px-4 py-3 text-sm text-amber-200">
          <p className="font-semibold">Este vehículo tiene cargas en más de una unidad</p>
          <p className="mt-1 text-xs leading-relaxed">
            Hay cargas medidas en litros y otras en {stats.unit === "L" ? "m³ o kWh" : "litros"}. El
            consumo promedio y los totales de cantidad mezclan unidades distintas, así que no se
            pueden leer como un número solo. El <strong>costo por kilómetro</strong> y el{" "}
            <strong>gasto</strong> sí son confiables: están en pesos.
          </p>
        </div>
      ) : null}

      {stats.fills === 0 ? (
        <EmptyState
          title="Este vehículo todavía no tiene cargas"
          description="Registrá la primera carga de combustible para empezar a medir consumo, costo por kilómetro y gasto mensual."
          actionLabel="Registrar primera carga"
          actionHref={`/cargas/nueva?vehiculo=${vehicle.id}&primera=1`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* ------------------------------- KPIs ------------------------------- */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={stats.isDual ? `Consumo · ${fuel.short}` : "Consumo promedio"}
              value={
                stats.avgConsumption
                  ? `${formatNumber(stats.avgConsumption, 2)} ${stats.consumptionUnit}`
                  : "—"
              }
              hint={
                stats.avgKmPerLiter
                  ? `${formatNumber(stats.avgKmPerLiter, 2)} ${stats.efficiencyUnit}${
                      stats.isDual ? " · el otro combustible está más abajo" : ""
                    }`
                  : undefined
              }
              accent="#22d3ee"
            />
            <StatCard
              label="Costo por kilómetro"
              value={stats.costPerKm ? formatCurrency(stats.costPerKm) : "—"}
              hint={
                stats.isDual
                  ? "Sobre el gasto total: exacto, mezcle los combustibles que mezcle"
                  : stats.costPer100Km
                    ? `${formatCurrency(stats.costPer100Km)} cada 100 km`
                    : undefined
              }
              accent="#f472b6"
            />
            <StatCard
              label="Gasto total"
              value={formatCurrency(stats.totalSpent)}
              hint={
                stats.isDual
                  ? `${stats.fills} cargas entre los dos combustibles`
                  : `${stats.fills} cargas · ${formatNumber(stats.totalLiters, 0)} ${stats.unit}`
              }
              accent="#a78bfa"
            />
            <StatCard
              label="Gasto del último mes"
              value={formatCurrency(lastMonth?.spent ?? 0)}
              changePct={spendChange}
              invertChangeColor
              hint={lastMonth?.label}
              accent="#fbbf24"
            />

            <StatCard
              label="Odómetro actual"
              value={formatKm(stats.currentOdometer)}
              hint={`${formatKm(stats.totalDistance)} medidos por la app`}
            />
            <StatCard
              label={stats.unit === "L" ? "Precio del litro" : `Precio del ${stats.unit}`}
              value={stats.lastPricePerLiter ? formatCurrency(stats.lastPricePerLiter) : "—"}
              changePct={stats.priceChangePct}
              invertChangeColor
              hint={
                stats.avgPricePerLiter
                  ? `Promedio histórico ${formatCurrency(stats.avgPricePerLiter)}`
                  : undefined
              }
            />
            <StatCard
              label="Autonomía estimada"
              value={stats.estimatedRange ? formatKm(stats.estimatedRange) : "—"}
              hint={
                stats.estimatedFullTankCost
                  ? `Llenar el tanque: ${formatCurrency(stats.estimatedFullTankCost)}`
                  : "Cargá la capacidad del tanque para verlo"
              }
            />
            <StatCard
              label="Entre cargas"
              value={
                stats.avgKmBetweenFills ? `${formatNumber(stats.avgKmBetweenFills, 0)} km` : "—"
              }
              hint={
                stats.avgDaysBetweenFills
                  ? `Cada ${formatNumber(stats.avgDaysBetweenFills, 1)} días · ${formatCurrency(stats.avgSpentPerFill)} por carga`
                  : undefined
              }
            />
          </section>

          {/* ------------------------ Rendimiento por combustible ------------------ */}
          {stats.fuelPerformance.length > 1 ? (
            <section>
              <h2 className="section-title mb-3">Rendimiento por combustible</h2>

              {stats.dualComparison ? (
                <div className="card card-pad mb-4 border-emerald-400/25 bg-emerald-400/6">
                  <p className="text-sm font-semibold text-emerald-200">
                    Andar con {stats.dualComparison.cheaper.label} te sale{" "}
                    {formatNumber(stats.dualComparison.savingPct, 0)}% más barato
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
                    {formatCurrency(stats.dualComparison.cheaper.costPerKm)} por kilómetro contra{" "}
                    {formatCurrency(stats.dualComparison.pricier.costPerKm)} con{" "}
                    {stats.dualComparison.pricier.label}: {formatCurrency(stats.dualComparison.savingPerKm)}{" "}
                    de diferencia por kilómetro. En {formatKm(1000)} eso son{" "}
                    <strong>{formatCurrency(stats.dualComparison.savingPerKm * 1000)}</strong>.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {stats.fuelPerformance.map((fuelStats) => (
                  <Card key={fuelStats.fuelTypeId} className="card-pad">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-semibold text-ink-50">
                        <ColorDot color={fuelStats.color} />
                        {fuelStats.label}
                      </h3>
                      <span className="text-xs text-ink-500">
                        {fuelStats.fills} cargas · {formatNumber(fuelStats.share, 0)}% del gasto
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <dt className="text-xs text-ink-500">Consumo</dt>
                        <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                          {fuelStats.avgConsumption
                            ? `${formatNumber(fuelStats.avgConsumption, 2)} ${fuelStats.consumptionUnit}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-500">Costo por km</dt>
                        <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                          {fuelStats.costPerKm ? formatCurrency(fuelStats.costPerKm) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-500">Cargado</dt>
                        <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                          {formatNumber(fuelStats.quantity, 1)} {fuelStats.unit}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-500">Precio actual</dt>
                        <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                          {fuelStats.lastPrice ? formatCurrency(fuelStats.lastPrice) : "—"}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-4 border-t border-white/6 pt-3 text-xs text-ink-500">
                      Gasto acumulado {formatCurrency(fuelStats.spent)}
                      {fuelStats.avgKmPerUnit
                        ? ` · ${formatNumber(fuelStats.avgKmPerUnit, 2)} ${fuelStats.efficiencyUnit}`
                        : ""}
                    </p>

                    {fuelStats.excludedLegs > 0 ? (
                      <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
                        {fuelStats.avgConsumption === null ? (
                          <>
                            Todavía no se puede medir el consumo de {fuelStats.label.toLowerCase()}:
                            en los {fuelStats.excludedLegs} tramos registrados siempre cargaste
                            también el otro combustible, y el odómetro no distingue con cuál hiciste
                            cada kilómetro.{" "}
                            <strong>
                              Para medirlo, hacé dos cargas seguidas de {fuelStats.label.toLowerCase()}{" "}
                              sin cargar el otro en el medio.
                            </strong>
                          </>
                        ) : (
                          <>
                            {fuelStats.excludedLegs}{" "}
                            {fuelStats.excludedLegs === 1 ? "tramo quedó" : "tramos quedaron"} fuera
                            del promedio por haber tenido cargas del otro combustible en el medio. El
                            número de arriba sale sólo de los tramos limpios.
                          </>
                        )}
                      </p>
                    ) : null}

                    {fuelStats.consumptionSeries.length > 1 ? (
                      <div className="mt-4">
                        <ConsumptionChart
                          data={fuelStats.consumptionSeries}
                          average={fuelStats.avgConsumption}
                          unit={fuelStats.unit}
                        />
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {/* ---------------------------- Observaciones -------------------------- */}
          {insights.length ? (
            <section>
              <h2 className="section-title mb-3">Qué dicen tus números</h2>
              <InsightsList insights={insights} />
            </section>
          ) : null}

          {/* ------------------------------ Gráficos ----------------------------- */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Consumo por tramo"
                subtitle="Calculado de tanque lleno a tanque lleno. Menos es mejor."
              />
              <div className="p-4 sm:p-5">
                {stats.consumptionSeries.length ? (
                  <ConsumptionChart
                    data={stats.consumptionSeries}
                    average={stats.avgConsumption}
                    target={vehicle.targetConsumption}
                    unit={stats.unit}
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-ink-400">
                    Hace falta al menos un tramo completo entre dos cargas a tanque lleno.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={`Precio por ${stats.unit}`}
                subtitle={`Cómo se movió lo que pagás por cada ${stats.unit === "L" ? "litro" : stats.unit}`}
              />
              <div className="p-4 sm:p-5">
                <PriceEvolutionChart data={stats.priceSeries} unit={stats.unit} />
              </div>
            </Card>

            <Card>
              <CardHeader
                title={`Gasto y ${stats.unit === "L" ? "litros" : stats.unit} por mes`}
                subtitle={`Barras: pesos · Línea: ${stats.unit === "L" ? "litros" : stats.unit}`}
              />
              <div className="p-4 sm:p-5">
                <MonthlySpendChart data={stats.monthly} unit={stats.unit} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Kilómetros por mes" subtitle="Cuánto usaste el vehículo" />
              <div className="p-4 sm:p-5">
                <DistanceChart data={stats.monthly} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Costo por kilómetro mes a mes" />
              <div className="p-4 sm:p-5">
                <CostPerKmChart data={stats.monthly} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Dónde cargás" subtitle="Gasto repartido por estación" />
              <div className="p-4 sm:p-5">
                {stats.byStation.length ? (
                  <DistributionChart data={stats.byStation} />
                ) : (
                  <p className="py-16 text-center text-sm text-ink-400">
                    Cargá la estación en tus registros para ver este desglose.
                  </p>
                )}
              </div>
            </Card>
          </section>

          {/* ------------------------------- Tabla ------------------------------- */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="section-title">Historial de cargas</h2>
              <span className="text-xs text-ink-500">
                {stats.fills} registros · desde el {formatDate(stats.firstFillAt)}
              </span>
            </div>
            <RecordsTable
              records={[...stats.records].sort((a, b) => b.odometer - a.odometer)}
              vehicles={[vehicle]}
            />
          </section>
        </div>
      )}

      {/* ------------------------------ Zona peligro ------------------------------ */}
      <section className="mt-10 border-t border-white/6 pt-6">
        <h2 className="section-title mb-3">Administrar vehículo</h2>
        <div className="flex flex-wrap items-center gap-3">
          <form action={toggleArchiveVehicleAction}>
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <button type="submit" className="btn btn-secondary">
              {vehicle.isArchived ? "Desarchivar" : "Archivar"}
            </button>
          </form>
          <form action={deleteVehicleAction}>
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <ConfirmButton
              message={`¿Borrar "${vehicle.name}" y sus ${stats.fills} cargas? Esta acción no se puede deshacer.`}
              pendingLabel="Borrando…"
            >
              Borrar vehículo
            </ConfirmButton>
          </form>
          <p className="text-xs text-ink-500">
            Archivar lo saca de las listas pero conserva el historial. Borrar elimina también todas
            sus cargas.
          </p>
        </div>
      </section>
    </>
  );
}
