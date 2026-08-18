/**
 * Catálogos del dominio: combustibles, banderas de estaciones y medios de pago
 * habituales en Argentina. Se guardan como texto en la base para poder ampliarlos
 * sin migraciones de enum.
 */

export const FUEL_TYPES = [
  {
    id: "nafta_super",
    label: "Nafta Súper",
    short: "Súper",
    unit: "L",
    color: "#38bdf8",
    /** Nombres comerciales que aparecen en los tickets. */
    aliases: ["Súper", "Regular", "Nafta Súper"],
  },
  {
    id: "nafta_premium",
    label: "Nafta Premium",
    short: "Premium",
    unit: "L",
    color: "#a78bfa",
    aliases: ["Infinia", "V-Power Nitro+", "Quantium", "Ion", "Premium"],
  },
  {
    id: "diesel_comun",
    label: "Gasoil común (grado 2)",
    short: "Gasoil",
    unit: "L",
    color: "#fbbf24",
    aliases: ["Diesel 500", "Evolux", "Diesel X10", "Gasoil grado 2"],
  },
  {
    id: "diesel_premium",
    label: "Gasoil premium (grado 3)",
    short: "Gasoil Premium",
    unit: "L",
    color: "#fb923c",
    aliases: [
      "Infinia Diesel",
      "V-Power Nitro+ Diesel",
      "Quantium Diesel X10",
      "Ion Diesel",
      "Gasoil grado 3",
    ],
  },
  { id: "gnc", label: "GNC", short: "GNC", unit: "m³", color: "#34d399", aliases: ["GNC"] },
  {
    id: "electrico",
    label: "Eléctrico",
    short: "Eléctrico",
    unit: "kWh",
    color: "#4ade80",
    aliases: ["Carga eléctrica"],
  },
] as const;

export type FuelTypeId = (typeof FUEL_TYPES)[number]["id"];
export const FUEL_TYPE_IDS = FUEL_TYPES.map((f) => f.id) as [FuelTypeId, ...FuelTypeId[]];

export function fuelType(id: string | null | undefined) {
  return FUEL_TYPES.find((f) => f.id === id) ?? FUEL_TYPES[0];
}

/** Unidad de medida del combustible: litros, m³ (GNC) o kWh (eléctrico). */
export function fuelUnit(id: string | null | undefined) {
  return fuelType(id).unit;
}

/* -------------------------------------------------------------------------- */

export const STATIONS = [
  { id: "ypf", label: "YPF", color: "#0ea5e9" },
  { id: "shell", label: "Shell", color: "#f43f5e" },
  { id: "axion", label: "Axion", color: "#8b5cf6" },
  { id: "puma", label: "Puma", color: "#f59e0b" },
  { id: "gulf", label: "Gulf", color: "#f97316" },
  { id: "refinor", label: "Refinor", color: "#14b8a6" },
  { id: "voy", label: "Voy", color: "#84cc16" },
  { id: "blanca", label: "Estación blanca / independiente", color: "#94a3b8" },
  { id: "otra", label: "Otra", color: "#64748b" },
] as const;

export type StationId = (typeof STATIONS)[number]["id"];

export function station(id: string | null | undefined) {
  return STATIONS.find((s) => s.id === id) ?? { id: "otra", label: "Sin estación", color: "#64748b" };
}

/* -------------------------------------------------------------------------- */

export const PAYMENT_METHODS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "debito", label: "Tarjeta de débito" },
  { id: "credito", label: "Tarjeta de crédito" },
  { id: "mercado_pago", label: "Mercado Pago" },
  { id: "app_estacion", label: "App de la estación" },
  { id: "transferencia", label: "Transferencia" },
  { id: "cuenta_corriente", label: "Cuenta corriente" },
  { id: "otro", label: "Otro" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((p) => p.id) as [
  PaymentMethodId,
  ...PaymentMethodId[],
];

export function paymentMethod(id: string | null | undefined) {
  return PAYMENT_METHODS.find((p) => p.id === id);
}

/* -------------------------------------------------------------------------- */

/** Paleta usada cuando hay que asignar colores por índice (gráficos de torta). */
export const CHART_PALETTE = [
  "#22d3ee",
  "#a78bfa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#4ade80",
  "#f87171",
  "#c084fc",
] as const;

export const VEHICLE_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#f87171",
] as const;

/** Alícuota general de IVA en Argentina, usada para estimar el desglose fiscal. */
export const VAT_RATE = 0.21;
