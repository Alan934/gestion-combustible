import { FUEL_TYPES, PAYMENT_METHODS, STATIONS, VAT_RATE } from "@/lib/catalogs";
import type { FuelTypeId, PaymentMethodId, StationId } from "@/lib/catalogs";
import { round } from "@/lib/format";

/**
 * Contrato de la lectura automática de tickets, independiente del proveedor.
 * `extractReceipts` (en ./index.ts) devuelve estos objetos; el módulo del modelo
 * sólo tiene que completar `ExtractedReceipt` y dejar en `null` lo que no pueda
 * leer con seguridad.
 */

export type ExtractedReceipt = {
  /** "2026-08-17T17:12" en la hora impresa en el ticket. */
  filledAt: string | null;
  liters: number | null;
  pricePerLiter: number | null;
  totalAmount: number | null;
  fuelType: FuelTypeId | null;
  /** Nombre comercial tal cual figura: "V-POWER NITRO + DIESEL". */
  productName: string | null;
  station: StationId | null;
  stationBranch: string | null;
  paymentMethod: PaymentMethodId | null;
  invoiceNumber: string | null;
  netAmount: number | null;
  vatAmount: number | null;
  otherTaxes: number | null;
  /** Algunos controladores fiscales imprimen el kilometraje. Casi nunca. */
  odometer: number | null;
  /** Campos que el modelo vio borrosos o dudosos. */
  unreadableFields: string[];
};

/** Resultado ya verificado del lado del servidor. */
export type VerifiedReceipt = ExtractedReceipt & {
  checks: {
    /** litros × precio ≈ total */
    arithmetic: "ok" | "mismatch" | "incomplete";
    arithmeticDrift: number | null;
    /** neto + IVA + otros tributos ≈ total */
    fiscal: "ok" | "mismatch" | "incomplete";
    fiscalDrift: number | null;
  };
  warnings: string[];
  /** Resumen corto para mostrar en la lista de comprobantes detectados. */
  label: string;
};

/* -------------------------------------------------------------------------- */
/*                                   Prompt                                    */
/* -------------------------------------------------------------------------- */

const fuelOptions = FUEL_TYPES.map((f) => `  - ${f.id}: ${f.label} (${f.aliases.join(", ")})`).join(
  "\n",
);
const stationOptions = STATIONS.map((s) => `  - ${s.id}: ${s.label}`).join("\n");
const paymentOptions = PAYMENT_METHODS.map((p) => `  - ${p.id}: ${p.label}`).join("\n");

