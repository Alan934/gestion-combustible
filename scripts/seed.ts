/**
 * Datos de demostración.
 *
 *   npm run db:seed
 *
 * Crea (o reutiliza) el usuario demo@combustible.app con dos vehículos y ~14
 * meses de cargas realistas: consumo con variación, precios que acompañan la
 * inflación, cargas parciales y alguna salteada. Borra las cargas previas del
 * usuario demo antes de escribir, así se puede correr las veces que haga falta.
 *
 * No toca ninguna otra cuenta.
 */

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { fuelRecords, users, vehicles } from "../src/lib/db/schema";
import type { NewFuelRecord } from "../src/lib/db/schema";

const DEMO_EMAIL = "demo@combustible.app";
const DEMO_PASSWORD = "combustible2026";

/** PRNG determinista: el seed genera siempre el mismo historial. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260817);

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Variación aleatoria en el rango [-spread, +spread]. */
function jitter(spread: number) {
  return (random() - 0.5) * 2 * spread;
}

type VehiclePlan = {
  name: string;
  brand: string;
  model: string;
  year: number;
  plate: string;
  fuelType: "diesel_premium" | "nafta_super" | "gnc";
  tankCapacity: number;
  targetConsumption: number;
  color: string;
  startOdometer: number;
  /** Consumo real medio en L/100km. */
  consumption: number;
  /** Kilómetros por día en promedio. */
  kmPerDay: number;
  /** Precio del litro al inicio de la serie. */
  startPrice: number;
  stations: { id: string; branch: string; weight: number }[];
  payments: string[];
  /** Equipo de GNC: convierte al vehículo en bicombustible. */
  dual?: {
    tankCapacity: number;
    targetConsumption: number;
    /** Consumo real a gas, en m³/100km. */
    consumption: number;
    /** Autonomía del tubo, en km. */
    rangeKm: number;
    startPrice: number;
    /** Cada cuántas cargas de gas hace un viaje largo sólo a nafta. */
    naftaTripEvery: number;
    /** Kilómetros de ese viaje: son los que dejan medir el consumo de nafta. */
    naftaTripKm: number;
  };
};

const PLANS: VehiclePlan[] = [
  {
    name: "Hilux",
    brand: "Toyota",
    model: "Hilux SRV 2.8 TDI",
    year: 2021,
    plate: "AF 412 QK",
    fuelType: "diesel_premium",
    tankCapacity: 80,
    targetConsumption: 9.5,
    color: "#22d3ee",
    startOdometer: 96_400,
    consumption: 10.6,
    kmPerDay: 62,
    startPrice: 1480,
    stations: [
      { id: "shell", branch: "Costa de Araujo - Lavalle, Mendoza", weight: 0.5 },
      { id: "ypf", branch: "Acceso Este, Guaymallén", weight: 0.3 },
      { id: "axion", branch: "Ruta 40 km 12, Luján de Cuyo", weight: 0.2 },
    ],
    payments: ["mercado_pago", "credito", "debito"],
  },
  {
    name: "Corolla",
    brand: "Toyota",
    model: "Corolla XEI 2.0",
    year: 2019,
    plate: "AC 903 LM",
    fuelType: "nafta_super",
    tankCapacity: 50,
    targetConsumption: 7.2,
    color: "#a78bfa",
    startOdometer: 71_800,
    consumption: 7.9,
    kmPerDay: 34,
    startPrice: 1210,
    stations: [
      { id: "ypf", branch: "San Martín 2100, Ciudad", weight: 0.55 },
      { id: "puma", branch: "Av. Godoy Cruz 850", weight: 0.25 },
      { id: "shell", branch: "Acceso Sur km 3", weight: 0.2 },
    ],
    payments: ["debito", "mercado_pago", "efectivo"],
    // Bicombustible: anda casi siempre a gas y usa nafta en los viajes largos.
    dual: {
      tankCapacity: 13,
      targetConsumption: 10.2,
      consumption: 10.8,
      rangeKm: 118,
      startPrice: 402,
      naftaTripEvery: 8,
      naftaTripKm: 450,
    },
  },
  {
    // A GNC: se carga mucho más seguido (el tubo rinde ~120 km) y mucho más
    // barato. Las cantidades van en m³, no en litros.
    name: "Fiorino GNC",
    brand: "Fiat",
    model: "Fiorino 1.4",
    year: 2018,
    plate: "AB 774 TR",
    fuelType: "gnc",
    tankCapacity: 14,
    targetConsumption: 11.5,
    color: "#34d399",
    startOdometer: 143_200,
    consumption: 12.3,
    kmPerDay: 48,
    startPrice: 402,
    stations: [
      { id: "ypf", branch: "Av. San Martín 4400, Villa Nueva", weight: 0.45 },
      { id: "blanca", branch: "GNC Los Andes, Guaymallén", weight: 0.35 },
      { id: "shell", branch: "Acceso Este km 5", weight: 0.2 },
    ],
    payments: ["efectivo", "debito", "mercado_pago"],
  },
];

