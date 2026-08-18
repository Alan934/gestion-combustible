import { CHART_PALETTE, fuelType, fuelUnit, station as stationInfo } from "@/lib/catalogs";
import { round } from "@/lib/format";
import type { FuelRecord, Vehicle } from "@/lib/db/schema";

/* -------------------------------------------------------------------------- */
/*                                   Tipos                                     */
/* -------------------------------------------------------------------------- */

/** Una carga enriquecida con todo lo que se puede deducir del tramo anterior. */
export type EnrichedRecord = FuelRecord & {
  /** Kilómetros recorridos desde la carga anterior. */
  distance: number | null;
  /** Días transcurridos desde la carga anterior. */
  daysSincePrevious: number | null;
  /** Consumo del tramo en L/100km. Sólo en tramos "lleno a lleno". */
  consumption: number | null;
  /** Rendimiento del tramo en km/L. */
  kmPerLiter: number | null;
  /** Costo por kilómetro del tramo. */
  costPerKm: number | null;
  /** Litros efectivamente consumidos en el tramo (puede abarcar varias cargas). */
  legLiters: number | null;
  /** Gasto acumulado del tramo. */
  legCost: number | null;
  /**
   * Dentro del tramo hubo cargas del otro combustible (vehículo dual): parte de
   * esos kilómetros no se hicieron con este combustible, así que el consumo es
   * una estimación por exceso de eficiencia.
   */
  legHasOtherFuel: boolean;
  /** Por qué no se pudo calcular el consumo de esta carga. */
  consumptionNote: string | null;
};

/** Rendimiento de un combustible dentro de un mismo vehículo. */
export type FuelPerformance = {
  fuelTypeId: string;
  label: string;
  color: string;
  unit: string;
  consumptionUnit: string;
  efficiencyUnit: string;

  fills: number;
  quantity: number;
  spent: number;
  /** Porcentaje del gasto total del vehículo. */
  share: number;

  avgPrice: number | null;
  lastPrice: number | null;
  avgConsumption: number | null;
  avgKmPerUnit: number | null;
  costPerKm: number | null;
  measuredDistance: number;
  /**
   * Tramos descartados por haber tenido cargas del otro combustible en el medio.
   * Si son muchos y no hay ninguno limpio, este combustible no tiene consumo
   * medible todavía.
   */
  excludedLegs: number;

  consumptionSeries: ConsumptionPoint[];
  priceSeries: PricePoint[];
};

export type DualComparison = {
  cheaper: FuelPerformance;
  pricier: FuelPerformance;
  savingPerKm: number;
  savingPct: number;
};

export type MonthlyPoint = {
  month: string;
  label: string;
  spent: number;
  liters: number;
  distance: number;
  fills: number;
  avgPrice: number | null;
  consumption: number | null;
  costPerKm: number | null;
};

export type BreakdownSlice = {
  id: string;
  label: string;
  color: string;
  spent: number;
  liters: number;
  fills: number;
  avgPrice: number | null;
  share: number;
};

export type PricePoint = {
  date: string;
  timestamp: number;
  pricePerLiter: number;
  fuelTypeId: string;
  fuelLabel: string;
  station: string | null;
};

export type ConsumptionPoint = {
  date: string;
  timestamp: number;
  odometer: number;
  consumption: number;
  kmPerLiter: number;
  costPerKm: number;
};

