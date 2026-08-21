"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { ReceiptScanner } from "@/components/receipt-scanner";
import { Card, CardHeader, Field } from "@/components/ui";
import {
  createFuelRecordAction,
  updateFuelRecordAction,
  type FormState,
} from "@/lib/actions/fuel-records";
import type { VerifiedReceipt } from "@/lib/ai/receipt";
import { FUEL_TYPES, PAYMENT_METHODS, STATIONS, VAT_RATE, fuelType } from "@/lib/catalogs";
import type { FuelRecord } from "@/lib/db/schema";
import { formatCurrency, formatNumber, round, toDateTimeLocalValue } from "@/lib/format";

export type VehicleOption = {
  id: string;
  name: string;
  fuelType: string;
  secondaryFuelType: string | null;
  tankCapacity: number | null;
  secondaryTankCapacity: number | null;
  lastOdometer: number | null;
  lastPricePerLiter: number | null;
  lastPriceByFuel: Record<string, number>;
  lastIsFullTankByFuel: Record<string, boolean>;
  lastStation: string | null;
  lastPaymentMethod: string | null;
};

type TripleKey = "liters" | "pricePerLiter" | "totalAmount";
const TRIPLE_KEYS: TripleKey[] = ["liters", "pricePerLiter", "totalAmount"];

const DECIMALS: Record<TripleKey, number> = {
  liters: 3,
  pricePerLiter: 3,
  totalAmount: 2,
};

