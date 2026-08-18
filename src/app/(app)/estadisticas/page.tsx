import Link from "next/link";
import type { Metadata } from "next";

import {
  ConsumptionChart,
  CostPerKmChart,
  DistanceChart,
  DistributionChart,
  MonthlySpendChart,
  PriceEvolutionChart,
} from "@/components/charts";
import { InsightsList } from "@/components/insights-list";
import { Card, CardHeader, ColorDot, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireSession } from "@/lib/auth/session";
import { fuelType } from "@/lib/catalogs";
import { formatCurrency, formatDate, formatKm, formatNumber } from "@/lib/format";
import { buildInsights } from "@/lib/insights";
import type { BreakdownSlice } from "@/lib/metrics";
import { getDashboardData } from "@/lib/queries";

export const metadata: Metadata = { title: "Estadísticas" };

function BreakdownTable({
  rows,
  firstColumn,
  unit = "L",
  /** Para el desglose por combustible, donde cada fila tiene su propia unidad. */
  unitOf,
}: {
  rows: BreakdownSlice[];
  firstColumn: string;
  unit?: string;
  unitOf?: (id: string) => string;
}) {
  if (!rows.length) {
    return <p className="px-5 py-10 text-center text-sm text-ink-400">Sin datos para mostrar.</p>;
  }

  return (
    <div className="table-wrap border-0">
      <table className="table min-w-[34rem]">
        <thead>
          <tr>
            <th>{firstColumn}</th>
            <th className="text-right">Cargas</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">Precio prom.</th>
            <th className="text-right">Gasto</th>
            <th className="text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="inline-flex items-center gap-2">
                  <ColorDot color={row.color} />
                  {row.label}
                </span>
              </td>
              <td className="tabular text-right">{row.fills}</td>
              <td className="tabular text-right">
                {formatNumber(row.liters, 1)} {unitOf ? unitOf(row.id) : unit}
              </td>
              <td className="tabular text-right">
                {row.avgPrice ? formatCurrency(row.avgPrice) : "—"}
              </td>
              <td className="tabular text-right font-semibold text-ink-50">
                {formatCurrency(row.spent)}
              </td>
              <td className="tabular text-right text-ink-400">{formatNumber(row.share, 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ vehiculo?: string }>;
}) {
  const { vehiculo } = await searchParams;
  const session = await requireSession();
  const { vehicles, stats, summary } = await getDashboardData(session.userId);

  if (!summary.fills) {
    return (
      <>
        <PageHeader title="Estadísticas" description="Acá vas a ver el análisis completo de tus cargas." />
        <EmptyState
          title="Todavía no hay datos para analizar"
          description="Registrá al menos dos cargas a tanque lleno y vas a poder ver consumo real, costo por kilómetro y evolución de precios."
          actionLabel="Registrar una carga"
          actionHref="/cargas/nueva"
        />
      </>
    );
  }

  const selected = vehiculo ? stats.find((s) => s.vehicleId === vehiculo) : null;
  const vehicle = selected ? vehicles.find((v) => v.id === selected.vehicleId) : null;

  /* Unidad del contexto: la del vehículo elegido, o la común de la flota. */
  const unit = selected?.unit ?? summary.unit;
  const unitLabel = unit ?? "unidad";
  const consumptionUnit = unit ? `${unit}/100km` : "por 100km";
  const quantityWord = unit === "L" ? "litros" : (unit ?? "cantidad");
  const mixedUnits = unit === null;

  /* Cuando hay un vehículo elegido se usan sus series; si no, las de toda la flota. */
  const monthly = selected ? selected.monthly : summary.monthly;
  const byStation = selected ? selected.byStation : summary.byStation;
  const byFuel = selected ? selected.byFuelType : summary.byFuelType;
  const byPayment = selected ? selected.byPaymentMethod : null;
  const priceSeries = selected
    ? selected.priceSeries
    : stats.flatMap((s) => s.priceSeries).sort((a, b) => a.timestamp - b.timestamp);

  const insights = selected ? buildInsights(selected) : [];

  /* Récords: los extremos suelen explicar mucho más que los promedios. */
  const allRecords = (selected ? selected.records : stats.flatMap((s) => s.records));
  const mostExpensive = [...allRecords].sort((a, b) => b.totalAmount - a.totalAmount)[0];
  const withConsumption = allRecords.filter((r) => r.consumption !== null);
  const best = [...withConsumption].sort((a, b) => a.consumption! - b.consumption!)[0];
  const worst = [...withConsumption].sort((a, b) => b.consumption! - a.consumption!)[0];

  const vatTotal = stats.reduce((sum, s) => sum + (s.totalVat ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description={
          selected
            ? `Análisis detallado de ${selected.vehicleName}.`
            : "Análisis de todos tus vehículos en conjunto."
        }
      >
        <Link href="/api/exportar" className="btn btn-secondary" prefetch={false}>
          Exportar CSV
        </Link>
      </PageHeader>

      {vehicles.length > 1 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/estadisticas"
            className={`chip transition ${!selected ? "border-accent/40 bg-accent/12 text-accent" : "hover:border-white/25"}`}
          >
            Toda la flota
          </Link>
          {vehicles.map((item) => (
            <Link
              key={item.id}
              href={`/estadisticas?vehiculo=${item.id}`}
              className={`chip transition ${
                selected?.vehicleId === item.id
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "hover:border-white/25"
              }`}
            >
              <ColorDot color={item.color} />
              {item.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        {/* -------------------------------- KPIs -------------------------------- */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Consumo promedio"
            value={
              (selected?.avgConsumption ?? summary.avgConsumption)
                ? `${formatNumber((selected?.avgConsumption ?? summary.avgConsumption)!, 2)} ${consumptionUnit}`
                : "—"
            }
            hint={
              selected
                ? `Mejor tramo: ${selected.bestConsumption ? formatNumber(selected.bestConsumption, 2) : "—"}`
                : mixedUnits
                  ? "Tus vehículos usan unidades distintas: elegí uno para verlo"
                  : undefined
            }
            accent="#22d3ee"
          />
          <StatCard
            label="Costo por kilómetro"
            value={
              (selected?.costPerKm ?? summary.costPerKm)
                ? formatCurrency(selected?.costPerKm ?? summary.costPerKm)
                : "—"
            }
            accent="#f472b6"
          />
          <StatCard
            label="Gasto total"
            value={formatCurrency(selected?.totalSpent ?? summary.totalSpent)}
            hint={
              (selected?.totalLiters ?? summary.totalLiters) !== null
                ? `${formatNumber((selected?.totalLiters ?? summary.totalLiters)!, 0)} ${quantityWord}`
                : "Cantidades en unidades distintas"
            }
            accent="#a78bfa"
          />
          <StatCard
            label="Distancia registrada"
            value={formatKm(selected?.totalDistance ?? summary.totalDistance)}
            accent="#34d399"
          />
        </section>

        {selected ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Gasto por día"
              value={selected.avgSpentPerDay ? formatCurrency(selected.avgSpentPerDay) : "—"}
              hint={selected.avgKmPerDay ? `${formatNumber(selected.avgKmPerDay, 0)} km por día` : undefined}
            />
            <StatCard
              label="Promedio por carga"
              value={selected.avgSpentPerFill ? formatCurrency(selected.avgSpentPerFill) : "—"}
              hint={
                selected.avgLitersPerFill
                  ? `${formatNumber(selected.avgLitersPerFill, 1)} ${selected.unit} por carga`
                  : undefined
              }
            />
            <StatCard
              label="Peor / mejor consumo"
              value={
                selected.worstConsumption && selected.bestConsumption
                  ? `${formatNumber(selected.worstConsumption, 1)} / ${formatNumber(selected.bestConsumption, 1)}`
                  : "—"
              }
              hint={`${selected.consumptionUnit} entre el tramo más y menos eficiente`}
            />
            <StatCard
              label="Autonomía"
              value={selected.estimatedRange ? formatKm(selected.estimatedRange) : "—"}
              hint={
                selected.estimatedFullTankCost
                  ? `Tanque lleno: ${formatCurrency(selected.estimatedFullTankCost)}`
                  : "Falta la capacidad del tanque"
              }
            />
          </section>
        ) : null}

        {insights.length ? (
          <section>
            <h2 className="section-title mb-3">Observaciones</h2>
            <InsightsList insights={insights} />
          </section>
        ) : null}

        {/* ------------------------------- Gráficos ------------------------------ */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader title={`Gasto y ${quantityWord} por mes`} />
            <div className="p-4 sm:p-5">
              <MonthlySpendChart data={monthly} unit={unit ?? "L"} />
            </div>
          </Card>

          {selected ? (
            <Card>
              <CardHeader
                title="Consumo por tramo"
                subtitle="Sólo tramos completos de tanque lleno a tanque lleno"
              />
              <div className="p-4 sm:p-5">
                {selected.consumptionSeries.length ? (
                  <ConsumptionChart
                    data={selected.consumptionSeries}
                    average={selected.avgConsumption}
                    target={vehicle?.targetConsumption ?? null}
                    unit={selected.unit}
                  />
                ) : (
                  <p className="py-16 text-center text-sm text-ink-400">
                    Todavía no hay tramos completos para graficar.
                  </p>
                )}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={`Precio por ${unitLabel}`}
              subtitle={
                mixedUnits
                  ? "Mezcla combustibles con unidades distintas: elegí un vehículo para leerlo bien"
                  : "Cada punto es una carga"
              }
            />
            <div className="p-4 sm:p-5">
              <PriceEvolutionChart data={priceSeries} unit={unit ?? "L"} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Kilómetros por mes" />
            <div className="p-4 sm:p-5">
              <DistanceChart data={monthly} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Costo por kilómetro" subtitle="Mes a mes" />
            <div className="p-4 sm:p-5">
              <CostPerKmChart data={monthly} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Gasto por estación" />
            <div className="p-4 sm:p-5">
              {byStation.length ? (
                <DistributionChart data={byStation} />
              ) : (
                <p className="py-16 text-center text-sm text-ink-400">Sin estaciones registradas.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Gasto por tipo de combustible" />
            <div className="p-4 sm:p-5">
              <DistributionChart data={byFuel} />
            </div>
          </Card>
        </section>

        {/* -------------------------------- Récords ------------------------------ */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="card-pad">
            <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Carga más cara</p>
            <p className="tabular mt-2 text-xl font-semibold text-ink-50">
              {mostExpensive ? formatCurrency(mostExpensive.totalAmount) : "—"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {mostExpensive
                ? `${formatDate(mostExpensive.filledAt)} · ${formatNumber(mostExpensive.liters, 1)} ${fuelType(mostExpensive.fuelType).unit}`
                : "Sin datos"}
            </p>
          </Card>
          <Card className="card-pad">
            <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Tramo más eficiente</p>
            <p className="tabular mt-2 text-xl font-semibold text-emerald-300">
              {best ? `${formatNumber(best.consumption!, 2)} ${consumptionUnit}` : "—"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {best
                ? `${formatDate(best.filledAt)} · ${formatNumber(best.kmPerLiter!, 2)} km/${unitLabel}`
                : "Sin datos"}
            </p>
          </Card>
          <Card className="card-pad">
            <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">Tramo menos eficiente</p>
            <p className="tabular mt-2 text-xl font-semibold text-rose-300">
              {worst ? `${formatNumber(worst.consumption!, 2)} ${consumptionUnit}` : "—"}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {worst
                ? `${formatDate(worst.filledAt)} · ${formatNumber(worst.kmPerLiter!, 2)} km/${unitLabel}`
                : "Sin datos"}
            </p>
          </Card>
        </section>

        {/* ------------------------------- Tablas -------------------------------- */}
        <section className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader title="Detalle por estación" subtitle="Dónde conviene cargar" />
            <BreakdownTable rows={byStation} firstColumn="Estación" unit={unitLabel} />
          </Card>

          <Card>
            <CardHeader title="Detalle por combustible" />
            <BreakdownTable
              rows={byFuel}
              firstColumn="Combustible"
              unitOf={(id) => fuelType(id).unit}
            />
          </Card>

          {byPayment?.length ? (
            <Card>
              <CardHeader title="Detalle por medio de pago" />
              <BreakdownTable rows={byPayment} firstColumn="Medio de pago" unit={unitLabel} />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Resumen mes a mes" />
            <div className="table-wrap border-0">
              <table className="table min-w-[42rem]">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="text-right">Cargas</th>
                    <th className="text-right">{unit === "L" ? "Litros" : unitLabel}</th>
                    <th className="text-right">Kilómetros</th>
                    <th className="text-right">Consumo</th>
                    <th className="text-right">Precio prom.</th>
                    <th className="text-right">$/km</th>
                    <th className="text-right">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthly].reverse().map((point) => (
                    <tr key={point.month}>
                      <td className="font-medium text-ink-100">{point.label}</td>
                      <td className="tabular text-right">{point.fills}</td>
                      <td className="tabular text-right">{formatNumber(point.liters, 1)}</td>
                      <td className="tabular text-right">{formatNumber(point.distance, 0)}</td>
                      <td className="tabular text-right">
                        {point.consumption ? formatNumber(point.consumption, 2) : "—"}
                      </td>
                      <td className="tabular text-right">
                        {point.avgPrice ? formatCurrency(point.avgPrice) : "—"}
                      </td>
                      <td className="tabular text-right">
                        {point.costPerKm ? formatCurrency(point.costPerKm) : "—"}
                      </td>
                      <td className="tabular text-right font-semibold text-ink-50">
                        {formatCurrency(point.spent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {vatTotal > 0 ? (
            <Card className="card-pad">
              <h3 className="section-title">Crédito fiscal acumulado</h3>
              <p className="tabular mt-2 text-2xl font-semibold text-ink-50">
                {formatCurrency(vatTotal)}
              </p>
              <p className="mt-1 text-sm text-ink-400">
                IVA discriminado en las cargas donde completaste los datos de la factura.
              </p>
            </Card>
          ) : null}
        </section>
      </div>
    </>
  );
}