export type VehicleStats = {
  vehicleId: string;
  vehicleName: string;
  color: string;
  records: EnrichedRecord[];

  /* Unidades: no todos los combustibles se miden en litros */
  /** "L" para líquidos, "m³" para GNC, "kWh" para eléctrico. */
  unit: string;
  /** "L/100km", "m³/100km"… */
  consumptionUnit: string;
  /** "km/L", "km/m³"… */
  efficiencyUnit: string;
  /**
   * El vehículo tiene cargas en más de una unidad (típicamente un dual
   * nafta + GNC). Los totales y el consumo promedio mezclan unidades y no se
   * pueden interpretar como un número solo.
   */
  mixedFuelUnits: boolean;

  /* Bicombustible */
  /** El vehículo tiene declarado un segundo combustible (típicamente GNC). */
  isDual: boolean;
  /** Combustible al que se refieren los indicadores de cabecera. */
  primaryFuelTypeId: string | null;
  /** Rendimiento de cada combustible por separado, ordenado por gasto. */
  fuelPerformance: FuelPerformance[];
  /** Cuál de los dos sale más barato por kilómetro y cuánto se ahorra. */
  dualComparison: DualComparison | null;

  /* Totales */
  fills: number;
  totalLiters: number;
  totalSpent: number;
  totalDistance: number;
  firstFillAt: Date | null;
  lastFillAt: Date | null;
  currentOdometer: number | null;

  /* Consumo (sólo tramos válidos "lleno a lleno") */
  avgConsumption: number | null;
  bestConsumption: number | null;
  worstConsumption: number | null;
  lastConsumption: number | null;
  avgKmPerLiter: number | null;
  measuredDistance: number;
  measuredLiters: number;

  /* Costos */
  costPerKm: number | null;
  costPer100Km: number | null;
  avgPricePerLiter: number | null;
  lastPricePerLiter: number | null;
  firstPricePerLiter: number | null;
  priceChangePct: number | null;
  avgSpentPerFill: number | null;
  avgLitersPerFill: number | null;

  /* Hábitos */
  avgDaysBetweenFills: number | null;
  avgKmBetweenFills: number | null;
  avgKmPerDay: number | null;
  avgSpentPerDay: number | null;
  avgSpentPerMonth: number | null;

  /* Proyecciones */
  estimatedRange: number | null;
  estimatedFullTankCost: number | null;
  projectedMonthlySpend: number | null;
  consumptionVsTargetPct: number | null;

  /* Fiscal */
  totalVat: number | null;

  /* Series */
  monthly: MonthlyPoint[];
  priceSeries: PricePoint[];
  consumptionSeries: ConsumptionPoint[];
  byStation: BreakdownSlice[];
  byFuelType: BreakdownSlice[];
  byPaymentMethod: BreakdownSlice[];
};

/* -------------------------------------------------------------------------- */
/*                                  Utilidades                                 */
/* -------------------------------------------------------------------------- */

const TZ = "America/Argentina/Buenos_Aires";
const MS_PER_DAY = 86_400_000;

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: TZ,
});

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});

/** Clave "YYYY-MM" en horario argentino. */
export function monthKey(date: Date) {
  return monthFormatter.format(date).slice(0, 7);
}

export function dayKey(date: Date) {
  return dayFormatter.format(date);
}

export function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return `${label.replace(".", "")} ${String(year).slice(2)}`;
}

