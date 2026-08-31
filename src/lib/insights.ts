import { station } from "@/lib/catalogs";
import { formatCurrency, formatKm, formatNumber, formatPercent, round } from "@/lib/format";
import type { VehicleStats } from "@/lib/metrics";

export type Insight = {
  id: string;
  tone: "good" | "bad" | "neutral" | "warning";
  title: string;
  text: string;
};

const MS_PER_DAY = 86_400_000;

/* ------------------------- Banda de plausibilidad ------------------------- */

/**
 * Cuánto se puede apartar un tramo de la banda propia del vehículo antes de
 * marcarlo. 3,5 sigmas robustas: alto a propósito, porque el consumo real varía
 * bastante entre ciudad y ruta y una alerta que salta seguido se ignora.
 */
const OUTLIER_SIGMAS = 3.5;

/**
 * Dispersión mínima, como fracción de la mediana. Un historial muy parejo daría
 * una MAD casi nula y entonces cualquier variación normal parecería una anomalía.
 */
const MIN_RELATIVE_DISPERSION = 0.05;

/** Tramos mínimos para que la banda propia signifique algo. */
const MIN_LEGS_FOR_BAND = 6;

/**
 * Banda físicamente alcanzable respecto del consumo declarado. Deliberadamente
 * ancha: no busca detectar "manejás mal", busca detectar "este número no puede
 * salir de este motor" —un odómetro mal tipeado, una carga sin registrar, una
 * pérdida—. La comparación fina contra fábrica ya la hace `vs-target`.
 */
const PLAUSIBLE_VS_TARGET = { min: 0.7, max: 1.8 };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Desviación absoluta mediana, escalada (×1,4826) para leerse como un desvío
 * estándar. Se usa la versión robusta y no el desvío común porque los outliers
 * son justamente lo que estamos buscando: incluirlos en la medida de dispersión
 * los volvería invisibles.
 */
function madSigma(values: number[], center: number) {
  return median(values.map((v) => Math.abs(v - center))) * 1.4826;
}

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
  const legRecords = stats.records
    .filter((r) => r.consumption !== null && r.fuelType === stats.primaryFuelTypeId)
    .sort((a, b) => a.odometer - b.odometer);
  const legs = legRecords.map((r) => r.consumption!);

  /* --- ¿El número es siquiera posible para este motor? --- */
  /**
   * Chequeo contra la banda física del vehículo. A diferencia de `vs-target`,
   * que informa una diferencia normal contra fábrica, este marca valores que no
   * pueden salir del motor y por lo tanto apuntan a un dato mal cargado.
   *
   * Cuando el consumo es estimado (ver `estimateConsumption`), el margen juega
   * a favor: sólo se marca si ni siquiera el extremo más cercano a la banda
   * entra. Una estimación imprecisa no debería generar una alarma.
   */
  const plausibilityValue = stats.avgConsumption ?? stats.estimatedConsumption;
  const plausibilityMargin = stats.avgConsumption !== null ? 0 : (stats.estimatedMargin ?? 0);
  const isEstimated = stats.avgConsumption === null && plausibilityValue !== null;

  let implausible = false;

  if (stats.targetConsumption && plausibilityValue !== null) {
    const floor = stats.targetConsumption * PLAUSIBLE_VS_TARGET.min;
    const ceiling = stats.targetConsumption * PLAUSIBLE_VS_TARGET.max;
    const tooLow = plausibilityValue + plausibilityMargin < floor;
    const tooHigh = plausibilityValue - plausibilityMargin > ceiling;
    implausible = tooLow || tooHigh;

    if (implausible) {
      const cual = isEstimated ? "El consumo estimado" : "Tu promedio";
      insights.push({
        id: "implausible-consumption",
        tone: "warning",
        title: tooLow
          ? "Ese consumo es demasiado bajo para ser real"
          : "Ese consumo es demasiado alto para ser real",
        text: `${cual} da ${formatNumber(plausibilityValue, 2)} ${unit}, fuera de lo que puede rendir este motor (entre ${formatNumber(
          floor,
          1,
        )} y ${formatNumber(ceiling, 1)} ${unit} según el consumo de referencia que cargaste). ${
          tooLow
            ? "Casi siempre es una carga que no quedó registrada o un odómetro cargado de más: los kilómetros están, los litros no."
            : "Revisá que el odómetro esté bien cargado; si los datos están bien, puede ser presión de neumáticos, filtro de aire, una pérdida o combustible que se está yendo."
        }`,
      });
    }
  }

  /* --- ¿Este tramo se sale de la banda del propio vehículo? --- */
  /**
   * La referencia más confiable de un vehículo es su propio historial: no hace
   * falta que el usuario cargue nada y se calibra solo. Se mira sólo el último
   * tramo —avisar por uno de hace dos años no sirve para nada—, y se menciona
   * cuántos otros quedaron fuera para dar contexto.
   */
  if (legs.length >= MIN_LEGS_FOR_BAND) {
    const center = median(legs);
    const dispersion = Math.max(madSigma(legs, center), center * MIN_RELATIVE_DISPERSION);
    const isOutlier = (value: number) => Math.abs(value - center) > OUTLIER_SIGMAS * dispersion;

    const last = legRecords[legRecords.length - 1];
    const lastValue = last.consumption!;

    if (isOutlier(lastValue)) {
      const high = lastValue > center;
      const others = legs.slice(0, -1).filter(isOutlier).length;

      insights.push({
        id: "outlier-leg",
        tone: "warning",
        title: high
          ? "El último tramo consumió mucho más de lo habitual"
          : "El último tramo consumió mucho menos de lo habitual",
        text: `El tramo que cierra en ${formatKm(last.odometer)} dio ${formatNumber(
          lastValue,
          2,
        )} ${unit} contra ${formatNumber(center, 2)} que venís promediando. ${
          high
            ? "Puede ser un viaje muy distinto al habitual —ciudad, remolque, ralentí— o algo que empezó a fallar."
            : "Un tramo tan eficiente suele significar que faltó registrar una carga en el medio, o que el tanque no quedó realmente lleno."
        }${
          others > 0
            ? ` Otros ${others} ${others === 1 ? "tramo quedó" : "tramos quedaron"} igual de lejos del promedio, así que puede ser un problema de cómo se registran las cargas más que del vehículo.`
            : " Es el único tramo así en todo el historial."
        }`,
      });
    }
  }

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
  if (!implausible && stats.consumptionVsTargetPct !== null && stats.avgConsumption !== null) {
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

  /**
   * Sin consumo de referencia el chequeo de plausibilidad no tiene ancla y
   * nunca se dispara. Se avisa recién cuando ya hay historial: antes de eso el
   * dato no habilitaría nada y sería sólo un pedido más en el alta.
   */
  if (stats.fills >= 6 && stats.avgConsumption !== null && !stats.targetConsumption) {
    insights.push({
      id: "missing-target",
      tone: "neutral",
      title: "Falta el consumo de referencia",
      text: `Si cargás en el vehículo el consumo declarado por el fabricante, podemos avisarte cuando un número se va de lo que este motor puede rendir —típicamente una carga sin registrar o un odómetro mal tipeado—. Hoy promediás ${formatNumber(
        stats.avgConsumption,
        2,
      )} ${unit}.`,
    });
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