/** Acepta coma o punto como separador decimal. */
function toNumber(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toInput(value: number, decimals: number) {
  return String(round(value, decimals));
}

type TripleValues = Record<TripleKey, string>;

type TripleState = {
  values: TripleValues;
  /** Campos con valor propio, del más reciente al más viejo. */
  order: TripleKey[];
  /** Cuál de los tres se está calculando solo. */
  derived: TripleKey | null;
};

/** Con los dos primeros campos de `order` calcula el tercero. */
function resolveTriple(values: TripleValues, order: TripleKey[]): TripleState {
  const filled = order.filter((key) => values[key].trim());
  const inputs = filled.slice(0, 2);

  if (inputs.length < 2) return { values, order: filled, derived: null };

  const derived = TRIPLE_KEYS.find((key) => !inputs.includes(key))!;
  const liters = toNumber(values.liters);
  const price = toNumber(values.pricePerLiter);
  const total = toNumber(values.totalAmount);

  let computed: number | null = null;
  if (derived === "totalAmount" && liters && price) computed = liters * price;
  if (derived === "liters" && total && price) computed = total / price;
  if (derived === "pricePerLiter" && total && liters) computed = total / liters;

  if (computed === null) return { values, order: filled, derived: null };

  return {
    values: { ...values, [derived]: toInput(computed, DECIMALS[derived]) },
    order: filled,
    derived,
  };
}

function initialTriple(record?: FuelRecord): TripleState {
  if (!record) {
    return { values: { liters: "", pricePerLiter: "", totalAmount: "" }, order: [], derived: null };
  }
  return {
    values: {
      liters: toInput(record.liters, 3),
      pricePerLiter: toInput(record.pricePerLiter, 3),
      totalAmount: toInput(record.totalAmount, 2),
    },
    order: ["totalAmount", "liters"],
    derived: null,
  };
}

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Cómo viene cargando el usuario ese vehículo con ese combustible. Si no hay
 * historial, se asume tanque lleno: es lo más común y lo que hace que el consumo
 * se pueda calcular desde la segunda carga.
 */
function rememberedFullTank(vehicles: VehicleOption[], vehicleId: string, fuelId: string) {
  return vehicles.find((v) => v.id === vehicleId)?.lastIsFullTankByFuel[fuelId] ?? true;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function FuelRecordForm({
  vehicles,
  record,
  defaultVehicleId,
  isFirstRecord = false,
  scanningEnabled = false,
}: {
  vehicles: VehicleOption[];
  record?: FuelRecord;
  defaultVehicleId?: string;
  isFirstRecord?: boolean;
  scanningEnabled?: boolean;
}) {
  const isEdit = Boolean(record);
  const [state, formAction] = useActionState<FormState, FormData>(
    isEdit ? updateFuelRecordAction : createFuelRecordAction,
    null,
  );

  const [vehicleId, setVehicleId] = useState(
    record?.vehicleId ?? defaultVehicleId ?? vehicles[0]?.id ?? "",
  );
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const odometerRef = useRef<HTMLInputElement>(null);

  const [triple, setTriple] = useState<TripleState>(() => initialTriple(record));
  const [odometer, setOdometer] = useState(record ? String(record.odometer) : "");
  const selectedFuelInicial = record?.fuelType ?? vehicle?.fuelType ?? "nafta_super";
  const [selectedFuel, setSelectedFuel] = useState(selectedFuelInicial);
  /**
   * "Llené el tanque" arranca como venías cargando ese vehículo con ese
   * combustible: si tu última carga de nafta fue parcial, esta también.
   * `touched` marca que lo decidiste vos, y a partir de ahí no se toca más solo.
   */
  const [fullTank, setFullTank] = useState(() => ({
    value: record ? record.isFullTank : rememberedFullTank(vehicles, vehicleId, selectedFuelInicial),
    touched: Boolean(record),
  }));
  const isFullTank = fullTank.value;
  const setIsFullTank = (value: boolean) => setFullTank({ value, touched: true });
  const [missedPrevious, setMissedPrevious] = useState(record?.missedPreviousFill ?? false);

  const [details, setDetails] = useState({
    filledAt: record ? toDateTimeLocalValue(record.filledAt) : toDateTimeLocalValue(new Date()),
    station: record?.station ?? vehicle?.lastStation ?? "",
    stationBranch: record?.stationBranch ?? "",
    paymentMethod: record?.paymentMethod ?? vehicle?.lastPaymentMethod ?? "",
    invoiceNumber: record?.invoiceNumber ?? "",
    notes: record?.notes ?? "",
  });

  const [showTaxes, setShowTaxes] = useState(
    Boolean(record?.netAmount || record?.vatAmount || record?.otherTaxes || record?.invoiceNumber),
  );
  const [taxes, setTaxes] = useState({
    otherTaxes: record?.otherTaxes != null ? String(record.otherTaxes) : "",
    netAmount: record?.netAmount != null ? String(record.netAmount) : "",
  });

  /** Avisos de la última lectura automática que se aplicó al formulario. */
  const [scanNotice, setScanNotice] = useState<{ label: string; warnings: string[] } | null>(null);

  const unit = fuelType(selectedFuel).unit;

  /**
   * El valor del checkbox viene de cómo venías cargando (no lo tocaste vos en
   * este formulario y hay una carga anterior de ese combustible de la cual
   * copiarlo). Se avisa en pantalla para que el default no sea invisible.
   */
  const recuerdaCostumbre =
    !isEdit &&
    !fullTank.touched &&
    vehicle?.lastIsFullTankByFuel[selectedFuel] !== undefined;

  /* --- Bicombustible: qué combustible se está cargando cambia todo lo demás --- */
  const isDual = Boolean(vehicle?.secondaryFuelType);
  const isSecondary = Boolean(vehicle?.secondaryFuelType && selectedFuel === vehicle.secondaryFuelType);
  /** Precio de la última carga del combustible elegido, no de la última en general. */
  const lastPriceForFuel = vehicle?.lastPriceByFuel[selectedFuel] ?? null;
  /** Capacidad del tanque que corresponde al combustible elegido. */
  const tankForFuel = isSecondary ? (vehicle?.secondaryTankCapacity ?? null) : (vehicle?.tankCapacity ?? null);

  /**
   * Al cambiar de vehículo o de combustible, el checkbox vuelve a tomar la
   * costumbre de esa combinación — salvo que el usuario ya lo haya decidido a
   * mano en este formulario.
   */
  function applyRememberedFullTank(nextVehicleId: string, nextFuel: string) {
    setFullTank((prev) =>
      prev.touched ? prev : { value: rememberedFullTank(vehicles, nextVehicleId, nextFuel), touched: false },
    );
  }

  function changeFuel(nextFuel: string) {
    setSelectedFuel(nextFuel);
    applyRememberedFullTank(vehicleId, nextFuel);
  }

  function changeVehicle(nextVehicleId: string) {
    setVehicleId(nextVehicleId);
    const next = vehicles.find((v) => v.id === nextVehicleId);
    const nextFuel = next && !isEdit ? next.fuelType : selectedFuel;
    if (next && !isEdit) setSelectedFuel(nextFuel);
    applyRememberedFullTank(nextVehicleId, nextFuel);
  }

  /* ------------------ Cálculo automático del trío de valores ----------------- */

  function updateTriple(key: TripleKey, raw: string) {
    setTriple((prev) => {
      const values = { ...prev.values, [key]: raw };
      const order = [key, ...prev.order.filter((k) => k !== key)];
      return resolveTriple(values, order);
    });
  }

  function clearTriple() {
    setTriple({ values: { liters: "", pricePerLiter: "", totalAmount: "" }, order: [], derived: null });
  }

  /* ---------------------- Precargado desde la foto del ticket ---------------- */

  function applyReceipt(receipt: VerifiedReceipt) {
    const values: TripleValues = {
      liters: receipt.liters !== null ? String(receipt.liters) : "",
      pricePerLiter: receipt.pricePerLiter !== null ? String(receipt.pricePerLiter) : "",
      totalAmount: receipt.totalAmount !== null ? String(receipt.totalAmount) : "",
    };
    // El total y los litros son los datos más duros del ticket; si falta alguno,
    // el precio entra como respaldo y el faltante se calcula.
    const order: TripleKey[] = (["totalAmount", "liters", "pricePerLiter"] as TripleKey[]).filter(
      (key) => values[key],
    );
    setTriple(resolveTriple(values, order));

    if (receipt.filledAt && DATETIME_LOCAL.test(receipt.filledAt)) {
      setDetails((prev) => ({ ...prev, filledAt: receipt.filledAt! }));
    }
    if (receipt.fuelType) changeFuel(receipt.fuelType);
    if (receipt.odometer !== null) setOdometer(String(receipt.odometer));

    setDetails((prev) => ({
      ...prev,
      station: receipt.station ?? prev.station,
      stationBranch: receipt.stationBranch ?? prev.stationBranch,
      paymentMethod: receipt.paymentMethod ?? prev.paymentMethod,
      invoiceNumber: receipt.invoiceNumber ?? prev.invoiceNumber,
    }));

    if (receipt.netAmount !== null || receipt.otherTaxes !== null) {
      setTaxes({
        netAmount: receipt.netAmount !== null ? String(receipt.netAmount) : "",
        otherTaxes: receipt.otherTaxes !== null ? String(receipt.otherTaxes) : "",
      });
      setShowTaxes(true);
    }

    setScanNotice({ label: receipt.label, warnings: receipt.warnings });

    // Los kilómetros nunca vienen en el ticket: es lo único que falta siempre.
    if (receipt.odometer === null) {
      odometerRef.current?.focus();
      odometerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /* --------------------------- Vista previa del tramo ------------------------ */

  // Sin `useMemo`: el compilador de React ya memoiza estos cálculos derivados, y
  // hacerlo a mano acá le impide optimizar el componente entero.
  const lastOdometer = vehicle?.lastOdometer ?? null;

  const preview = (() => {
    const odo = toNumber(odometer);
    const liters = toNumber(triple.values.liters);
    const total = toNumber(triple.values.totalAmount);

    const distance = odo !== null && lastOdometer !== null ? round(odo - lastOdometer, 1) : null;
    const consumption =
      distance !== null && distance > 0 && liters ? round((liters / distance) * 100, 2) : null;
    const costPerKm = distance !== null && distance > 0 && total ? round(total / distance, 2) : null;

    return {
      distance,
      consumption,
      costPerKm,
      kmPerLiter: consumption ? round(100 / consumption, 2) : null,
    };
  })();

  /* ------------------------------ Desglose fiscal ---------------------------- */

  const taxBreakdown = (() => {
    const total = toNumber(triple.values.totalAmount);
    if (!total) return null;

    const other = toNumber(taxes.otherTaxes) ?? 0;
    const net = toNumber(taxes.netAmount) ?? round((total - other) / (1 + VAT_RATE), 2);
    const vat = round(net * VAT_RATE, 2);
    const rest = round(total - net - vat, 2);

    return { net, vat, other: toNumber(taxes.otherTaxes) ?? rest, total };
  })();

  const derivedBadge = (key: TripleKey) =>
    triple.derived === key ? (
      <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent uppercase">
        auto
      </span>
    ) : null;

  return (
    <div className="grid grid-cols-1 gap-5">
      {scanningEnabled ? <ReceiptScanner onApply={applyReceipt} /> : null}

      <form action={formAction} className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="grid grid-cols-1 gap-5">
          {isEdit ? <input type="hidden" name="recordId" value={record!.id} /> : null}

          {scanNotice ? (
            <div className="alert-info" role="status">
              <p className="font-semibold">Datos cargados desde el ticket · {scanNotice.label}</p>
              <p className="mt-1 text-xs">
                Revisá los campos contra la foto antes de guardar. Lo que corrijas queda como vos lo
                dejes.
              </p>
              {scanNotice.warnings.length ? (
                <ul className="mt-2 grid gap-1 text-xs text-amber-200">
                  {scanNotice.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <span aria-hidden>!</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* ------------------------------ Datos base ------------------------------ */}
          <Card>
            <CardHeader title="La carga" subtitle="Los datos que están sí o sí en el ticket" />
            <div className="card-pad grid gap-4 sm:grid-cols-2">
              <Field label="Vehículo *" htmlFor="vehicleId">
                <select
                  id="vehicleId"
                  name="vehicleId"
                  required
                  value={vehicleId}
                  onChange={(event) => changeVehicle(event.target.value)}
                  className="input"
                >
                  {vehicles.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha y hora *" htmlFor="filledAt">
                <input
                  id="filledAt"
                  name="filledAt"
                  type="datetime-local"
                  required
                  value={details.filledAt}
                  onChange={(event) =>
                    setDetails((prev) => ({ ...prev, filledAt: event.target.value }))
                  }
                  className="input"
                />
              </Field>

              {isDual && vehicle ? (
                <Field
                  label="¿Con cuál cargaste? *"
                  className="sm:col-span-2"
                  hint="Cada combustible lleva su propio consumo, así que esto define contra qué cadena se calcula el tramo."
                >
                  <div className="flex flex-wrap gap-2">
                    {[vehicle.fuelType, vehicle.secondaryFuelType!].map((fuelId) => {
                      const info = fuelType(fuelId);
                      const active = selectedFuel === fuelId;
                      return (
                        <button
                          key={fuelId}
                          type="button"
                          onClick={() => changeFuel(fuelId)}
                          aria-pressed={active}
                          className={`btn ${active ? "btn-primary" : "btn-secondary"}`}
                        >
                          {info.label}
                          <span className="opacity-70">({info.unit})</span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : null}

              <Field
                label="Kilómetros del odómetro *"
                htmlFor="odometer"
                className="sm:col-span-2"
                hint={
                  vehicle?.lastOdometer != null
                    ? `Última carga registrada: ${formatNumber(vehicle.lastOdometer, 0)} km.${
                        preview.distance !== null
                          ? ` Este tramo son ${formatNumber(preview.distance, 0)} km.`
                          : ""
                      }`
                    : "Los kilómetros que marca el tablero al momento de cargar."
                }
              >
                <input
                  ref={odometerRef}
                  id="odometer"
                  name="odometer"
                  inputMode="decimal"
                  required
                  value={odometer}
                  onChange={(event) => setOdometer(event.target.value)}
                  placeholder="125430"
                  className="input"
                />
              </Field>
            </div>
          </Card>

          {/* ------------------------- Litros / precio / total ---------------------- */}
          <Card>
            <CardHeader
              title={`${unit === "L" ? "Litros" : unit}, precio y total`}
              subtitle="Completá dos cualquiera y el tercero se calcula solo"
              action={
                <button
                  type="button"
                  onClick={clearTriple}
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                >
                  Limpiar
                </button>
              }
            />
            <div className="card-pad grid gap-4 sm:grid-cols-3">
              <Field
                label={`Cantidad (${unit})`}
                htmlFor="liters"
                hint={<span className="flex items-center gap-1.5">{derivedBadge("liters")}</span>}
              >
                <input
                  id="liters"
                  name="liters"
                  inputMode="decimal"
                  value={triple.values.liters}
                  onChange={(event) => updateTriple("liters", event.target.value)}
                  placeholder="24,016"
                  className={`input ${triple.derived === "liters" ? "border-accent/50 text-accent" : ""}`}
                />
              </Field>

              <Field
                label={`Precio por ${unit}`}
                htmlFor="pricePerLiter"
                hint={
                  <span className="flex flex-wrap items-center gap-1.5">
                    {derivedBadge("pricePerLiter")}
                    {lastPriceForFuel ? (
                      <button
                        type="button"
                        onClick={() => updateTriple("pricePerLiter", toInput(lastPriceForFuel, 3))}
                        className="text-accent hover:underline"
                      >
                        usar {formatCurrency(lastPriceForFuel)} (última carga
                        {isDual ? ` de ${fuelType(selectedFuel).short}` : ""})
                      </button>
                    ) : null}
                  </span>
                }
              >
                <input
                  id="pricePerLiter"
                  name="pricePerLiter"
                  inputMode="decimal"
                  value={triple.values.pricePerLiter}
                  onChange={(event) => updateTriple("pricePerLiter", event.target.value)}
                  placeholder="2499"
                  className={`input ${triple.derived === "pricePerLiter" ? "border-accent/50 text-accent" : ""}`}
                />
              </Field>

              <Field
                label="Total pagado ($)"
                htmlFor="totalAmount"
                hint={<span className="flex items-center gap-1.5">{derivedBadge("totalAmount")}</span>}
              >
                <input
                  id="totalAmount"
                  name="totalAmount"
                  inputMode="decimal"
                  value={triple.values.totalAmount}
                  onChange={(event) => updateTriple("totalAmount", event.target.value)}
                  placeholder="60015,98"
                  className={`input ${triple.derived === "totalAmount" ? "border-accent/50 text-accent" : ""}`}
                />
              </Field>
            </div>

            <div className="border-t border-white/6 px-5 pt-4 pb-5 sm:px-6">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="isFullTank"
                  checked={isFullTank}
                  onChange={(event) => setIsFullTank(event.target.checked)}
                  className="mt-0.5 size-4 accent-cyan-400"
                />
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">Llené el tanque</span>
                    {recuerdaCostumbre ? (
                      <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-300 uppercase">
                        como tu última carga
                        {isDual ? ` de ${fuelType(selectedFuel).short}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">
                    El consumo real se calcula de tanque lleno a tanque lleno. Si cargaste sólo una
                    parte, destildá esto: lo cargado se va a sumar al próximo tramo completo.
                  </span>
                </span>
              </label>

              <label className="mt-3 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="missedPreviousFill"
                  checked={missedPrevious}
                  onChange={(event) => setMissedPrevious(event.target.checked)}
                  className="mt-0.5 size-4 accent-cyan-400"
                />
                <span>
                  <span className="text-sm font-medium text-ink-100">
                    Me salteé alguna carga anterior
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">
                    Marcalo si cargaste sin registrarlo. Ese tramo se excluye del promedio de consumo
                    para no ensuciar las métricas.
                  </span>
                </span>
              </label>
            </div>
          </Card>

          {/* ---------------------------- Datos del ticket -------------------------- */}
          <Card>
            <CardHeader
              title="Dónde y cómo"
              subtitle="Opcional, pero permite comparar estaciones y medios de pago"
            />
            <div className="card-pad grid gap-4 sm:grid-cols-2">
              <Field label="Combustible" htmlFor="fuelType">
                <select
                  id="fuelType"
                  name="fuelType"
                  value={selectedFuel}
                  onChange={(event) => changeFuel(event.target.value)}
                  className="input"
                >
                  {FUEL_TYPES.map((fuel) => (
                    <option key={fuel.id} value={fuel.id}>
                      {fuel.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Estación" htmlFor="station">
                <select
                  id="station"
                  name="station"
                  value={details.station}
                  onChange={(event) =>
                    setDetails((prev) => ({ ...prev, station: event.target.value }))
                  }
                  className="input"
                >
                  <option value="">Sin especificar</option>
                  {STATIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Sucursal o dirección"
                htmlFor="stationBranch"
                hint="Ej: “Costa de Araujo — Lavalle, Mendoza”."
              >
                <input
                  id="stationBranch"
                  name="stationBranch"
                  value={details.stationBranch}
                  onChange={(event) =>
                    setDetails((prev) => ({ ...prev, stationBranch: event.target.value }))
                  }
                  placeholder="Rivadavia 7 esq. Colón"
                  className="input"
                />
              </Field>

              <Field label="Medio de pago" htmlFor="paymentMethod">
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  value={details.paymentMethod}
                  onChange={(event) =>
                    setDetails((prev) => ({ ...prev, paymentMethod: event.target.value }))
                  }
                  className="input"
                >
                  <option value="">Sin especificar</option>
                  {PAYMENT_METHODS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  value={details.notes}
                  onChange={(event) => setDetails((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Viaje a la costa, iba cargado…"
                  className="input resize-y"
                />
              </Field>
            </div>
          </Card>

          {/* ----------------------------- Datos fiscales --------------------------- */}
          <Card>
            <CardHeader
              title="Factura e impuestos"
              subtitle="Sólo si necesitás rendir el gasto o descargar IVA"
              action={
                <button
                  type="button"
                  onClick={() => setShowTaxes((open) => !open)}
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                >
                  {showTaxes ? "Ocultar" : "Mostrar"}
                </button>
              }
            />
            {showTaxes ? (
              <div className="card-pad grid gap-4 sm:grid-cols-3">
                <Field label="N° de factura" htmlFor="invoiceNumber" className="sm:col-span-3">
                  <input
                    id="invoiceNumber"
                    name="invoiceNumber"
                    value={details.invoiceNumber}
                    onChange={(event) =>
                      setDetails((prev) => ({ ...prev, invoiceNumber: event.target.value }))
                    }
                    placeholder="00015-00107982"
                    className="input"
                  />
                </Field>

                <Field
                  label="Impuestos internos (ITC/IDC)"
                  htmlFor="otherTaxes"
                  hint="El renglón “Importe total otros tributos” del ticket."
                >
                  <input
                    id="otherTaxes"
                    name="otherTaxes"
                    inputMode="decimal"
                    value={taxes.otherTaxes}
                    onChange={(event) => setTaxes((t) => ({ ...t, otherTaxes: event.target.value }))}
                    placeholder="7278,86"
                    className="input"
                  />
                </Field>

                <Field
                  label="Neto gravado"
                  htmlFor="netAmount"
                  hint="Si lo dejás vacío se deduce del total."
                >
                  <input
                    id="netAmount"
                    name="netAmount"
                    inputMode="decimal"
                    value={taxes.netAmount}
                    onChange={(event) => setTaxes((t) => ({ ...t, netAmount: event.target.value }))}
                    placeholder="43584,40"
                    className="input"
                  />
                </Field>

                <Field label="IVA 21%" hint="Calculado sobre el neto gravado.">
                  <input
                    name="vatAmount"
                    readOnly
                    value={taxBreakdown ? toInput(taxBreakdown.vat, 2) : ""}
                    className="input cursor-default text-ink-300"
                  />
                </Field>

                {taxBreakdown ? (
                  <p className="alert-info sm:col-span-3">
                    Neto {formatCurrency(taxBreakdown.net)} + IVA {formatCurrency(taxBreakdown.vat)} +
                    otros tributos {formatCurrency(taxBreakdown.other)} ={" "}
                    <strong>{formatCurrency(taxBreakdown.total)}</strong>
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          {state?.error ? (
            <p className="alert-error" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton label={isEdit ? "Guardar cambios" : "Guardar carga"} />
            {!isEdit ? (
              <button type="submit" name="cargarOtra" value="1" className="btn btn-secondary">
                Guardar y cargar otra
              </button>
            ) : null}
            <Link href="/cargas" className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </div>

        {/* ------------------------------ Panel lateral ---------------------------- */}
        <aside className="grid grid-cols-1 gap-4 lg:sticky lg:top-6">
          <Card className="card-pad">
            <h3 className="section-title">Vista previa del tramo</h3>
            <dl className="mt-4 grid gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-ink-400">Kilómetros recorridos</dt>
                <dd className="tabular text-sm font-semibold text-ink-100">
                  {preview.distance !== null ? `${formatNumber(preview.distance, 0)} km` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-ink-400">Consumo estimado</dt>
                <dd className="tabular text-sm font-semibold text-ink-100">
                  {preview.consumption !== null
                    ? `${formatNumber(preview.consumption, 2)} ${unit}/100km`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-ink-400">Rendimiento</dt>
                <dd className="tabular text-sm font-semibold text-ink-100">
                  {preview.kmPerLiter !== null
                    ? `${formatNumber(preview.kmPerLiter, 2)} km/${unit}`
                    : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-ink-400">Costo por kilómetro</dt>
                <dd className="tabular text-sm font-semibold text-ink-100">
                  {preview.costPerKm !== null ? formatCurrency(preview.costPerKm) : "—"}
                </dd>
              </div>
            </dl>

            {!isFullTank ? (
              <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
                Al ser una carga parcial, este consumo es sólo una referencia. El número real se va a
                calcular cuando vuelvas a llenar el tanque.
              </p>
            ) : null}

            {isFirstRecord ? (
              <p className="mt-4 rounded-xl border border-accent/25 bg-accent/8 px-3 py-2.5 text-xs leading-relaxed text-cyan-100">
                Esta es la primera carga del vehículo: sirve como punto de partida. El consumo aparece
                a partir de la segunda.
              </p>
            ) : null}
          </Card>

          {tankForFuel && toNumber(triple.values.pricePerLiter) ? (
            <Card className="card-pad">
              <h3 className="section-title">
                {isDual ? `Tanque lleno de ${fuelType(selectedFuel).short}` : "Tanque lleno"}
              </h3>
              <p className="tabular mt-2 text-xl font-semibold text-ink-50">
                {formatCurrency(tankForFuel * toNumber(triple.values.pricePerLiter)!)}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {formatNumber(tankForFuel, 0)} {unit} a este precio.
              </p>
            </Card>
          ) : null}
        </aside>
      </form>
    </div>
  );
}