function safeDiv(a: number, b: number) {
  return b > 0 && Number.isFinite(a / b) ? a / b : null;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/* -------------------------------------------------------------------------- */
/*                          Enriquecido de las cargas                          */
/* -------------------------------------------------------------------------- */

/**
 * Calcula, para cada carga, distancia y consumo del tramo previo.
 *
 * El consumo se calcula con el método **"lleno a lleno"**: el único momento en
 * que se conoce con certeza cuánto combustible había en el tanque es cuando está
 * lleno. Entonces, entre dos cargas a tanque lleno, los litros cargados en el
 * medio son exactamente los litros consumidos en esos kilómetros. Las cargas
 * parciales suman litros al tramo pero no lo cierran.
 *
 * En un vehículo **bicombustible** (nafta + GNC) cada combustible lleva su
 * propia cadena: el tramo de GNC va de una carga de GNC a la siguiente, sin
 * mezclarse con las de nafta. Eso resuelve el problema de sumar litros con m³,
 * pero deja uno abierto: el odómetro no distingue con qué combustible hiciste
 * cada kilómetro. Si dentro del tramo hubo cargas del otro combustible, el
 * consumo queda marcado como estimado (`legHasOtherFuel`).
 */
export function enrichRecords(records: FuelRecord[]): EnrichedRecord[] {
  const sorted = [...records].sort((a, b) => {
    const byOdo = a.odometer - b.odometer;
    if (byOdo !== 0) return byOdo;
    return a.filledAt.getTime() - b.filledAt.getTime();
  });

  const enriched: EnrichedRecord[] = sorted.map((record, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    return {
      ...record,
      // Distancia y días son globales: van contra la carga anterior, sea del
      // combustible que sea.
      distance: previous ? round(record.odometer - previous.odometer, 1) : null,
      daysSincePrevious: previous
        ? round((record.filledAt.getTime() - previous.filledAt.getTime()) / MS_PER_DAY, 1)
        : null,
      consumption: null,
      kmPerLiter: null,
      costPerKm: null,
      legLiters: null,
      legCost: null,
      legHasOtherFuel: false,
      consumptionNote: null,
    };
  });

  const fuelsPresent = new Set(enriched.map((record) => record.fuelType));

  /* Una pasada de "lleno a lleno" por cada combustible. */
  for (const fuel of fuelsPresent) {
    // Índices dentro de `enriched`, en orden de odómetro, sólo de este combustible.
    const chain = enriched
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.fuelType === fuel);

    /** Posición en `chain` de la última carga a tanque lleno. */
    let anchor: number | null = null;
    let pendingLiters = 0;
    let pendingCost = 0;
    let brokenChain = false;

    chain.forEach(({ record }, position) => {
      if (record.missedPreviousFill) brokenChain = true;

      if (anchor === null) {
        record.consumptionNote = record.isFullTank
          ? "Primera carga a tanque lleno de este combustible: sirve como punto de partida."
          : "Todavía no hay una carga a tanque lleno de referencia para este combustible.";
      } else {
        pendingLiters += record.liters;
        pendingCost += record.totalAmount;

        if (!record.isFullTank) {
          record.consumptionNote = "Carga parcial: se suma al próximo tramo completo.";
        } else if (brokenChain) {
          record.consumptionNote = "Se salteó una carga: el tramo no es confiable.";
        } else {
          const anchorRecord = chain[anchor].record;
          const legDistance = round(record.odometer - anchorRecord.odometer, 1);

          // ¿Hubo cargas de otro combustible entre el anchor y esta carga? Si las
          // hubo, parte de esos kilómetros se hicieron con el otro combustible y
          // el odómetro no permite saber cuántos.
          record.legHasOtherFuel = enriched.some(
            (other) =>
              other.fuelType !== fuel &&
              other.odometer > anchorRecord.odometer &&
              other.odometer <= record.odometer,
          );

          if (record.legHasOtherFuel) {
            /**
             * Se descarta en vez de estimarse. Un tramo de nafta que en el medio
             * tuvo cargas de GNC daría un consumo absurdamente bajo —los litros
             * de nafta repartidos sobre kilómetros que en realidad hiciste a
             * gas—. Mostrar ese número, aunque sea con una advertencia al lado,
             * es peor que no mostrar nada.
             */
            record.consumptionNote =
              "En este tramo también cargaste el otro combustible: no se puede saber cuántos kilómetros hiciste con cada uno.";
          } else if (legDistance > 0 && pendingLiters > 0) {
            record.legLiters = round(pendingLiters, 3);
            record.legCost = round(pendingCost, 2);
            record.consumption = round((pendingLiters / legDistance) * 100, 2);
            record.kmPerLiter = round(legDistance / pendingLiters, 2);
            record.costPerKm = round(pendingCost / legDistance, 2);
          } else {
            record.consumptionNote =
              legDistance <= 0
                ? "El odómetro no avanzó respecto de la carga anterior de este combustible."
                : "Sin cantidad registrada en el tramo.";
          }
        }
      }

      // El anchor sólo se mueve en cargas a tanque lleno.
      if (record.isFullTank) {
        anchor = position;
        pendingLiters = 0;
        pendingCost = 0;
        brokenChain = false;
      }
    });
  }

  return enriched;
}

/* -------------------------------------------------------------------------- */
/*                            Estadísticas por vehículo                        */
/* -------------------------------------------------------------------------- */

function buildBreakdown(
  records: FuelRecord[],
  keyOf: (r: FuelRecord) => string,
  labelOf: (key: string) => string,
  colorOf: (key: string, index: number) => string,
): BreakdownSlice[] {
  const groups = new Map<string, { spent: number; liters: number; fills: number }>();

  for (const record of records) {
    const key = keyOf(record);
    const bucket = groups.get(key) ?? { spent: 0, liters: 0, fills: 0 };
    bucket.spent += record.totalAmount;
    bucket.liters += record.liters;
    bucket.fills += 1;
    groups.set(key, bucket);
  }

  const total = records.reduce((sum, r) => sum + r.totalAmount, 0);

  return [...groups.entries()]
    .map(([key, bucket], index) => ({
      id: key,
      label: labelOf(key),
      color: colorOf(key, index),
      spent: round(bucket.spent, 2),
      liters: round(bucket.liters, 2),
      fills: bucket.fills,
      avgPrice: bucket.liters > 0 ? round(bucket.spent / bucket.liters, 2) : null,
      share: total > 0 ? round((bucket.spent / total) * 100, 1) : 0,
    }))
    .sort((a, b) => b.spent - a.spent);
}

/**
 * Arma el rendimiento de cada combustible presente en las cargas del vehículo.
 * Cada uno con su unidad, su consumo, su precio y sus series propias.
 */
