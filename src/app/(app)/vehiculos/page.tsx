import Link from "next/link";
import type { Metadata } from "next";

import { Badge, Card, ColorDot, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth/session";
import { fuelType } from "@/lib/catalogs";
import { formatCurrency, formatDate, formatKm, formatNumber } from "@/lib/format";
import { getDashboardData } from "@/lib/queries";

export const metadata: Metadata = { title: "Vehículos" };

export default async function VehiclesPage() {
  const session = await requireSession();
  const { vehicles, stats } = await getDashboardData(session.userId);

  return (
    <>
      <PageHeader
        title="Vehículos"
        description="Cada vehículo lleva su propio historial de cargas, consumo y gasto."
      >
        <Link href="/vehiculos/nuevo" className="btn btn-primary">
          + Nuevo vehículo
        </Link>
      </PageHeader>

      {vehicles.length === 0 ? (
        <EmptyState
          icon="🚗"
          title="Todavía no cargaste ningún vehículo"
          description="Empezá dando de alta el primero. Después vas a poder registrar cada carga de combustible y ver cómo evoluciona su consumo."
          actionLabel="Crear mi primer vehículo"
          actionHref="/vehiculos/nuevo"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => {
            const vehicleStats = stats.find((s) => s.vehicleId === vehicle.id);
            const fuel = fuelType(vehicle.fuelType);

            return (
              <Link
                key={vehicle.id}
                href={`/vehiculos/${vehicle.id}`}
                className="group block transition hover:-translate-y-0.5"
              >
                <Card className="card-pad h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 truncate font-semibold text-ink-50 group-hover:text-accent">
                        <ColorDot color={vehicle.color} />
                        {vehicle.name}
                      </h2>
                      <p className="mt-1 truncate text-sm text-ink-400">
                        {[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" · ") ||
                          "Sin datos técnicos"}
                      </p>
                    </div>
                    {vehicle.plate ? (
                      <span className="tabular rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-xs font-semibold tracking-wider text-ink-200">
                        {vehicle.plate}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge color={fuel.color}>{fuel.label}</Badge>
                    {vehicle.tankCapacity ? (
                      <Badge>
                        {formatNumber(vehicle.tankCapacity, 0)} {fuel.unit} de tanque
                      </Badge>
                    ) : null}
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/6 pt-4">
                    <div>
                      <dt className="text-xs text-ink-500">Consumo promedio</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {vehicleStats?.avgConsumption
                          ? `${formatNumber(vehicleStats.avgConsumption, 2)} ${vehicleStats.consumptionUnit}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Costo por km</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {vehicleStats?.costPerKm ? formatCurrency(vehicleStats.costPerKm) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Gasto total</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {formatCurrency(vehicleStats?.totalSpent ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Odómetro</dt>
                      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-100">
                        {formatKm(vehicleStats?.currentOdometer ?? vehicle.initialOdometer)}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 text-xs text-ink-500">
                    {vehicleStats?.fills
                      ? `${vehicleStats.fills} ${vehicleStats.fills === 1 ? "carga" : "cargas"} · última el ${formatDate(vehicleStats.lastFillAt)}`
                      : "Sin cargas registradas todavía"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