export const EXTRACTION_PROMPT = `Sos un asistente que lee tickets y facturas de estaciones de servicio de Argentina y extrae los datos de la carga de combustible.

Te paso una o varias imágenes. Pueden ser:
- Varias fotos del MISMO comprobante (distintos ángulos, o la parte de arriba y la de abajo). En ese caso combinalas y devolvé UN solo objeto.
- Fotos de comprobantes DISTINTOS. En ese caso devolvé un objeto por cada comprobante.
Agrupá por número de comprobante, fecha e importe total. Ante la duda de si son el mismo, tratalos como el mismo.

REGLAS INNEGOCIABLES:
1. No inventes NADA. Si un dato no se lee con seguridad, poné null y agregá el nombre del campo en "unreadableFields".
2. Los números van con punto decimal y sin separador de miles: 60015.98, no "60.015,98".
3. En los tickets argentinos la coma es el separador decimal. "24,0160" son 24,016 litros. "2499,000" son 2499 pesos.

EL PRECIO POR LITRO — ESTO ES LO MÁS IMPORTANTE:
Muchos tickets muestran DOS precios unitarios distintos:
- El precio NETO unitario, sin impuestos. Suele aparecer arriba, en un renglón tipo "24,0160 u x 1814,8069".
- El precio FINAL al público, con impuestos incluidos. Suele aparecer en el renglón del ítem junto al importe, tipo "24,016 L $ 2499,000".
"pricePerLiter" tiene que ser SIEMPRE el precio FINAL al público, el que multiplicado por los litros da el TOTAL del ticket.
Verificá la cuenta antes de responder: liters × pricePerLiter debe dar totalAmount. Si te da el neto gravado en vez del total, agarraste el precio equivocado.

GNC Y ELÉCTRICO:
El GNC no se vende por litro sino por metro cúbico (m³), y la carga eléctrica por kWh. En esos casos "liters" es la cantidad de m³ o kWh, y "pricePerLiter" el precio por m³ o por kWh. La cuenta cantidad × precio = total vale igual.
Ojo con los tickets de GNC: algunos muestran además el equivalente en litros de nafta. Ese número NO va: usá siempre los m³ despachados.

ESTRUCTURA IMPOSITIVA (tickets de combustible en Argentina):
  neto gravado + IVA 21% + impuestos internos (ITC / IDC) = TOTAL
- "netAmount" es el "SUBTOT. IMP. NETO GRAVADO".
- "vatAmount" es el importe de la alícuota de IVA (21%), no el porcentaje.
- "otherTaxes" es el "IMPORTE TOTAL OTROS TRIBUTOS" (impuesto a los combustibles líquidos y al dióxido de carbono).
- "totalAmount" es el TOTAL final que pagó el cliente.

TIPO DE COMBUSTIBLE — elegí uno de estos identificadores según el nombre comercial del producto:
${fuelOptions}
Guardá además el nombre comercial textual en "productName".

ESTACIÓN — elegí el identificador de la bandera:
${stationOptions}
En "stationBranch" poné la localidad o la dirección del local, no el nombre de la razón social. Ejemplo: si dice "Domicilio: Rivadavia 7 esq Colon / Costa de Araujo - Lavalle / Mendoza", poné "Rivadavia 7 esq. Colón, Costa de Araujo - Lavalle, Mendoza".

MEDIO DE PAGO — elegí el identificador:
${paymentOptions}
Buscalo en la sección "RECIBI/MOS" o similar del pie del ticket.

OTROS CAMPOS:
- "filledAt": fecha y hora del ticket en formato "AAAA-MM-DDTHH:MM". Las fechas argentinas van DD/MM/AAAA: "17/08/2026" es 17 de agosto de 2026. Si no hay hora, usá "12:00".
- "invoiceNumber": el número de comprobante, tipo "00015-00107982".
- "odometer": el kilometraje del vehículo. Casi ningún ticket lo trae; si ves "Km:00" o "Km:" vacío, eso NO es un kilometraje, poné null.

Devolvé únicamente el JSON que corresponde al schema.`;

/* -------------------------------------------------------------------------- */
/*                          Verificación de lo extraído                        */
/* -------------------------------------------------------------------------- */

const ARITHMETIC_TOLERANCE = 0.02;
const FISCAL_TOLERANCE = 0.02;

const FIELD_LABELS: Record<string, string> = {
  filledAt: "fecha y hora",
  liters: "litros",
  pricePerLiter: "precio por litro",
  totalAmount: "total",
  fuelType: "combustible",
  station: "estación",
  stationBranch: "sucursal",
  paymentMethod: "medio de pago",
  invoiceNumber: "número de factura",
  netAmount: "neto gravado",
  vatAmount: "IVA",
  otherTaxes: "otros tributos",
  odometer: "odómetro",
};

/**
 * Un ticket de combustible es aritméticamente redundante: los litros por el
 * precio dan el total, y el desglose impositivo también suma el total. Eso nos
 * deja verificar la lectura del modelo sin confiar en lo que él diga de sí mismo.
 */
