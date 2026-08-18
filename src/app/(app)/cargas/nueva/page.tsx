import Link from "next/link";
import type { Metadata } from "next";

import { FuelRecordForm } from "@/components/fuel-record-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { isReceiptScanningEnabled } from "@/lib/ai/gemini";
import { requireSession } from "@/lib/auth/session";
import { getVehicleOptions } from "@/lib/queries";

export const metadata: Metadata = { title: "Nueva carga" };

export default async function NewFuelRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ vehiculo?: string; primera?: string; guardada?: string }>;
}) {
  const { vehiculo, primera, guardada } = await searchParams;
  const session = await requireSession();
  const vehicles = await getVehicleOptions(session.userId);

  if (!vehicles.length) {
    return (
      <EmptyState
        icon="🚗"
        title="Primero necesitás un vehículo"
        description="Las cargas se registran contra un vehículo. Creá uno y volvé acá."
        actionLabel="Crear vehículo"
        actionHref="/vehiculos/nuevo"
      />
    );
  }

  const selected = vehiculo && vehicles.some((v) => v.id === vehiculo) ? vehiculo : vehicles[0].id;
  const isFirst = primera === "1";

  return (
    <>
      <PageHeader
        title="Nueva carga"
        description="Completá lo que tengas del ticket: los datos que falten se calculan solos."
      >
        <Link href="/cargas" className="btn btn-secondary">
          Ver historial
        </Link>
      </PageHeader>

      {guardada ? (
        <p className="alert-info mb-5" role="status">
          Carga guardada. Podés registrar la siguiente acá mismo.
        </p>
      ) : null}

      <FuelRecordForm
        vehicles={vehicles}
        defaultVehicleId={selected}
        isFirstRecord={isFirst}
        scanningEnabled={isReceiptScanningEnabled()}
      />
    </>
  );
}
