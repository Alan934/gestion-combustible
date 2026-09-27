import { StatCard } from "@/components/ui";
import { formatKm, formatNumber } from "@/lib/format";
import type { FleetFuelConsumption } from "@/lib/metrics";

/**
 * El consumo de la flota, una tarjeta por combustible.
 *
 * No hay un número único: los litros de nafta y los m³ de GNC no se suman, así
 * que cada combustible trae el suyo, con su unidad, su color y sus reglas
 * —medido si algún vehículo llegó a medir lleno a lleno, estimado con su margen
 * si ninguno—. Con un solo combustible la tarjeta queda igual que siempre.
 *
 * Devuelve varias tarjetas sueltas a propósito: van directo adentro de la grilla
 * de KPIs de la página, como una más.
 */
export function FuelConsumptionCards({ fuels }: { fuels: FleetFuelConsumption[] }) {
  if (!fuels.length) {
    return (
      <StatCard
        label="Consumo promedio"
        value="—"
        hint="Necesitás dos cargas a tanque lleno"
        accent="#a78bfa"
      />
    );
  }

  return (
    <>
      {fuels.map((fuel) => (
        <StatCard
          key={fuel.fuelTypeId}
          label={fuels.length > 1 ? `Consumo · ${fuel.short}` : "Consumo promedio"}
          value={
            fuel.avgConsumption
              ? `${formatNumber(fuel.avgConsumption, 2)} ${fuel.consumptionUnit}`
              : fuel.estimatedConsumption
                ? `≈ ${formatNumber(fuel.estimatedConsumption, 2)} ${fuel.consumptionUnit}`
                : "—"
          }
          hint={
            fuel.avgKmPerUnit
              ? `${formatNumber(fuel.avgKmPerUnit, 2)} ${fuel.efficiencyUnit}${
                  fuel.vehicles > 1 ? ` · ${fuel.vehicles} vehículos` : ""
                }`
              : fuel.estimatedConsumption
                ? `± ${formatNumber(fuel.estimatedMargin, 2)}${
                    fuel.estimatedLowPrecision ? " · precisión baja" : ""
                  } · estimado sobre ${formatKm(fuel.estimatedDistance)} sin tanque lleno`
                : "Necesitás dos cargas a tanque lleno"
          }
          accent={fuel.color}
        />
      ))}
    </>
  );
}
