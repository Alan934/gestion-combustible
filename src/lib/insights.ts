import { station } from "@/lib/catalogs";
import { formatCurrency, formatNumber, formatPercent, round } from "@/lib/format";
import type { VehicleStats } from "@/lib/metrics";

export type Insight = {
  id: string;
  tone: "good" | "bad" | "neutral" | "warning";
  title: string;
  text: string;
};

const MS_PER_DAY = 86_400_000;

/**
 * Desglose por estación limitado al combustible principal. En un bicombustible,
 * el precio promedio de una estación que mezcla nafta y GNC no es comparable
 * contra el de otra que sólo vendió gas.
 */
function buildPrimaryStationSlices(stats: VehicleStats) {
  const own = stats.records.filter((r) => r.fuelType === stats.primaryFuelTypeId);
  const groups = new Map<string, { spent: number; quantity: number; fills: number }>();

  for (const record of own) {
    const key = record.station ?? "otra";
    const bucket = groups.get(key) ?? { spent: 0, quantity: 0, fills: 0 };
    bucket.spent += record.totalAmount;
    bucket.quantity += record.liters;
    bucket.fills += 1;
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([id, bucket]) => ({
    id,
    label: station(id).label,
    fills: bucket.fills,
    avgPrice: bucket.quantity > 0 ? round(bucket.spent / bucket.quantity, 2) : null,
  }));
}

/**
 * Traduce las métricas a observaciones en castellano. La idea es que el usuario
 * no tenga que interpretar los gráficos: si algo cambió, se lo decimos.
 */