function buildFuelPerformance(records: EnrichedRecord[], totalSpent: number): FuelPerformance[] {
  const fuels = new Set(records.map((r) => r.fuelType));

  return [...fuels]
    .map((fuelId) => {
      const info = fuelType(fuelId);
      const own = records.filter((r) => r.fuelType === fuelId);
      const ownByDate = [...own].sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());

      const quantity = round(
        own.reduce((sum, r) => sum + r.liters, 0),
        3,
      );
      const spent = round(
        own.reduce((sum, r) => sum + r.totalAmount, 0),
        2,
      );

      const legs = own.filter((r) => r.consumption !== null && r.legLiters !== null);
      const measuredDistance = round(
        legs.reduce((sum, r) => sum + (r.legLiters! / r.consumption!) * 100, 0),
        1,
      );
      const measuredQuantity = round(
        legs.reduce((sum, r) => sum + r.legLiters!, 0),
        3,
      );
      const measuredCost = round(
        legs.reduce((sum, r) => sum + (r.legCost ?? 0), 0),
        2,
      );

      const avgConsumption = safeDiv(measuredQuantity * 100, measuredDistance);
      const avgKmPerUnit = safeDiv(measuredDistance, measuredQuantity);

      return {
        fuelTypeId: fuelId,
        label: info.label,
        color: info.color,
        unit: info.unit,
        consumptionUnit: `${info.unit}/100km`,
        efficiencyUnit: `km/${info.unit}`,

        fills: own.length,
        quantity,
        spent,
        share: totalSpent > 0 ? round((spent / totalSpent) * 100, 1) : 0,

        avgPrice: quantity > 0 ? round(spent / quantity, 2) : null,
        lastPrice: ownByDate.at(-1)?.pricePerLiter ?? null,
        avgConsumption: avgConsumption !== null ? round(avgConsumption, 2) : null,
        avgKmPerUnit: avgKmPerUnit !== null ? round(avgKmPerUnit, 2) : null,
        costPerKm: safeDiv(measuredCost, measuredDistance),
        measuredDistance,
        excludedLegs: own.filter((r) => r.legHasOtherFuel).length,

        consumptionSeries: ownByDate
          .filter((r) => r.consumption !== null)
          .map((r) => ({
            date: dayKey(r.filledAt),
            timestamp: r.filledAt.getTime(),
            odometer: r.odometer,
            consumption: r.consumption!,
            kmPerLiter: r.kmPerLiter ?? 0,
            costPerKm: r.costPerKm ?? 0,
          })),
        priceSeries: ownByDate.map((r) => ({
          date: dayKey(r.filledAt),
          timestamp: r.filledAt.getTime(),
          pricePerLiter: r.pricePerLiter,
          fuelTypeId: r.fuelType,
          fuelLabel: info.short,
          station: r.station,
        })),
      };
    })
    .map((entry) => ({
      ...entry,
      costPerKm: entry.costPerKm !== null ? round(entry.costPerKm, 2) : null,
    }))
    .sort((a, b) => b.spent - a.spent);
}

