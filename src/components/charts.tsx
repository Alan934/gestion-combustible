"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BreakdownSlice, ConsumptionPoint, MonthlyPoint, PricePoint } from "@/lib/metrics";
import { formatCurrency, formatNumber } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/*                              Piezas compartidas                             */
/* -------------------------------------------------------------------------- */

const AXIS = {
  stroke: "#475569",
  tick: { fill: "#94a3b8", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

const GRID = { stroke: "#1e293b", strokeDasharray: "3 3", vertical: false } as const;

type TooltipRow = { label: string; value: string; color?: string };

function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-xl border border-white/12 bg-ink-900/95 px-3 py-2.5 shadow-xl backdrop-blur">
      <p className="mb-1.5 text-xs font-semibold text-ink-100">{title}</p>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            {row.color ? (
              <span className="size-2 rounded-full" style={{ backgroundColor: row.color }} />
            ) : null}
            <span className="text-ink-400">{row.label}</span>
            <span className="tabular ml-auto font-semibold text-ink-100">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Envoltorio con altura fija: `ResponsiveContainer` necesita un padre medible. */
function ChartFrame({ height = 280, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/* -------------------------------------------------------------------------- */
/*                      Gasto y litros por mes (barras + línea)                */
/* -------------------------------------------------------------------------- */

export function MonthlySpendChart({ data, unit = "L" }: { data: MonthlyPoint[]; unit?: string }) {
  const quantityLabel = unit === "L" ? "Litros" : unit;

  return (
    <ChartFrame height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis yAxisId="money" {...AXIS} tickFormatter={compactCurrency} width={52} />
        <YAxis
          yAxisId="liters"
          orientation="right"
          {...AXIS}
          tickFormatter={(v: number) => formatNumber(v, 0)}
          width={44}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as MonthlyPoint;
            return (
              <TooltipBox
                title={String(label)}
                rows={[
                  { label: "Gasto", value: formatCurrency(point.spent), color: "#22d3ee" },
                  { label: quantityLabel, value: formatNumber(point.liters, 1), color: "#a78bfa" },
                  { label: "Cargas", value: String(point.fills) },
                  {
                    label: "Precio prom.",
                    value: point.avgPrice ? formatCurrency(point.avgPrice) : "—",
                  },
                ]}
              />
            );
          }}
        />
        <Bar yAxisId="money" dataKey="spent" name="Gasto" fill="#22d3ee" radius={[6, 6, 0, 0]} maxBarSize={44} />
        <Line
          yAxisId="liters"
          type="monotone"
          dataKey="liters"
          name={quantityLabel}
          stroke="#a78bfa"
          strokeWidth={2}
          dot={{ r: 3, fill: "#a78bfa", strokeWidth: 0 }}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Evolución del precio por litro                     */
/* -------------------------------------------------------------------------- */

export function PriceEvolutionChart({ data, unit = "L" }: { data: PricePoint[]; unit?: string }) {
  const series = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        shortDate: new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${point.date}T12:00:00Z`)),
      })),
    [data],
  );

  return (
    <ChartFrame height={280}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="shortDate" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} tickFormatter={compactCurrency} width={56} domain={["auto", "auto"]} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as (typeof series)[number];
            return (
              <TooltipBox
                title={point.shortDate}
                rows={[
                  {
                    label: "Precio",
                    value: formatCurrency(point.pricePerLiter),
                    color: "#fbbf24",
                  },
                  { label: "Combustible", value: point.fuelLabel },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="pricePerLiter"
          name={`Precio por ${unit}`}
          stroke="#fbbf24"
          strokeWidth={2}
          fill="url(#priceFill)"
          dot={{ r: 2.5, fill: "#fbbf24", strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Consumo tramo a tramo                            */
/* -------------------------------------------------------------------------- */

export function ConsumptionChart({
  data,
  average,
  target,
  unit = "L",
}: {
  data: ConsumptionPoint[];
  average?: number | null;
  target?: number | null;
  unit?: string;
}) {
  const series = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        shortDate: new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${point.date}T12:00:00Z`)),
      })),
    [data],
  );

  return (
    <ChartFrame height={280}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="consumptionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="shortDate" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={44} domain={["auto", "auto"]} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as (typeof series)[number];
            return (
              <TooltipBox
                title={point.shortDate}
                rows={[
                  {
                    label: "Consumo",
                    value: `${formatNumber(point.consumption, 2)} ${unit}/100km`,
                    color: "#22d3ee",
                  },
                  {
                    label: "Rendimiento",
                    value: `${formatNumber(point.kmPerLiter, 2)} km/${unit}`,
                  },
                  { label: "Costo por km", value: formatCurrency(point.costPerKm) },
                  { label: "Odómetro", value: `${formatNumber(point.odometer, 0)} km` },
                ]}
              />
            );
          }}
        />
        {average ? (
          <ReferenceLine
            y={average}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{
              value: `Promedio ${formatNumber(average, 1)}`,
              position: "insideTopRight",
              fill: "#94a3b8",
              fontSize: 11,
            }}
          />
        ) : null}
        {target ? (
          <ReferenceLine
            y={target}
            stroke="#34d399"
            strokeDasharray="4 4"
            label={{
              value: `Fábrica ${formatNumber(target, 1)}`,
              position: "insideBottomRight",
              fill: "#34d399",
              fontSize: 11,
            }}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="consumption"
          name={`${unit}/100km`}
          stroke="#22d3ee"
          strokeWidth={2}
          fill="url(#consumptionFill)"
          dot={{ r: 3, fill: "#22d3ee", strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Distribución del gasto (dona)                        */
/* -------------------------------------------------------------------------- */

export function DistributionChart({ data }: { data: BreakdownSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.spent, 0);

  return (
    <ChartFrame height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="spent"
          nameKey="label"
          innerRadius={62}
          outerRadius={96}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((slice) => (
            <Cell key={slice.id} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const slice = payload[0].payload as BreakdownSlice;
            return (
              <TooltipBox
                title={slice.label}
                rows={[
                  { label: "Gasto", value: formatCurrency(slice.spent), color: slice.color },
                  { label: "Participación", value: `${formatNumber(slice.share, 1)}%` },
                  { label: "Cargas", value: String(slice.fills) },
                  {
                    label: "Precio prom.",
                    value: slice.avgPrice ? formatCurrency(slice.avgPrice) : "—",
                  },
                ]}
              />
            );
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-ink-300">{value}</span>}
        />
        {total > 0 ? null : null}
      </PieChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Kilómetros recorridos por mes                        */
/* -------------------------------------------------------------------------- */

export function DistanceChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ChartFrame height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v: number) => formatNumber(v, 0)} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as MonthlyPoint;
            return (
              <TooltipBox
                title={String(label)}
                rows={[
                  {
                    label: "Kilómetros",
                    value: `${formatNumber(point.distance, 0)} km`,
                    color: "#34d399",
                  },
                  {
                    label: "Costo por km",
                    value: point.costPerKm ? formatCurrency(point.costPerKm) : "—",
                  },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="distance" name="Km" fill="#34d399" radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                      Costo por kilómetro mes a mes                          */
/* -------------------------------------------------------------------------- */

export function CostPerKmChart({ data }: { data: MonthlyPoint[] }) {
  const series = data.filter((point) => point.costPerKm !== null);

  return (
    <ChartFrame height={260}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f472b6" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compactCurrency} width={56} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as MonthlyPoint;
            return (
              <TooltipBox
                title={String(label)}
                rows={[
                  {
                    label: "Costo por km",
                    value: formatCurrency(point.costPerKm ?? 0),
                    color: "#f472b6",
                  },
                  { label: "Kilómetros", value: `${formatNumber(point.distance, 0)} km` },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="costPerKm"
          name="Costo por km"
          stroke="#f472b6"
          strokeWidth={2}
          fill="url(#costFill)"
          dot={{ r: 3, fill: "#f472b6", strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/*                  Comparación de gasto mensual entre vehículos               */
/* -------------------------------------------------------------------------- */

export function VehicleComparisonChart({
  months,
  series,
}: {
  months: string[];
  series: { id: string; name: string; color: string; values: Record<string, number> }[];
}) {
  const data = months.map((month) => {
    const row: Record<string, string | number> = { label: month };
    for (const vehicle of series) row[vehicle.id] = vehicle.values[month] ?? 0;
    return row;
  });

  return (
    <ChartFrame height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compactCurrency} width={52} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <TooltipBox
                title={String(label)}
                rows={payload.map((entry) => {
                  const vehicle = series.find((s) => s.id === entry.dataKey);
                  return {
                    label: vehicle?.name ?? String(entry.dataKey),
                    value: formatCurrency(Number(entry.value)),
                    color: vehicle?.color,
                  };
                })}
              />
            );
          }}
        />
        <Legend
          verticalAlign="top"
          height={32}
          formatter={(value) => {
            const vehicle = series.find((s) => s.id === value);
            return <span className="text-xs text-ink-300">{vehicle?.name ?? value}</span>;
          }}
        />
        {series.map((vehicle) => (
          <Bar
            key={vehicle.id}
            dataKey={vehicle.id}
            name={vehicle.id}
            fill={vehicle.color}
            radius={[5, 5, 0, 0]}
            maxBarSize={30}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}
