"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { FUEL_TYPE_IDS, PAYMENT_METHOD_IDS, STATIONS } from "@/lib/catalogs";
import type { FuelTypeId, PaymentMethodId } from "@/lib/catalogs";
import { db } from "@/lib/db";
import { fuelRecords, vehicles } from "@/lib/db/schema";
import { formatDate, formatKm } from "@/lib/format";
import { solveTaxes, solveTriple } from "@/lib/fuel-math";
import { parseArgentinaDateTime, parseBoolean, parseNumber, parseText } from "@/lib/parse";

export type FormState = { error?: string; ok?: boolean } | null;

function revalidateAll(vehicleId?: string) {
  revalidatePath("/panel");
  revalidatePath("/cargas");
  revalidatePath("/vehiculos");
  revalidatePath("/estadisticas");
  if (vehicleId) revalidatePath(`/vehiculos/${vehicleId}`);
}

function pick<T extends string>(value: string | null, allowed: readonly string[], fallback: T | null) {
  return value && allowed.includes(value) ? (value as T) : fallback;
}

/**
 * El odómetro tiene que ser monótono respecto de la fecha: una carga posterior
 * no puede tener menos kilómetros que una anterior. Se valida contra todo el
 * historial porque las cargas se pueden dar de alta en cualquier orden.
 */
async function validateOdometer(
  vehicleId: string,
  filledAt: Date,
  odometer: number,
  excludeRecordId?: string,
) {
  const conditions = [eq(fuelRecords.vehicleId, vehicleId)];
  if (excludeRecordId) conditions.push(ne(fuelRecords.id, excludeRecordId));

  const siblings = await db
    .select({
      filledAt: fuelRecords.filledAt,
      odometer: fuelRecords.odometer,
    })
    .from(fuelRecords)
    .where(and(...conditions));

  for (const sibling of siblings) {
    const isEarlier = sibling.filledAt.getTime() < filledAt.getTime();
    const isLater = sibling.filledAt.getTime() > filledAt.getTime();

    if (isEarlier && sibling.odometer > odometer) {
      return `Hay una carga del ${formatDate(sibling.filledAt)} con ${formatKm(sibling.odometer)}. Una carga posterior no puede tener menos kilómetros.`;
    }
    if (isLater && sibling.odometer < odometer) {
      return `Hay una carga posterior (${formatDate(sibling.filledAt)}) con ${formatKm(sibling.odometer)}. Esta carga no puede tener más kilómetros que ella.`;
    }
  }

  return null;
}

async function readRecordForm(userId: string, formData: FormData) {
  const vehicleId = parseText(formData.get("vehicleId"));
  if (!vehicleId) return { error: "Elegí un vehículo" } as const;

  const [vehicle] = await db
    .select({ id: vehicles.id, fuelType: vehicles.fuelType })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)))
    .limit(1);

  if (!vehicle) return { error: "El vehículo no existe o no es tuyo" } as const;

  const filledAt = parseArgentinaDateTime(formData.get("filledAt"));
  if (!filledAt) return { error: "Ingresá la fecha y hora de la carga" } as const;
  if (filledAt.getTime() > Date.now() + 86_400_000) {
    return { error: "La fecha de la carga no puede estar en el futuro" } as const;
  }

  const odometer = parseNumber(formData.get("odometer"));
  if (odometer === null || odometer < 0) {
    return { error: "Ingresá los kilómetros del odómetro" } as const;
  }

  const solved = solveTriple({
    liters: parseNumber(formData.get("liters")),
    pricePerLiter: parseNumber(formData.get("pricePerLiter")),
    totalAmount: parseNumber(formData.get("totalAmount")),
  });
  if (!solved.ok) return { error: solved.error } as const;

  const taxes = solveTaxes({
    totalAmount: solved.totalAmount,
    netAmount: parseNumber(formData.get("netAmount")),
    vatAmount: parseNumber(formData.get("vatAmount")),
    otherTaxes: parseNumber(formData.get("otherTaxes")),
  });

  return {
    vehicleId,
    values: {
      vehicleId,
      userId,
      filledAt,
      odometer,
      liters: solved.liters,
      pricePerLiter: solved.pricePerLiter,
      totalAmount: solved.totalAmount,
      fuelType:
        pick<FuelTypeId>(parseText(formData.get("fuelType")), FUEL_TYPE_IDS, null) ??
        vehicle.fuelType,
      station: pick<string>(
        parseText(formData.get("station")),
        STATIONS.map((s) => s.id),
        null,
      ),
      stationBranch: parseText(formData.get("stationBranch")),
      paymentMethod: pick<PaymentMethodId>(
        parseText(formData.get("paymentMethod")),
        PAYMENT_METHOD_IDS,
        null,
      ),
      isFullTank: parseBoolean(formData.get("isFullTank")),
      missedPreviousFill: parseBoolean(formData.get("missedPreviousFill")),
      invoiceNumber: parseText(formData.get("invoiceNumber")),
      netAmount: taxes.netAmount,
      vatAmount: taxes.vatAmount,
      otherTaxes: taxes.otherTaxes,
      notes: parseText(formData.get("notes")),
    },
  } as const;
}

export async function createFuelRecordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = await readRecordForm(session.userId, formData);
  if ("error" in parsed) return { error: parsed.error };

  const odometerError = await validateOdometer(
    parsed.vehicleId,
    parsed.values.filledAt,
    parsed.values.odometer,
  );
  if (odometerError) return { error: odometerError };

  await db.insert(fuelRecords).values(parsed.values);

  revalidateAll(parsed.vehicleId);

  const stayHere = parseBoolean(formData.get("cargarOtra"));
  redirect(stayHere ? `/cargas/nueva?vehiculo=${parsed.vehicleId}&guardada=1` : "/panel?guardada=1");
}

export async function updateFuelRecordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const recordId = parseText(formData.get("recordId"));
  if (!recordId) return { error: "No se pudo identificar la carga" };

  const parsed = await readRecordForm(session.userId, formData);
  if ("error" in parsed) return { error: parsed.error };

  const odometerError = await validateOdometer(
    parsed.vehicleId,
    parsed.values.filledAt,
    parsed.values.odometer,
    recordId,
  );
  if (odometerError) return { error: odometerError };

  const updated = await db
    .update(fuelRecords)
    .set({ ...parsed.values, updatedAt: new Date() })
    .where(and(eq(fuelRecords.id, recordId), eq(fuelRecords.userId, session.userId)))
    .returning({ id: fuelRecords.id });

  if (!updated.length) return { error: "La carga no existe o no es tuya" };

  revalidateAll(parsed.vehicleId);
  redirect("/cargas?actualizada=1");
}

export async function deleteFuelRecordAction(formData: FormData) {
  const session = await requireSession();
  const recordId = parseText(formData.get("recordId"));
  if (!recordId) return;

  const [deleted] = await db
    .delete(fuelRecords)
    .where(and(eq(fuelRecords.id, recordId), eq(fuelRecords.userId, session.userId)))
    .returning({ vehicleId: fuelRecords.vehicleId });

  revalidateAll(deleted?.vehicleId);
}