export function computeVehicleStats(vehicle: Vehicle, rawRecords: FuelRecord[]): VehicleStats {
  const records = enrichRecords(rawRecords);
  const byDate = [...records].sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());

  /**
   * La unidad de cabecera es la del combustible principal. `mixedFuelUnits`
   * marca las cargas en unidades distintas que NO están declaradas como dual:
   * ahí los totales sí quedan mezclados y hay que avisar.
   */
  const unitsUsed = new Set(records.map((r) => fuelUnit(r.fuelType)));
  const unit = fuelUnit(vehicle.fuelType);
  const mixedFuelUnits = unitsUsed.size > 1 && !vehicle.secondaryFuelType;

  const fills = records.length;
  const totalSpent = round(
    records.reduce((sum, r) => sum + r.totalAmount, 0),
    2,
  );

  const odometers = records.map((r) => r.odometer);
  const currentOdometer = odometers.length ? Math.max(...odometers) : null;
  const totalDistance = odometers.length ? round(Math.max(...odometers) - Math.min(...odometers), 1) : 0;

  const firstFillAt = byDate[0]?.filledAt ?? null;
  const lastFillAt = byDate[byDate.length - 1]?.filledAt ?? null;

  /* --- Rendimiento de cada combustible por separado --- */
  const isDual = Boolean(vehicle.secondaryFuelType);
  const fuelPerformance = buildFuelPerformance(records, totalSpent);

  /**
   * Los indicadores de cabecera del vehículo son los del combustible principal.
   * En un dual, mezclarlos con los del secundario daría un número sin unidad.
   */
  const primaryFuel =
    fuelPerformance.find((f) => f.fuelTypeId === vehicle.fuelType) ?? fuelPerformance[0] ?? null;

  const primaryLegs = records.filter(
    (r) =>
      r.consumption !== null &&
      r.legLiters !== null &&
      (!primaryFuel || r.fuelType === primaryFuel.fuelTypeId),
  );

  /**
   * La cantidad de cabecera es la del combustible principal: sumar litros de
   * nafta con m³ de GNC no significaría nada. El detalle de cada uno está en
   * `fuelPerformance`.
   */
  const totalLiters = primaryFuel
    ? primaryFuel.quantity
    : round(
        records.reduce((sum, r) => sum + r.liters, 0),
        3,
      );

  const measuredDistance = primaryFuel?.measuredDistance ?? 0;
  const measuredLiters = round(
    primaryLegs.reduce((sum, r) => sum + r.legLiters!, 0),
    3,
  );
  const measuredCost = round(
    primaryLegs.reduce((sum, r) => sum + (r.legCost ?? 0), 0),
    2,
  );

  const avgConsumption = primaryFuel?.avgConsumption ?? null;
  const avgKmPerLiter = primaryFuel?.avgKmPerUnit ?? null;
  const consumptions = primaryLegs.map((r) => r.consumption!);
  const lastValidLeg = [...primaryLegs].sort((a, b) => a.odometer - b.odometer).at(-1) ?? null;

  /**
   * En un dual los tramos de cada combustible se solapan en distancia, así que
   * sumarlos contaría kilómetros dos veces. Ahí el costo por kilómetro se saca
   * de los totales, que siempre son exactos: pesos gastados sobre kilómetros
   * recorridos, sin importar con qué se hicieron.
   */
  const costPerKm = isDual
    ? safeDiv(totalSpent, totalDistance)
    : safeDiv(measuredCost, measuredDistance);

  /* --- Comparación entre combustibles: lo que un dual quiere saber --- */
  const comparable = fuelPerformance.filter((f) => f.costPerKm !== null);
  const dualComparison =
    comparable.length >= 2
      ? (() => {
          const ordered = [...comparable].sort((a, b) => a.costPerKm! - b.costPerKm!);
          const cheaper = ordered[0];
          const pricier = ordered[ordered.length - 1];
          const savingPerKm = round(pricier.costPerKm! - cheaper.costPerKm!, 2);
          return {
            cheaper,
            pricier,
            savingPerKm,
            savingPct: round((savingPerKm / pricier.costPerKm!) * 100, 1),
          };
        })()
      : null;

  /* --- Precios: los de cabecera son los del combustible principal --- */
  const avgPricePerLiter = primaryFuel?.avgPrice ?? safeDiv(totalSpent, totalLiters);
  const priceOrdered = byDate.filter(
    (r) => r.pricePerLiter > 0 && (!primaryFuel || r.fuelType === primaryFuel.fuelTypeId),
  );
  const firstPricePerLiter = priceOrdered[0]?.pricePerLiter ?? null;
  const lastPricePerLiter = priceOrdered[priceOrdered.length - 1]?.pricePerLiter ?? null;
  const priceChangePct =
    firstPricePerLiter && lastPricePerLiter && firstPricePerLiter > 0
      ? round(((lastPricePerLiter - firstPricePerLiter) / firstPricePerLiter) * 100, 1)
      : null;

  /* --- Hábitos --- */
  const gaps = records.map((r) => r.daysSincePrevious).filter((d): d is number => d !== null && d > 0);
  const kmGaps = records.map((r) => r.distance).filter((d): d is number => d !== null && d > 0);
  const spanDays =
    firstFillAt && lastFillAt
      ? Math.max((lastFillAt.getTime() - firstFillAt.getTime()) / MS_PER_DAY, 0)
      : 0;

  const avgKmPerDay = spanDays > 0 ? safeDiv(totalDistance, spanDays) : null;
  const avgSpentPerDay = spanDays > 0 ? safeDiv(totalSpent, spanDays) : null;

  /* --- Series mensuales --- */
  const monthlyMap = new Map<
    string,
    {
      spent: number;
      liters: number;
      /** Gasto sólo del combustible principal, para el precio promedio. */
      primarySpent: number;
      distance: number;
      fills: number;
      legLiters: number;
      legDistance: number;
    }
  >();

  for (const record of records) {
    const key = monthKey(record.filledAt);
    const bucket =
      monthlyMap.get(key) ??
      { spent: 0, liters: 0, primarySpent: 0, distance: 0, fills: 0, legLiters: 0, legDistance: 0 };
    bucket.spent += record.totalAmount;
    bucket.distance += record.distance ?? 0;
    bucket.fills += 1;

    // Cantidad y consumo del mes: sólo del combustible principal, para no
    // sumar litros con m³ en un vehículo dual.
    if (!primaryFuel || record.fuelType === primaryFuel.fuelTypeId) {
      bucket.liters += record.liters;
      bucket.primarySpent += record.totalAmount;
      if (record.consumption !== null && record.legLiters !== null) {
        bucket.legLiters += record.legLiters;
        bucket.legDistance += (record.legLiters / record.consumption) * 100;
      }
    }
    monthlyMap.set(key, bucket);
  }

  const monthly: MonthlyPoint[] = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const consumption = safeDiv(bucket.legLiters * 100, bucket.legDistance);
      return {
        month: key,
        label: monthLabel(key),
        spent: round(bucket.spent, 2),
        liters: round(bucket.liters, 2),
        distance: round(bucket.distance, 1),
        fills: bucket.fills,
        avgPrice: bucket.liters > 0 ? round(bucket.primarySpent / bucket.liters, 2) : null,
        consumption: consumption !== null ? round(consumption, 2) : null,
        costPerKm: bucket.distance > 0 ? round(bucket.spent / bucket.distance, 2) : null,
      };
    });

  /* --- Proyección: promedio de los últimos 3 meses cerrados --- */
  const recentMonths = monthly.slice(-4, -1);
  const projectedMonthlySpend = recentMonths.length ? round(avg(recentMonths.map((m) => m.spent))!, 2) : null;
  const avgSpentPerMonth = monthly.length ? round(avg(monthly.map((m) => m.spent))!, 2) : null;

  /**
   * Series de cabecera: las del combustible principal. Graficar en un mismo eje
   * un precio de $2.400 el litro y uno de $600 el m³ no diría nada. Las series
   * del secundario están en `fuelPerformance`.
   */
  const priceSeries = primaryFuel
    ? primaryFuel.priceSeries
    : byDate.map((r) => ({
        date: dayKey(r.filledAt),
        timestamp: r.filledAt.getTime(),
        pricePerLiter: r.pricePerLiter,
        fuelTypeId: r.fuelType,
        fuelLabel: fuelType(r.fuelType).short,
        station: r.station,
      }));

  const consumptionSeries: ConsumptionPoint[] = primaryFuel
    ? primaryFuel.consumptionSeries
    : byDate
        .filter((r) => r.consumption !== null)
        .map((r) => ({
          date: dayKey(r.filledAt),
          timestamp: r.filledAt.getTime(),
          odometer: r.odometer,
          consumption: r.consumption!,
          kmPerLiter: r.kmPerLiter ?? 0,
          costPerKm: r.costPerKm ?? 0,
        }));

  /* --- Desgloses --- */
  const byStation = buildBreakdown(
    records,
    (r) => r.station ?? "otra",
    (key) => stationInfo(key).label,
    (key) => stationInfo(key).color,
  );
  const byFuelTypeSlices = buildBreakdown(
    records,
    (r) => r.fuelType,
    (key) => fuelType(key).label,
    (key) => fuelType(key).color,
  );
  const byPaymentMethod = buildBreakdown(
    records,
    (r) => r.paymentMethod ?? "otro",
    (key) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    (_key, index) => CHART_PALETTE[index % CHART_PALETTE.length],
  );

  /* --- Autonomía y costo de llenar el tanque --- */
  const estimatedRange =
    vehicle.tankCapacity && avgKmPerLiter ? round(vehicle.tankCapacity * avgKmPerLiter, 0) : null;
  const estimatedFullTankCost =
    vehicle.tankCapacity && lastPricePerLiter
      ? round(vehicle.tankCapacity * lastPricePerLiter, 2)
      : null;

  const consumptionVsTargetPct =
    vehicle.targetConsumption && avgConsumption
      ? round(((avgConsumption - vehicle.targetConsumption) / vehicle.targetConsumption) * 100, 1)
      : null;

  const vatRecords = records.filter((r) => r.vatAmount !== null);
  const totalVat = vatRecords.length
    ? round(
        vatRecords.reduce((sum, r) => sum + (r.vatAmount ?? 0), 0),
        2,
      )
    : null;

  return {
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    color: vehicle.color,
    records,

    unit,
    consumptionUnit: `${unit}/100km`,
    efficiencyUnit: `km/${unit}`,
    mixedFuelUnits,

    isDual,
    primaryFuelTypeId: primaryFuel?.fuelTypeId ?? null,
    fuelPerformance,
    dualComparison: isDual ? dualComparison : null,

    fills,
    totalLiters,
    totalSpent,
    totalDistance,
    firstFillAt,
    lastFillAt,
    currentOdometer,

    avgConsumption,
    bestConsumption: consumptions.length ? round(Math.min(...consumptions), 2) : null,
    worstConsumption: consumptions.length ? round(Math.max(...consumptions), 2) : null,
    lastConsumption: lastValidLeg?.consumption ?? null,
    avgKmPerLiter: avgKmPerLiter !== null ? round(avgKmPerLiter, 2) : null,
    measuredDistance,
    measuredLiters,

    costPerKm: costPerKm !== null ? round(costPerKm, 2) : null,
    costPer100Km: costPerKm !== null ? round(costPerKm * 100, 2) : null,
    avgPricePerLiter: avgPricePerLiter !== null ? round(avgPricePerLiter, 2) : null,
    lastPricePerLiter,
    firstPricePerLiter,
    priceChangePct,
    avgSpentPerFill: fills > 0 ? round(totalSpent / fills, 2) : null,
    // Por carga del combustible principal: mezclar litros y m³ no diría nada.
    avgLitersPerFill:
      primaryFuel && primaryFuel.fills > 0
        ? round(primaryFuel.quantity / primaryFuel.fills, 2)
        : fills > 0
          ? round(totalLiters / fills, 2)
          : null,

    avgDaysBetweenFills: gaps.length ? round(avg(gaps)!, 1) : null,
    avgKmBetweenFills: kmGaps.length ? round(avg(kmGaps)!, 0) : null,
    avgKmPerDay: avgKmPerDay !== null ? round(avgKmPerDay, 1) : null,
    avgSpentPerDay: avgSpentPerDay !== null ? round(avgSpentPerDay, 2) : null,
    avgSpentPerMonth,

    estimatedRange,
    estimatedFullTankCost,
    projectedMonthlySpend,
    consumptionVsTargetPct,

    totalVat,

    monthly,
    priceSeries,
    consumptionSeries,
    byStation,
    byFuelType: byFuelTypeSlices,
    byPaymentMethod,
  };
}

