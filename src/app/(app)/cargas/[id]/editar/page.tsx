import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FuelRecordForm } from "@/components/fuel-record-form";
import { PageHeader } from "@/components/ui";
import { isReceiptScanningEnabled } from "@/lib/ai/gemini";
import { requireSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getFuelRecord, getVehicleOptions } from "@/lib/queries";

export const metadata: Metadata = { title: "Editar carga" };

export default async function EditFuelRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const [record, vehicles] = await Promise.all([
    getFuelRecord(session.userId, id),
    getVehicleOptions(session.userId),
  ]);

  if (!record) notFound();

  return (
    <>
      <PageHeader
        title="Editar carga"
        description={`Registro del ${formatDate(record.filledAt)}. Al guardar, las métricas se recalculan.`}
      />
      <FuelRecordForm
        vehicles={vehicles}
        record={record}
        scanningEnabled={isReceiptScanningEnabled()}
      />
    </>
  );
}
