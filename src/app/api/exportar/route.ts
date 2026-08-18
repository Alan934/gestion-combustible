import { getSession } from "@/lib/auth/session";
import { fuelType, paymentMethod, station } from "@/lib/catalogs";
import { getDashboardData } from "@/lib/queries";

/** Escapa un valor para CSV (comillas dobles y separador). */
function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADERS = [
  "Fecha",
  "Hora",
  "Vehiculo",
  "Patente",
  "Odometro_km",
  "Tramo_km",
  "Cantidad",
  "Unidad",
  "Precio_unitario",
  "Total",
  "Consumo_L_100km",
  "Rendimiento_km_L",
  "Costo_por_km",
  "Combustible",
  "Estacion",
  "Sucursal",
  "Medio_de_pago",
  "Tanque_lleno",
  "Carga_salteada",
  "Factura",
  "Neto_gravado",
  "IVA",
  "Otros_tributos",
  "Notas",
];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("No autorizado", { status: 401 });
  }

  const { vehicles, stats } = await getDashboardData(session.userId);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const rows = stats
    .flatMap((s) => s.records)
    .sort((a, b) => b.filledAt.getTime() - a.filledAt.getTime())
    .map((record) => {
      const vehicle = vehicleById.get(record.vehicleId);
      const parts = new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      }).formatToParts(record.filledAt);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

      return [
        `${get("day")}/${get("month")}/${get("year")}`,
        `${get("hour")}:${get("minute")}`,
        vehicle?.name ?? "",
        vehicle?.plate ?? "",
        record.odometer,
        record.distance ?? "",
        record.liters,
        fuelType(record.fuelType).unit,
        record.pricePerLiter,
        record.totalAmount,
        record.consumption ?? "",
        record.kmPerLiter ?? "",
        record.costPerKm ?? "",
        fuelType(record.fuelType).label,
        record.station ? station(record.station).label : "",
        record.stationBranch ?? "",
        paymentMethod(record.paymentMethod)?.label ?? "",
        record.isFullTank ? "Si" : "No",
        record.missedPreviousFill ? "Si" : "No",
        record.invoiceNumber ?? "",
        record.netAmount ?? "",
        record.vatAmount ?? "",
        record.otherTaxes ?? "",
        record.notes ?? "",
      ].map(csvCell);
    });

  // Punto y coma como separador y BOM: así Excel en español abre el archivo bien.
  const csv = "﻿" + [HEADERS, ...rows].map((row) => row.join(";")).join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cargas-combustible-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