/* -------------------------------------------------------------------------- */
/*                         Resumen combinado (toda la flota)                   */
/* -------------------------------------------------------------------------- */

export type FleetSummary = {
  vehicles: number;
  fills: number;
  totalSpent: number;
  /**
   * Unidad común a toda la flota, o `null` si hay vehículos que cargan en
   * unidades distintas (nafta en litros y GNC en m³, por ejemplo). Cuando es
   * `null`, los totales de cantidad y el consumo promedio no se pueden sumar
   * y quedan en `null`.
   */
  unit: string | null;
  totalLiters: number | null;
  totalDistance: number;
  avgConsumption: number | null;
  costPerKm: number | null;
  avgPricePerLiter: number | null;
  lastPricePerLiter: number | null;
  spentThisMonth: number;
  spentPreviousMonth: number;
  spentChangePct: number | null;
  litersThisMonth: number | null;
  distanceThisMonth: number;
  projectedMonthlySpend: number | null;
  monthly: MonthlyPoint[];
  byStation: BreakdownSlice[];
  byFuelType: BreakdownSlice[];
  byVehicle: BreakdownSlice[];
};

export function computeFleetSummary(stats: VehicleStats[]): FleetSummary {
  /**
   * Sumar litros de nafta con m³ de GNC daría un número sin significado, así que
   * los agregados de cantidad sólo existen si toda la flota comparte la unidad.
   * El gasto y el costo por kilómetro, en cambio, siempre son pesos: se suman
   * sin problema.
   */
  const units = new Set(stats.filter((s) => s.fills > 0).map((s) => s.unit));
  const hasMixedUnits = units.size > 1;
  const unit = units.size === 1 ? [...units][0] : null;

  const totalSpent = round(
    stats.reduce((sum, s) => sum + s.totalSpent, 0),
    2,
  );
  const totalLiters = hasMixedUnits
    ? null
    : round(
        stats.reduce((sum, s) => sum + s.totalLiters, 0),
        2,
      );
  const totalDistance = round(
    stats.reduce((sum, s) => sum + s.totalDistance, 0),
    1,
  );
  const measuredDistance = stats.reduce((sum, s) => sum + s.measuredDistance, 0);
  const measuredLiters = stats.reduce((sum, s) => sum + s.measuredLiters, 0);

  /* Series mensuales combinadas */
  const monthlyMap = new Map<string, MonthlyPoint>();
  for (const vehicleStats of stats) {
    for (const point of vehicleStats.monthly) {
      const existing = monthlyMap.get(point.month);
      if (!existing) {
        monthlyMap.set(point.month, { ...point });
      } else {
        existing.spent = round(existing.spent + point.spent, 2);
        existing.liters = round(existing.liters + point.liters, 2);
        existing.distance = round(existing.distance + point.distance, 1);
        existing.fills += point.fills;
        existing.avgPrice = existing.liters > 0 ? round(existing.spent / existing.liters, 2) : null;
        existing.costPerKm =
          existing.distance > 0 ? round(existing.spent / existing.distance, 2) : null;
      }
    }
  }

  const monthly = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const currentMonth = monthKey(new Date());
  const previousDate = new Date();
  previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = monthKey(previousDate);

  const thisMonthPoint = monthly.find((m) => m.month === currentMonth);
  const previousMonthPoint = monthly.find((m) => m.month === previousMonth);
  const spentThisMonth = thisMonthPoint?.spent ?? 0;
  const spentPreviousMonth = previousMonthPoint?.spent ?? 0;

  const recentMonths = monthly.slice(-4, -1);
  const projectedMonthlySpend = recentMonths.length
    ? round(avg(recentMonths.map((m) => m.spent))!, 2)
    : null;

  /* Desgloses combinados */
  const mergeSlices = (lists: BreakdownSlice[][]) => {
    const map = new Map<string, BreakdownSlice>();
    for (const list of lists) {
      for (const slice of list) {
        const existing = map.get(slice.id);
        if (!existing) {
          map.set(slice.id, { ...slice });
        } else {
          existing.spent = round(existing.spent + slice.spent, 2);
          existing.liters = round(existing.liters + slice.liters, 2);
          existing.fills += slice.fills;
          existing.avgPrice = existing.liters > 0 ? round(existing.spent / existing.liters, 2) : null;
        }
      }
    }
    const result = [...map.values()].sort((a, b) => b.spent - a.spent);
    const total = result.reduce((sum, s) => sum + s.spent, 0);
    return result.map((s) => ({ ...s, share: total > 0 ? round((s.spent / total) * 100, 1) : 0 }));
  };

  const allPrices = stats
    .flatMap((s) => s.priceSeries)
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    vehicles: stats.length,
    fills: stats.reduce((sum, s) => sum + s.fills, 0),
    totalSpent,
    unit,
    totalLiters,
    totalDistance,
    avgConsumption:
      !hasMixedUnits && measuredDistance > 0
        ? round((measuredLiters / measuredDistance) * 100, 2)
        : null,
    // El costo por kilómetro son pesos sobre kilómetros: vale siempre, mezcle
    // o no la flota combustibles distintos.
    costPerKm: totalDistance > 0 ? round(totalSpent / totalDistance, 2) : null,
    avgPricePerLiter: totalLiters && totalLiters > 0 ? round(totalSpent / totalLiters, 2) : null,
    lastPricePerLiter: hasMixedUnits ? null : (allPrices.at(-1)?.pricePerLiter ?? null),
    spentThisMonth,
    spentPreviousMonth,
    spentChangePct:
      spentPreviousMonth > 0
        ? round(((spentThisMonth - spentPreviousMonth) / spentPreviousMonth) * 100, 1)
        : null,
    litersThisMonth: hasMixedUnits ? null : (thisMonthPoint?.liters ?? 0),
    distanceThisMonth: thisMonthPoint?.distance ?? 0,
    projectedMonthlySpend,
    monthly,
    byStation: mergeSlices(stats.map((s) => s.byStation)),
    byFuelType: mergeSlices(stats.map((s) => s.byFuelType)),
    byVehicle: stats
      .map((s, index) => ({
        id: s.vehicleId,
        label: s.vehicleName,
        color: s.color || CHART_PALETTE[index % CHART_PALETTE.length],
        spent: s.totalSpent,
        liters: s.totalLiters,
        fills: s.fills,
        avgPrice: s.avgPricePerLiter,
        share: totalSpent > 0 ? round((s.totalSpent / totalSpent) * 100, 1) : 0,
      }))
      .sort((a, b) => b.spent - a.spent),
  };
}