function pickStation(plan: VehiclePlan) {
  const roll = random();
  let acc = 0;
  for (const station of plan.stations) {
    acc += station.weight;
    if (roll <= acc) return station;
  }
  return plan.stations[0];
}

/**
 * Genera la serie de cargas de un vehículo hacia atrás desde `endDate`.
 * El precio crece ~3,2% mensual, que es el orden de magnitud con el que se
 * movió el combustible en Argentina en los últimos años.
 */
function buildRecords(plan: VehiclePlan, endDate: Date, months: number) {
  const records: Omit<NewFuelRecord, "vehicleId" | "userId">[] = [];

  const totalDays = Math.round(months * 30.4);
  const startDate = new Date(endDate.getTime() - totalDays * 86_400_000);

  let odometer = plan.startOdometer;
  let date = new Date(startDate);
  // Litros útiles por tanque: se recarga alrededor del 80% de la capacidad.
  const litersPerFill = plan.tankCapacity * 0.8;

  while (date.getTime() <= endDate.getTime()) {
    const monthsElapsed = (date.getTime() - startDate.getTime()) / (30.4 * 86_400_000);
    const price = round(plan.startPrice * Math.pow(1.032, monthsElapsed) * (1 + jitter(0.012)), 1);

    // Consumo del tramo: base del vehículo con variación estacional y de uso.
    const legConsumption = plan.consumption * (1 + jitter(0.09));
    const liters = round(litersPerFill * (1 + jitter(0.12)), 3);
    const distance = Math.round((liters / legConsumption) * 100);

    odometer = Math.round(odometer + distance);

    // Una de cada nueve cargas es parcial, y una de cada veinticinco quedó sin registrar.
    const isFullTank = random() > 0.11;
    const missedPreviousFill = random() > 0.96;

    const station = pickStation(plan);
    const totalAmount = round(liters * price, 2);
    // Estructura impositiva típica de un ticket de combustible argentino.
    const otherTaxes = round(totalAmount * 0.121, 2);
    const netAmount = round((totalAmount - otherTaxes) / 1.21, 2);
    const vatAmount = round(netAmount * 0.21, 2);

    records.push({
      filledAt: new Date(date),
      odometer,
      liters,
      pricePerLiter: price,
      totalAmount,
      fuelType: plan.fuelType,
      station: station.id,
      stationBranch: station.branch,
      paymentMethod: plan.payments[Math.floor(random() * plan.payments.length)] as never,
      isFullTank,
      missedPreviousFill,
      netAmount,
      vatAmount,
      otherTaxes,
      invoiceNumber: `00015-${String(100000 + Math.floor(random() * 9999)).padStart(8, "0")}`,
      notes: null,
    });

    const daysToNext = Math.max(3, Math.round(distance / plan.kmPerDay));
    date = new Date(date.getTime() + daysToNext * 86_400_000);
  }

  // El último paso del bucle puede pasarse de hoy: no dejamos cargas con fecha
  // futura, que el formulario rechazaría.
  return records.filter((r) => r.filledAt.getTime() <= endDate.getTime());
}

/**
 * Serie de un vehículo bicombustible. El patrón imita el uso real: anda a gas
 * casi todo el tiempo, cargando el tubo cada ~120 km, y de vez en cuando hace un
 * viaje largo sólo a nafta.
 *
 * Ese viaje importa: es el único tramo donde se carga nafta dos veces seguidas
 * sin gas en el medio, y por lo tanto el único donde el consumo de nafta se
 * puede medir de verdad.
 */
