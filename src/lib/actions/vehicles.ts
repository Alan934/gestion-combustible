"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { FUEL_TYPE_IDS, VEHICLE_COLORS } from "@/lib/catalogs";
import type { FuelTypeId } from "@/lib/catalogs";
import { db } from "@/lib/db";
import { vehicles } from "@/lib/db/schema";
import { parseInteger, parseNumber, parseText } from "@/lib/parse";

export type FormState = { error?: string; ok?: boolean } | null;

function revalidateAll() {
  revalidatePath("/panel");
  revalidatePath("/vehiculos");
  revalidatePath("/cargas");
  revalidatePath("/estadisticas");
}

function readVehicleForm(formData: FormData) {
  const name = parseText(formData.get("name"));
  if (!name) return { error: "Poniéle un nombre al vehículo" } as const;

  const fuelTypeRaw = parseText(formData.get("fuelType")) ?? "nafta_super";
  const fuelType = (FUEL_TYPE_IDS as readonly string[]).includes(fuelTypeRaw)
    ? (fuelTypeRaw as FuelTypeId)
    : ("nafta_super" as FuelTypeId);

  const year = parseInteger(formData.get("year"));
  if (year !== null && (year < 1900 || year > new Date().getFullYear() + 2)) {
    return { error: "El año del vehículo no parece válido" } as const;
  }

  const tankCapacity = parseNumber(formData.get("tankCapacity"));
  if (tankCapacity !== null && (tankCapacity <= 0 || tankCapacity > 2000)) {
    return { error: "La capacidad del tanque debe estar entre 1 y 2000" } as const;
  }

  /* --- Segundo combustible (vehículo bicombustible) --- */
  const secondaryRaw = parseText(formData.get("secondaryFuelType"));
  const secondaryFuelType =
    secondaryRaw && (FUEL_TYPE_IDS as readonly string[]).includes(secondaryRaw)
      ? (secondaryRaw as FuelTypeId)
      : null;

  if (secondaryFuelType && secondaryFuelType === fuelType) {
    return {
      error: "El segundo combustible tiene que ser distinto del principal",
    } as const;
  }

  const secondaryTankCapacity = secondaryFuelType
    ? parseNumber(formData.get("secondaryTankCapacity"))
    : null;
  if (secondaryTankCapacity !== null && (secondaryTankCapacity <= 0 || secondaryTankCapacity > 2000)) {
    return { error: "La capacidad del segundo tanque debe estar entre 1 y 2000" } as const;
  }

  const secondaryTargetConsumption = secondaryFuelType
    ? parseNumber(formData.get("secondaryTargetConsumption"))
    : null;
  if (
    secondaryTargetConsumption !== null &&
    (secondaryTargetConsumption <= 0 || secondaryTargetConsumption > 100)
  ) {
    return { error: "El consumo de referencia del segundo combustible no parece válido" } as const;
  }

  const initialOdometer = parseNumber(formData.get("initialOdometer")) ?? 0;
  if (initialOdometer < 0) return { error: "El odómetro inicial no puede ser negativo" } as const;

  const targetConsumption = parseNumber(formData.get("targetConsumption"));
  if (targetConsumption !== null && (targetConsumption <= 0 || targetConsumption > 100)) {
    return { error: "El consumo de referencia debe estar entre 0 y 100 por cada 100 km" } as const;
  }

  const colorRaw = parseText(formData.get("color")) ?? VEHICLE_COLORS[0];
  const color = (VEHICLE_COLORS as readonly string[]).includes(colorRaw)
    ? colorRaw
    : VEHICLE_COLORS[0];

  return {
    values: {
      name,
      brand: parseText(formData.get("brand")),
      model: parseText(formData.get("model")),
      year,
      plate: parseText(formData.get("plate"))?.toUpperCase() ?? null,
      fuelType,
      tankCapacity,
      initialOdometer,
      targetConsumption,
      secondaryFuelType,
      secondaryTankCapacity,
      secondaryTargetConsumption,
      color,
      notes: parseText(formData.get("notes")),
    },
  } as const;
}

export async function createVehicleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = readVehicleForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const [vehicle] = await db
    .insert(vehicles)
    .values({ ...parsed.values, userId: session.userId })
    .returning({ id: vehicles.id });

  revalidateAll();
  redirect(`/cargas/nueva?vehiculo=${vehicle.id}&primera=1`);
}

export async function updateVehicleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const vehicleId = parseText(formData.get("vehicleId"));
  if (!vehicleId) return { error: "No se pudo identificar el vehículo" };

  const parsed = readVehicleForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const updated = await db
    .update(vehicles)
    .set({ ...parsed.values, updatedAt: new Date() })
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, session.userId)))
    .returning({ id: vehicles.id });

  if (!updated.length) return { error: "El vehículo no existe o no es tuyo" };

  revalidateAll();
  revalidatePath(`/vehiculos/${vehicleId}`);
  redirect(`/vehiculos/${vehicleId}`);
}

export async function toggleArchiveVehicleAction(formData: FormData) {
  const session = await requireSession();
  const vehicleId = parseText(formData.get("vehicleId"));
  if (!vehicleId) return;

  const [current] = await db
    .select({ isArchived: vehicles.isArchived })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, session.userId)))
    .limit(1);

  if (!current) return;

  await db
    .update(vehicles)
    .set({ isArchived: !current.isArchived, updatedAt: new Date() })
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, session.userId)));

  revalidateAll();
}

export async function deleteVehicleAction(formData: FormData) {
  const session = await requireSession();
  const vehicleId = parseText(formData.get("vehicleId"));
  if (!vehicleId) return;

  // Las cargas asociadas se borran por el ON DELETE CASCADE del esquema.
  await db
    .delete(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, session.userId)));

  revalidateAll();
  redirect("/vehiculos");
}
