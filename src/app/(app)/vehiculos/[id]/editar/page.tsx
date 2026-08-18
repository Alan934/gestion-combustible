import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { requireSession } from "@/lib/auth/session";
import { getVehicle } from "@/lib/queries";

export const metadata: Metadata = { title: "Editar vehículo" };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const vehicle = await getVehicle(session.userId, id);

  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Editar ${vehicle.name}`} description="Actualizá los datos del vehículo." />
      <VehicleForm vehicle={vehicle} />
    </div>
  );
}
