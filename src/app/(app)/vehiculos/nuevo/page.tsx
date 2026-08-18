import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";

export const metadata: Metadata = { title: "Nuevo vehículo" };

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ bienvenida?: string }>;
}) {
  const { bienvenida } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={bienvenida ? "¡Bienvenido! Empecemos por tu vehículo" : "Nuevo vehículo"}
        description={
          bienvenida
            ? "Sólo hace falta el nombre. Todo lo demás lo podés completar después."
            : "Cargá los datos del vehículo. Sólo el nombre es obligatorio."
        }
      />
      <VehicleForm />
    </div>
  );
}
