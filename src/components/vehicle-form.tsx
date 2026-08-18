"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Card, CardHeader, Field } from "@/components/ui";
import {
  createVehicleAction,
  updateVehicleAction,
  type FormState,
} from "@/lib/actions/vehicles";
import { FUEL_TYPES, VEHICLE_COLORS, fuelUnit } from "@/lib/catalogs";
import type { Vehicle } from "@/lib/db/schema";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const isEdit = Boolean(vehicle);
  const [state, formAction] = useActionState<FormState, FormData>(
    isEdit ? updateVehicleAction : createVehicleAction,
    null,
  );
  const [color, setColor] = useState(vehicle?.color ?? VEHICLE_COLORS[0]);
  // El combustible define las unidades del resto del formulario.
  const [selectedFuel, setSelectedFuel] = useState<string>(vehicle?.fuelType ?? "nafta_super");
  const [secondaryFuel, setSecondaryFuel] = useState<string>(vehicle?.secondaryFuelType ?? "");
  const unit = fuelUnit(selectedFuel);
  const secondaryUnit = secondaryFuel ? fuelUnit(secondaryFuel) : null;

  return (
    <form action={formAction} className="grid gap-5">
      {isEdit ? <input type="hidden" name="vehicleId" value={vehicle!.id} /> : null}
      <input type="hidden" name="color" value={color} />

      <Card>
        <CardHeader title="Identificación" subtitle="Cómo vas a reconocer este vehículo" />
        <div className="card-pad grid gap-4 sm:grid-cols-2">
          <Field
            label="Nombre *"
            htmlFor="name"
            className="sm:col-span-2"
            hint="El alias con el que lo llamás todos los días. Ej: “La Hilux”, “Auto de casa”."
          >
            <input
              id="name"
              name="name"
              required
              defaultValue={vehicle?.name}
              placeholder="Mi camioneta"
              className="input"
            />
          </Field>

          <Field label="Marca" htmlFor="brand">
            <input
              id="brand"
              name="brand"
              defaultValue={vehicle?.brand ?? ""}
              placeholder="Toyota"
              className="input"
            />
          </Field>

          <Field label="Modelo" htmlFor="model">
            <input
              id="model"
              name="model"
              defaultValue={vehicle?.model ?? ""}
              placeholder="Hilux SRV 2.8"
              className="input"
            />
          </Field>

          <Field label="Año" htmlFor="year">
            <input
              id="year"
              name="year"
              type="number"
              min={1900}
              max={new Date().getFullYear() + 2}
              defaultValue={vehicle?.year ?? ""}
              placeholder="2021"
              className="input"
            />
          </Field>

          <Field label="Patente" htmlFor="plate">
            <input
              id="plate"
              name="plate"
              defaultValue={vehicle?.plate ?? ""}
              placeholder="AB 123 CD"
              className="input uppercase"
            />
          </Field>

          <Field label="Color en los gráficos" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {VEHICLE_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={`Color ${option}`}
                  aria-pressed={color === option}
                  className={`size-8 rounded-full transition ${
                    color === option ? "ring-2 ring-white/70 ring-offset-2 ring-offset-ink-900" : ""
                  }`}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Datos técnicos"
          subtitle="Opcionales, pero desbloquean métricas: autonomía, costo de llenar el tanque y comparación contra el consumo de fábrica"
        />
        <div className="card-pad grid gap-4 sm:grid-cols-2">
          <Field label="Combustible habitual" htmlFor="fuelType">
            <select
              id="fuelType"
              name="fuelType"
              value={selectedFuel}
              onChange={(event) => setSelectedFuel(event.target.value)}
              className="input"
            >
              {FUEL_TYPES.map((fuel) => (
                <option key={fuel.id} value={fuel.id}>
                  {fuel.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={`Capacidad del tanque (${unit})`}
            htmlFor="tankCapacity"
            hint={
              selectedFuel === "gnc"
                ? "Los m³ que entran en el tubo, no los litros de agua del cilindro: un tubo de 60 L de agua carga alrededor de 14 m³."
                : "Habilita el cálculo de autonomía y del costo de un tanque lleno."
            }
          >
            <input
              id="tankCapacity"
              name="tankCapacity"
              inputMode="decimal"
              defaultValue={vehicle?.tankCapacity ?? ""}
              placeholder={selectedFuel === "gnc" ? "14" : "80"}
              className="input"
            />
          </Field>

          <Field
            label="Odómetro actual (km)"
            htmlFor="initialOdometer"
            hint="Los kilómetros que marca hoy. Sirve de referencia inicial."
          >
            <input
              id="initialOdometer"
              name="initialOdometer"
              inputMode="decimal"
              defaultValue={vehicle?.initialOdometer ?? ""}
              placeholder="125000"
              className="input"
            />
          </Field>

          <Field
            label={`Consumo de referencia (${unit}/100km)`}
            htmlFor="targetConsumption"
            hint="El que declara el fabricante. La app te muestra cuánto te desviás del ideal."
          >
            <input
              id="targetConsumption"
              name="targetConsumption"
              inputMode="decimal"
              defaultValue={vehicle?.targetConsumption ?? ""}
              placeholder={selectedFuel === "gnc" ? "11" : "8.5"}
              className="input"
            />
          </Field>

          <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={vehicle?.notes ?? ""}
              placeholder="Cubiertas nuevas desde 120.000 km, uso mayormente en ruta…"
              className="input resize-y"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Segundo combustible"
          subtitle="Para vehículos bicombustible: el caso típico es un auto a nafta con equipo de GNC"
        />
        <div className="card-pad grid gap-4 sm:grid-cols-3">
          <Field
            label="¿Usa un segundo combustible?"
            htmlFor="secondaryFuelType"
            className="sm:col-span-3"
            hint="Cada combustible lleva su propio consumo y su propio costo por kilómetro, y la ficha te muestra cuál te conviene."
          >
            <select
              id="secondaryFuelType"
              name="secondaryFuelType"
              value={secondaryFuel}
              onChange={(event) => setSecondaryFuel(event.target.value)}
              className="input"
            >
              <option value="">No, usa uno solo</option>
              {FUEL_TYPES.filter((fuel) => fuel.id !== selectedFuel).map((fuel) => (
                <option key={fuel.id} value={fuel.id}>
                  Sí, también {fuel.label}
                </option>
              ))}
            </select>
          </Field>

          {secondaryFuel ? (
            <>
              <Field
                label={`Capacidad del segundo tanque (${secondaryUnit})`}
                htmlFor="secondaryTankCapacity"
                hint={
                  secondaryFuel === "gnc"
                    ? "Los m³ que entran en el tubo: uno de 60 L de agua carga alrededor de 14 m³."
                    : undefined
                }
              >
                <input
                  id="secondaryTankCapacity"
                  name="secondaryTankCapacity"
                  inputMode="decimal"
                  defaultValue={vehicle?.secondaryTankCapacity ?? ""}
                  placeholder={secondaryFuel === "gnc" ? "14" : "50"}
                  className="input"
                />
              </Field>

              <Field
                label={`Consumo de referencia (${secondaryUnit}/100km)`}
                htmlFor="secondaryTargetConsumption"
              >
                <input
                  id="secondaryTargetConsumption"
                  name="secondaryTargetConsumption"
                  inputMode="decimal"
                  defaultValue={vehicle?.secondaryTargetConsumption ?? ""}
                  placeholder={secondaryFuel === "gnc" ? "11" : "8.5"}
                  className="input"
                />
              </Field>

              <p className="alert-info sm:col-span-3">
                Al registrar cada carga vas a elegir con cuál cargaste. El consumo de cada
                combustible se calcula por separado, de tanque lleno a tanque lleno del mismo
                combustible.
              </p>
            </>
          ) : null}
        </div>
      </Card>

      {state?.error ? (
        <p className="alert-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={isEdit ? "Guardar cambios" : "Crear vehículo"} />
        <Link href={isEdit ? `/vehiculos/${vehicle!.id}` : "/vehiculos"} className="btn btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
