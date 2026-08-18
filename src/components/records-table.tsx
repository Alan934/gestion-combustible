import Link from "next/link";

import { ConfirmButton } from "@/components/confirm-button";
import { ColorDot } from "@/components/ui";
import { deleteFuelRecordAction } from "@/lib/actions/fuel-records";
import { fuelType, paymentMethod, station } from "@/lib/catalogs";
import type { Vehicle } from "@/lib/db/schema";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { EnrichedRecord } from "@/lib/metrics";

/**
 * Tabla de cargas. Se comparte entre la vista general y la ficha del vehículo:
 * `showVehicle` decide si se muestra la columna con el nombre del vehículo.
 */
export function RecordsTable({
  records,
  vehicles,
  showVehicle = false,
}: {
  records: EnrichedRecord[];
  vehicles: Vehicle[];
  showVehicle?: boolean;
}) {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  // Si todas las cargas comparten unidad, la columna de consumo la lleva en el
  // encabezado; si están mezcladas, se aclara en cada fila.
  const units = new Set(records.map((r) => fuelType(r.fuelType).unit));
  const commonUnit = units.size === 1 ? [...units][0] : null;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            {showVehicle ? <th>Vehículo</th> : null}
            <th className="text-right">Odómetro</th>
            <th className="text-right">Tramo</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Total</th>
            <th className="text-right">
              Consumo{commonUnit ? ` (${commonUnit}/100km)` : ""}
            </th>
            <th className="text-right">$/km</th>
            <th>Estación</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const vehicle = vehicleById.get(record.vehicleId);
            const fuel = fuelType(record.fuelType);
            const stationData = record.station ? station(record.station) : null;
            const payment = paymentMethod(record.paymentMethod);

            return (
              <tr key={record.id}>
                <td>
                  <span className="font-medium text-ink-100">{formatDate(record.filledAt)}</span>
                  {!record.isFullTank ? (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
                      parcial
                    </span>
                  ) : null}
                  {record.missedPreviousFill ? (
                    <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-rose-300 uppercase">
                      salteada
                    </span>
                  ) : null}
                </td>

                {showVehicle ? (
                  <td>
                    {vehicle ? (
                      <Link
                        href={`/vehiculos/${vehicle.id}`}
                        className="inline-flex items-center gap-2 hover:text-accent"
                      >
                        <ColorDot color={vehicle.color} />
                        {vehicle.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}

                <td className="tabular text-right">{formatNumber(record.odometer, 0)} km</td>
                <td className="tabular text-right text-ink-400">
                  {record.distance !== null ? `+${formatNumber(record.distance, 0)} km` : "—"}
                </td>
                <td className="tabular text-right">
                  {formatNumber(record.liters, 2)} {fuel.unit}
                </td>
                <td className="tabular text-right">{formatCurrency(record.pricePerLiter)}</td>
                <td className="tabular text-right font-semibold text-ink-50">
                  {formatCurrency(record.totalAmount)}
                </td>
                <td className="tabular text-right">
                  {record.consumption !== null ? (
                    <span className="font-medium text-cyan-300">
                      {formatNumber(record.consumption, 2)}
                      {commonUnit ? null : (
                        <span className="ml-1 text-[11px] text-ink-500">{fuel.unit}/100km</span>
                      )}
                    </span>
                  ) : (
                    <span title={record.consumptionNote ?? undefined} className="text-ink-500">
                      —
                    </span>
                  )}
                </td>
                <td className="tabular text-right">
                  {record.costPerKm !== null ? formatCurrency(record.costPerKm) : "—"}
                </td>
                <td>
                  <span className="text-ink-300">{stationData?.label ?? "—"}</span>
                  {payment ? (
                    <span className="block text-[11px] text-ink-500">{payment.label}</span>
                  ) : null}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/cargas/${record.id}/editar`}
                      className="btn btn-ghost px-2.5 py-1.5 text-xs"
                    >
                      Editar
                    </Link>
                    <form action={deleteFuelRecordAction}>
                      <input type="hidden" name="recordId" value={record.id} />
                      <ConfirmButton
                        message="¿Borrar esta carga? No se puede deshacer."
                        className="btn btn-ghost px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                      >
                        Borrar
                      </ConfirmButton>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