export function verifyReceipt(receipt: ExtractedReceipt): VerifiedReceipt {
  const warnings: string[] = [];
  const { liters, pricePerLiter, totalAmount, netAmount, vatAmount, otherTaxes } = receipt;

  /* --- litros × precio = total --- */
  let arithmetic: VerifiedReceipt["checks"]["arithmetic"] = "incomplete";
  let arithmeticDrift: number | null = null;

  if (liters && pricePerLiter && totalAmount) {
    arithmeticDrift = round(Math.abs(liters * pricePerLiter - totalAmount) / totalAmount, 4);
    arithmetic = arithmeticDrift <= ARITHMETIC_TOLERANCE ? "ok" : "mismatch";

    if (arithmetic === "mismatch") {
      // El error más común: el modelo agarró el precio neto en vez del final.
      const impliedPrice = round(totalAmount / liters, 3);
      warnings.push(
        `Los litros por el precio no dan el total: ${liters} × ${pricePerLiter} = ${round(liters * pricePerLiter, 2)}, pero el total dice ${totalAmount}. Con esos litros el precio debería ser ${impliedPrice}. Revisá los tres valores contra la foto.`,
      );
    }
  } else {
    const missing = [
      !liters && "litros",
      !pricePerLiter && "precio por litro",
      !totalAmount && "total",
    ].filter(Boolean);
    if (missing.length && missing.length < 3) {
      warnings.push(
        `No se pudo leer ${missing.join(" ni ")}. Con dos de los tres valores el formulario calcula el que falta.`,
      );
    }
  }

  /* --- neto + IVA + otros = total --- */
  let fiscal: VerifiedReceipt["checks"]["fiscal"] = "incomplete";
  let fiscalDrift: number | null = null;

  if (totalAmount && netAmount !== null && vatAmount !== null && otherTaxes !== null) {
    const sum = netAmount + vatAmount + otherTaxes;
    fiscalDrift = round(Math.abs(sum - totalAmount) / totalAmount, 4);
    fiscal = fiscalDrift <= FISCAL_TOLERANCE ? "ok" : "mismatch";

    if (fiscal === "mismatch") {
      warnings.push(
        `El desglose impositivo no cierra: ${netAmount} + ${vatAmount} + ${otherTaxes} = ${round(sum, 2)}, distinto del total ${totalAmount}.`,
      );
    }
  }

  /* --- IVA contra la alícuota --- */
  if (netAmount !== null && vatAmount !== null && netAmount > 0) {
    const expectedVat = netAmount * VAT_RATE;
    if (Math.abs(expectedVat - vatAmount) / expectedVat > 0.03) {
      warnings.push(
        `El IVA leído (${vatAmount}) no es el 21% del neto gravado (${round(expectedVat, 2)}).`,
      );
    }
  }

  /* --- Campos que el modelo marcó como dudosos --- */
  const unreadable = receipt.unreadableFields
    .map((field) => FIELD_LABELS[field] ?? field)
    .filter((label, index, all) => all.indexOf(label) === index);

  if (unreadable.length) {
    warnings.push(`No se leyeron con claridad: ${unreadable.join(", ")}. Verificalos vos.`);
  }

  /* --- El odómetro nunca viene en el ticket --- */
  if (receipt.odometer === null) {
    warnings.push("Los kilómetros del odómetro no están en el ticket: cargalos a mano.");
  }

  return {
    ...receipt,
    checks: { arithmetic, arithmeticDrift, fiscal, fiscalDrift },
    warnings,
    label: buildLabel(receipt),
  };
}

function buildLabel(receipt: ExtractedReceipt) {
  const parts: string[] = [];

  if (receipt.filledAt) {
    const [date] = receipt.filledAt.split("T");
    const [year, month, day] = date.split("-");
    if (year && month && day) parts.push(`${day}/${month}/${year}`);
  }
  if (receipt.station) {
    parts.push(STATIONS.find((s) => s.id === receipt.station)?.label ?? receipt.station);
  }
  if (receipt.totalAmount) {
    parts.push(
      new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
        receipt.totalAmount,
      ),
    );
  }

  return parts.join(" · ") || "Comprobante sin identificar";
}

/**
 * Junta comprobantes que en realidad son el mismo, por si llegaron varias fotos
 * y el modelo los devolvió por separado.
 */
export function dedupeReceipts(receipts: ExtractedReceipt[]): ExtractedReceipt[] {
  const seen = new Map<string, ExtractedReceipt>();

  for (const receipt of receipts) {
    const key =
      receipt.invoiceNumber?.replace(/\s/g, "") ??
      `${receipt.filledAt ?? "?"}|${receipt.totalAmount ?? "?"}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, receipt);
      continue;
    }

    // Se combinan: gana el primer valor no nulo de cada campo.
    seen.set(key, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(receipt).filter(([field, value]) => {
          if (field === "unreadableFields") return false;
          return value !== null && existing[field as keyof ExtractedReceipt] === null;
        }),
      ),
      unreadableFields: [
        ...new Set([...existing.unreadableFields, ...receipt.unreadableFields]),
      ],
    });
  }

  return [...seen.values()];
}