function buildDualRecords(plan: VehiclePlan, endDate: Date, months: number) {
  const dual = plan.dual!;
  const records: Omit<NewFuelRecord, "vehicleId" | "userId">[] = [];

  const totalDays = Math.round(months * 30.4);
  const startDate = new Date(endDate.getTime() - totalDays * 86_400_000);

  let odometer = plan.startOdometer;
  let date = new Date(startDate);
  let cycle = 0;

  const priceAt = (start: number, when: Date) => {
    const monthsElapsed = (when.getTime() - startDate.getTime()) / (30.4 * 86_400_000);
    return round(start * Math.pow(1.032, monthsElapsed) * (1 + jitter(0.012)), 1);
  };

  const push = (
    fuel: "nafta_super" | "gnc",
    quantity: number,
    price: number,
    when: Date,
    odo: number,
  ) => {
    const station = pickStation(plan);
    const totalAmount = round(quantity * price, 2);
    const otherTaxes = fuel === "gnc" ? 0 : round(totalAmount * 0.121, 2);
    const netAmount = round((totalAmount - otherTaxes) / 1.21, 2);

    records.push({
      filledAt: new Date(when),
      odometer: odo,
      liters: round(quantity, 3),
      pricePerLiter: price,
      totalAmount,
      fuelType: fuel,
      station: station.id,
      stationBranch: station.branch,
      paymentMethod: plan.payments[Math.floor(random() * plan.payments.length)] as never,
      isFullTank: true,
      missedPreviousFill: false,
      netAmount,
      vatAmount: round(netAmount * 0.21, 2),
      otherTaxes: otherTaxes || null,
      invoiceNumber: `00021-${String(200000 + Math.floor(random() * 9999)).padStart(8, "0")}`,
      notes: null,
    });
  };

  while (date.getTime() <= endDate.getTime()) {
    cycle += 1;

    if (cycle % dual.naftaTripEvery === 0) {
      // Viaje a nafta: se llena antes de salir y se vuelve a llenar al volver.
      odometer += 1;
      push("nafta_super", plan.tankCapacity * 0.85 * (1 + jitter(0.08)), priceAt(plan.startPrice, date), date, odometer);

      const tripDays = Math.max(2, Math.round(dual.naftaTripKm / 220));
      date = new Date(date.getTime() + tripDays * 86_400_000);
      const tripKm = Math.round(dual.naftaTripKm * (1 + jitter(0.15)));
      odometer += tripKm;

      const naftaUsed = (tripKm * plan.consumption * (1 + jitter(0.07))) / 100;
      push("nafta_super", naftaUsed, priceAt(plan.startPrice, date), date, odometer);
    } else {
      // Ciclo normal a gas.
      const legKm = Math.round(dual.rangeKm * (1 + jitter(0.14)));
      odometer += legKm;
      date = new Date(date.getTime() + Math.max(2, Math.round(legKm / plan.kmPerDay)) * 86_400_000);

      const gasUsed = (legKm * dual.consumption * (1 + jitter(0.08))) / 100;
      push("gnc", gasUsed, priceAt(dual.startPrice, date), date, odometer);
    }
  }

  // Un viaje a nafta puede empujar la fecha más allá de hoy: esas cargas se
  // descartan para no dejar registros con fecha futura.
  return records.filter((r) => r.filledAt.getTime() <= endDate.getTime());
}

async function main() {
  console.log("Preparando datos de demostración…");

  let [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        name: "Demo Prueba",
        email: DEMO_EMAIL,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      })
      .returning();
    console.log(`  Usuario creado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } else {
    console.log(`  Usuario existente: ${DEMO_EMAIL}`);
  }

  // Se limpia todo lo del demo para que el script sea idempotente.
  await db.delete(vehicles).where(eq(vehicles.userId, user.id));

  const endDate = new Date();
  let totalRecords = 0;

  for (const plan of PLANS) {
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        userId: user.id,
        name: plan.name,
        brand: plan.brand,
        model: plan.model,
        year: plan.year,
        plate: plan.plate,
        fuelType: plan.fuelType,
        tankCapacity: plan.tankCapacity,
        targetConsumption: plan.targetConsumption,
        secondaryFuelType: plan.dual ? "gnc" : null,
        secondaryTankCapacity: plan.dual?.tankCapacity ?? null,
        secondaryTargetConsumption: plan.dual?.targetConsumption ?? null,
        color: plan.color,
        initialOdometer: plan.startOdometer,
      })
      .returning();

    const records = plan.dual
      ? buildDualRecords(plan, endDate, 14)
      : buildRecords(plan, endDate, 14);
    await db
      .insert(fuelRecords)
      .values(records.map((record) => ({ ...record, vehicleId: vehicle.id, userId: user.id })));

    totalRecords += records.length;
    console.log(
      `  ${plan.name}: ${records.length} cargas${plan.dual ? " (bicombustible nafta + GNC)" : ""}`,
    );
  }

  console.log(`Listo. ${totalRecords} cargas en ${PLANS.length} vehículos.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
