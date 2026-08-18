import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { fuelRecords, vehicles } from "@/lib/db/schema";
import type { FuelRecord, Vehicle } from "@/lib/db/schema";
import { computeFleetSummary, computeVehicleStats } from "@/lib/metrics";
import type { FleetSummary, VehicleStats } from "@/lib/metrics";

/* -------------------------------------------------------------------------- */
/*                                  Vehículos                                  */
/* -------------------------------------------------------------------------- */

export async function getVehicles(userId: string, includeArchived = false): Promise<Vehicle[]> {
  const rows = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(asc(vehicles.isArchived), asc(vehicles.createdAt));

  return includeArchived ? rows : rows.filter((v) => !v.isArchived);
}

/** Devuelve el vehículo sólo si pertenece al usuario. */
export async function getVehicle(userId: string, vehicleId: string): Promise<Vehicle | null> {
  const [row] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
    .limit(1);

  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*                                    Cargas                                   */
/* -------------------------------------------------------------------------- */

export async function getFuelRecords(
  userId: string,
  options: { vehicleId?: string } = {},
): Promise<FuelRecord[]> {
  const conditions = [eq(fuelRecords.userId, userId)];
  if (options.vehicleId) conditions.push(eq(fuelRecords.vehicleId, options.vehicleId));

  return db
    .select()
    .from(fuelRecords)
    .where(and(...conditions))
    .orderBy(desc(fuelRecords.filledAt));
}

export async function getFuelRecord(userId: string, recordId: string): Promise<FuelRecord | null> {
  const [row] = await db
    .select()
    .from(fuelRecords)
    .where(and(eq(fuelRecords.id, recordId), eq(fuelRecords.userId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Última carga de un vehículo por odómetro. Sirve para precargar el formulario
 * con el kilometraje y el precio por litro más recientes.
 */
export async function getLastRecord(userId: string, vehicleId: string): Promise<FuelRecord | null> {
  const [row] = await db
    .select()
    .from(fuelRecords)
    .where(and(eq(fuelRecords.userId, userId), eq(fuelRecords.vehicleId, vehicleId)))
    .orderBy(desc(fuelRecords.odometer))
    .limit(1);

  return row ?? null;
}

/** Últimas cargas de cada vehículo, en un solo viaje a la base. */
export async function getLastRecordByVehicle(userId: string): Promise<Map<string, FuelRecord>> {
  const rows = await db
    .select()
    .from(fuelRecords)
    .where(eq(fuelRecords.userId, userId))
    .orderBy(asc(fuelRecords.odometer));

  const map = new Map<string, FuelRecord>();
  for (const row of rows) map.set(row.vehicleId, row); // el último gana
  return map;
}

/* -------------------------------------------------------------------------- */
/*                        Opciones para el formulario de carga                 */
/* -------------------------------------------------------------------------- */

export type VehicleOption = {
  id: string;
  name: string;
  fuelType: string;
  /** Segundo combustible, si es un vehículo bicombustible. */
  secondaryFuelType: string | null;
  tankCapacity: number | null;
  secondaryTankCapacity: number | null;
  lastOdometer: number | null;
  lastPricePerLiter: number | null;
  /** Último precio conocido de cada combustible, para precargar según el elegido. */
  lastPriceByFuel: Record<string, number>;
  lastStation: string | null;
  lastPaymentMethod: string | null;
};

/** Vehículos + últimos valores conocidos, para precargar el formulario. */
export async function getVehicleOptions(userId: string): Promise<VehicleOption[]> {
  const [list, records] = await Promise.all([
    getVehicles(userId),
    db
      .select()
      .from(fuelRecords)
      .where(eq(fuelRecords.userId, userId))
      .orderBy(asc(fuelRecords.filledAt)),
  ]);

  return list.map((vehicle) => {
    const own = records.filter((r) => r.vehicleId === vehicle.id);
    const last = own.at(-1);

    // Recorriendo en orden ascendente, el último de cada combustible gana.
    const lastPriceByFuel: Record<string, number> = {};
    for (const record of own) lastPriceByFuel[record.fuelType] = record.pricePerLiter;

    const lastOdometer = own.length ? Math.max(...own.map((r) => r.odometer)) : null;

    return {
      id: vehicle.id,
      name: vehicle.name,
      fuelType: vehicle.fuelType,
      secondaryFuelType: vehicle.secondaryFuelType,
      tankCapacity: vehicle.tankCapacity,
      secondaryTankCapacity: vehicle.secondaryTankCapacity,
      lastOdometer: lastOdometer ?? (vehicle.initialOdometer || null),
      lastPricePerLiter: last?.pricePerLiter ?? null,
      lastPriceByFuel,
      lastStation: last?.station ?? null,
      lastPaymentMethod: last?.paymentMethod ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                          Datos derivados para las vistas                    */
/* -------------------------------------------------------------------------- */

export type DashboardData = {
  vehicles: Vehicle[];
  stats: VehicleStats[];
  summary: FleetSummary;
  allRecords: FuelRecord[];
};

/**
 * Trae vehículos y cargas del usuario y calcula todas las métricas.
 * Un usuario particular maneja cientos de registros, no millones: traer todo y
 * agregar en memoria es más simple y más flexible que hacerlo en SQL.
 */
export async function getDashboardData(
  userId: string,
  options: { vehicleId?: string } = {},
): Promise<DashboardData> {
  const [allVehicles, records] = await Promise.all([
    getVehicles(userId),
    getFuelRecords(userId, options),
  ]);

  const scoped = options.vehicleId
    ? allVehicles.filter((v) => v.id === options.vehicleId)
    : allVehicles;

  const stats = scoped.map((vehicle) =>
    computeVehicleStats(
      vehicle,
      records.filter((r) => r.vehicleId === vehicle.id),
    ),
  );

  return {
    vehicles: allVehicles,
    stats,
    summary: computeFleetSummary(stats),
    allRecords: records,
  };
}

export async function getVehicleStats(
  userId: string,
  vehicleId: string,
): Promise<{ vehicle: Vehicle; stats: VehicleStats } | null> {
  const vehicle = await getVehicle(userId, vehicleId);
  if (!vehicle) return null;

  const records = await getFuelRecords(userId, { vehicleId });
  return { vehicle, stats: computeVehicleStats(vehicle, records) };
}