export function buildInsights(stats: VehicleStats): Insight[] {
  const insights: Insight[] = [];
  const unit = stats.consumptionUnit;
  /** "litro" para líquidos, "m³" para GNC: se usa en el cuerpo de los textos. */
  const unitName = stats.unit === "L" ? "litro" : stats.unit;

  /* --- Tendencia del consumo: últimos 3 tramos contra los 3 anteriores --- */
  // Sólo los del combustible principal: en un dual, comparar un tramo a nafta
  // con uno a gas sería comparar litros con metros cúbicos.
  const legs = stats.records
    .filter((r) => r.consumption !== null && r.fuelType === stats.primaryFuelTypeId)
    .sort((a, b) => a.odometer - b.odometer)
    .map((r) => r.consumption!);

  if (legs.length >= 4) {
    const window = Math.min(3, Math.floor(legs.length / 2));
    const recent = legs.slice(-window);
    const previous = legs.slice(-window * 2, -window);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
    const change = round(((recentAvg - previousAvg) / previousAvg) * 100, 1);

    if (Math.abs(change) >= 3) {
      insights.push({
        id: "consumption-trend",
        tone: change > 0 ? "bad" : "good",
        title: change > 0 ? "El consumo está subiendo" : "El consumo está bajando",
        text: `En los últimos ${window} tramos promediaste ${formatNumber(recentAvg, 2)} ${unit} contra ${formatNumber(previousAvg, 2)} de los ${window} anteriores (${formatPercent(change)}). ${
          change > 0
            ? "Puede ser presión de neumáticos, filtro de aire, más ciudad que ruta o carga extra."
            : "Buen momento para sostener el estilo de manejo que venís usando."
        }`,
      });
    }
  }

  /* --- Consumo real contra el declarado por el fabricante --- */
  if (stats.consumptionVsTargetPct !== null && stats.avgConsumption !== null) {
    const over = stats.consumptionVsTargetPct > 0;
    insights.push({
      id: "vs-target",
      tone: Math.abs(stats.consumptionVsTargetPct) < 10 ? "neutral" : over ? "warning" : "good",
      title: over ? "Consumís más que el dato de fábrica" : "Consumís menos que el dato de fábrica",
      text: `Tu promedio real es ${formatNumber(stats.avgConsumption, 2)} ${unit}, ${formatPercent(
        stats.consumptionVsTargetPct,
      )} respecto del consumo de referencia que cargaste. Una diferencia de hasta 15% es normal en uso mixto.`,
    });
  }

  /* --- Cuánto aumentó el litro desde la primera carga --- */
  if (stats.priceChangePct !== null && stats.firstPricePerLiter && stats.lastPricePerLiter) {
    const days =
      stats.firstFillAt && stats.lastFillAt
        ? Math.max(1, Math.round((stats.lastFillAt.getTime() - stats.firstFillAt.getTime()) / MS_PER_DAY))
        : null;

    insights.push({
      id: "price-change",
      tone: stats.priceChangePct > 0 ? "warning" : "good",
      title: `El ${unitName} ${stats.priceChangePct > 0 ? "aumentó" : "bajó"} ${formatPercent(stats.priceChangePct)}`,
      text: `Pasó de ${formatCurrency(stats.firstPricePerLiter)} a ${formatCurrency(stats.lastPricePerLiter)}${
        days ? ` en ${days} días` : ""
      }. Al ritmo de consumo actual, eso son ${formatCurrency(
        (stats.lastPricePerLiter - stats.firstPricePerLiter) * (stats.avgLitersPerFill ?? 0),
      )} más por carga.`,
    });
  }

  /* --- Bicombustible: cuál de los dos conviene --- */
  if (stats.dualComparison) {
    const { cheaper, pricier, savingPerKm, savingPct } = stats.dualComparison;
    insights.push({
      id: "dual-comparison",
      tone: "good",
      title: `${cheaper.label} te sale ${formatNumber(savingPct, 0)}% más barato por kilómetro`,
      text: `${formatCurrency(cheaper.costPerKm)} el kilómetro contra ${formatCurrency(pricier.costPerKm)} con ${pricier.label}. Cada 1.000 km hechos con ${cheaper.label} te ahorrás ${formatCurrency(savingPerKm * 1000)}.${
        stats.avgKmPerDay
          ? ` Al ritmo que manejás, son ${formatCurrency(savingPerKm * stats.avgKmPerDay * 30)} por mes.`
          : ""
      }`,
    });
  }

  /* --- ¿Alguna estación te conviene? --- */
  // El precio promedio por estación sólo es comparable dentro del mismo
  // combustible: en un dual se toma el principal.
  const stationsWithData = (
    stats.fuelPerformance.length > 1
      ? buildPrimaryStationSlices(stats)
      : stats.byStation
  ).filter((s) => s.fills >= 2 && s.avgPrice !== null);
  if (stationsWithData.length >= 2) {
    const sorted = [...stationsWithData].sort((a, b) => a.avgPrice! - b.avgPrice!);
    const cheapest = sorted[0];
    const priciest = sorted[sorted.length - 1];
    const gap = round(((priciest.avgPrice! - cheapest.avgPrice!) / cheapest.avgPrice!) * 100, 1);

    if (gap >= 2) {
      const savingPerFill = (priciest.avgPrice! - cheapest.avgPrice!) * (stats.avgLitersPerFill ?? 0);
      insights.push({
        id: "cheapest-station",
        tone: "good",
        title: `${cheapest.label} te sale más barata`,
        text: `Promediás ${formatCurrency(cheapest.avgPrice)} por ${unitName} en ${cheapest.label} contra ${formatCurrency(priciest.avgPrice)} en ${priciest.label} (${formatNumber(gap, 1)}% de diferencia). Cargando siempre en la más barata ahorrarías cerca de ${formatCurrency(savingPerFill)} por carga.`,
      });
    }
  }

  /* --- Proyección del gasto mensual --- */
  if (stats.projectedMonthlySpend) {
    insights.push({
      id: "projection",
      tone: "neutral",
      title: "Proyección de gasto mensual",
      text: `Según los últimos meses cerrados, este vehículo te cuesta alrededor de ${formatCurrency(
        stats.projectedMonthlySpend,
      )} por mes${
        stats.avgSpentPerDay ? ` (${formatCurrency(stats.avgSpentPerDay)} por día)` : ""
      }. Serían ${formatCurrency(stats.projectedMonthlySpend * 12)} al año.`,
    });
  }

  /* --- Autonomía y próxima carga --- */
  if (stats.estimatedRange && stats.avgKmPerDay) {
    const daysPerTank = round(stats.estimatedRange / stats.avgKmPerDay, 0);
    insights.push({
      id: "range",
      tone: "neutral",
      title: "Autonomía estimada",
      text: `Con el tanque lleno recorrés unos ${formatNumber(stats.estimatedRange, 0)} km. Manejando ${formatNumber(
        stats.avgKmPerDay,
        0,
      )} km por día en promedio, eso te dura cerca de ${daysPerTank} días entre cargas.`,
    });
  }

  /* --- Calidad de los datos --- */
  const unusable = stats.records.filter(
    (r) => r.consumption === null && r.distance !== null && r.distance > 0,
  ).length;
  if (stats.fills >= 3 && unusable > 0) {
    const ratio = round((unusable / stats.fills) * 100, 0);
    if (ratio >= 30) {
      insights.push({
        id: "data-quality",
        tone: "warning",
        title: "Hay tramos sin consumo calculable",
        text: `${unusable} de ${stats.fills} cargas no aportan al promedio de consumo, por ser parciales o por cargas salteadas. Si llenás el tanque y registrás todas las cargas, el número se vuelve mucho más preciso.`,
      });
    }
  }

  if (stats.fills > 0 && stats.fills < 2) {
    insights.push({
      id: "need-more-data",
      tone: "neutral",
      title: "Falta una carga más",
      text: "El consumo se calcula entre dos cargas a tanque lleno. Registrá la próxima y vas a empezar a ver consumo real, costo por kilómetro y autonomía.",
    });
  }

  return insights;
}
