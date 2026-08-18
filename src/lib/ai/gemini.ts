import "server-only";

import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";

import { FUEL_TYPE_IDS, PAYMENT_METHOD_IDS, STATIONS } from "@/lib/catalogs";

import { EXTRACTION_PROMPT, dedupeReceipts, verifyReceipt } from "./receipt";
import type { ExtractedReceipt, VerifiedReceipt } from "./receipt";

/**
 * Implementación de la lectura de tickets con Gemini.
 *
 * Todo lo específico del proveedor vive acá: si mañana se cambia de modelo, se
 * reemplaza este archivo y el resto de la app no se entera. El contrato es
 * `extractReceipts(images) => VerifiedReceipt[]`.
 */

const DEFAULT_MODEL = "gemini-3.7-flash";
/** Si el modelo principal está saturado se cae a este, que aguanta bien la tarea. */
const FALLBACK_MODEL = "gemini-2.5-flash";
const ATTEMPTS_PER_MODEL = 2;

export type ReceiptImage = {
  mimeType: string;
  /** Contenido de la imagen en base64, sin el prefijo `data:`. */
  data: string;
};

export class ReceiptExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ReceiptExtractionError";
  }
}

/* -------------------------------------------------------------------------- */
/*                          Schema de salida estructurada                      */
/* -------------------------------------------------------------------------- */

const nullableString: Schema = { type: Type.STRING, nullable: true };
const nullableNumber: Schema = { type: Type.NUMBER, nullable: true };

const RECEIPT_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ["comprobantes"],
  properties: {
    comprobantes: {
      type: Type.ARRAY,
      description: "Un objeto por comprobante distinto detectado en las imágenes.",
      items: {
        type: Type.OBJECT,
        required: ["filledAt", "liters", "pricePerLiter", "totalAmount", "unreadableFields"],
        properties: {
          filledAt: {
            type: Type.STRING,
            nullable: true,
            description: 'Fecha y hora del ticket, formato "AAAA-MM-DDTHH:MM".',
          },
          liters: {
            type: Type.NUMBER,
            nullable: true,
            description: "Cantidad de litros (o m³ para GNC, kWh para eléctrico).",
          },
          pricePerLiter: {
            type: Type.NUMBER,
            nullable: true,
            description:
              "Precio FINAL al público por litro, impuestos incluidos. litros × este precio = total.",
          },
          totalAmount: {
            type: Type.NUMBER,
            nullable: true,
            description: "Total final pagado.",
          },
          fuelType: {
            type: Type.STRING,
            nullable: true,
            enum: [...FUEL_TYPE_IDS],
            description: "Identificador del tipo de combustible.",
          },
          productName: {
            ...nullableString,
            description: "Nombre comercial del producto tal como figura en el ticket.",
          },
          station: {
            type: Type.STRING,
            nullable: true,
            enum: STATIONS.map((s) => s.id),
            description: "Identificador de la bandera de la estación.",
          },
          stationBranch: {
            ...nullableString,
            description: "Dirección o localidad del local.",
          },
          paymentMethod: {
            type: Type.STRING,
            nullable: true,
            enum: [...PAYMENT_METHOD_IDS],
            description: "Identificador del medio de pago.",
          },
          invoiceNumber: { ...nullableString, description: "Número de comprobante." },
          netAmount: { ...nullableNumber, description: "Subtotal imponible neto gravado." },
          vatAmount: { ...nullableNumber, description: "Importe del IVA." },
          otherTaxes: { ...nullableNumber, description: "Importe total de otros tributos." },
          odometer: {
            ...nullableNumber,
            description: "Kilometraje del vehículo. Casi siempre null.",
          },
          unreadableFields: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Nombres de los campos que no se pudieron leer con seguridad.",
          },
        },
      },
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                  Extracción                                 */
/* -------------------------------------------------------------------------- */

let client: GoogleGenAI | null = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ReceiptExtractionError(
      "Falta GEMINI_API_KEY en el archivo .env. Sin esa clave no se pueden leer tickets.",
    );
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function isReceiptScanningEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Normaliza lo que devuelve el modelo: recorta strings y descarta números absurdos. */
function sanitize(raw: Record<string, unknown>): ExtractedReceipt {
  const text = (key: string) => {
    const value = raw[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const positive = (key: string) => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  };

  return {
    filledAt: text("filledAt"),
    liters: positive("liters"),
    pricePerLiter: positive("pricePerLiter"),
    totalAmount: positive("totalAmount"),
    fuelType: text("fuelType") as ExtractedReceipt["fuelType"],
    productName: text("productName"),
    station: text("station") as ExtractedReceipt["station"],
    stationBranch: text("stationBranch"),
    paymentMethod: text("paymentMethod") as ExtractedReceipt["paymentMethod"],
    invoiceNumber: text("invoiceNumber"),
    netAmount: positive("netAmount"),
    vatAmount: positive("vatAmount"),
    otherTaxes: positive("otherTaxes"),
    odometer: positive("odometer"),
    unreadableFields: Array.isArray(raw.unreadableFields)
      ? raw.unreadableFields.filter((field): field is string => typeof field === "string")
      : [],
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** El modelo está momentáneamente saturado: reintentar sirve. */
function isOverloaded(message: string) {
  return /UNAVAILABLE|503|high demand|overloaded|deadline|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    message,
  );
}

/**
 * Pide la extracción probando el modelo principal y, si está saturado, el de
 * respaldo. Cada uno con un reintento y espera creciente: los 503 de la capa
 * gratuita suelen durar segundos.
 */
async function generate(images: ReceiptImage[]) {
  const ai = getClient();
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = [...new Set([primary, FALLBACK_MODEL])];

  const parts = [
    { text: EXTRACTION_PROMPT },
    ...images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];

  let lastOverloadMessage = "";

  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            // Temperatura 0: leer un ticket no es una tarea creativa.
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RECEIPT_SCHEMA,
          },
        });
        return response.text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (/quota|rate limit|RESOURCE_EXHAUSTED|429/i.test(message)) {
          throw new ReceiptExtractionError(
            "Se agotó la cuota gratuita de Gemini por ahora. Probá de nuevo en un rato o cargá el ticket a mano.",
            error,
          );
        }
        if (/API.?key|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(message)) {
          throw new ReceiptExtractionError(
            "La clave de Gemini fue rechazada. Revisá GEMINI_API_KEY en el .env.",
            error,
          );
        }
        if (isOverloaded(message)) {
          lastOverloadMessage = message;
          console.warn(`[leer-ticket] ${model} saturado (intento ${attempt})`);
          if (attempt < ATTEMPTS_PER_MODEL) await sleep(1200 * attempt);
          continue;
        }

        throw new ReceiptExtractionError(`No se pudo consultar el modelo: ${message}`, error);
      }
    }
  }

  throw new ReceiptExtractionError(
    "Los modelos de Gemini están saturados en este momento. Probá de nuevo en unos minutos, o cargá el ticket a mano.",
    lastOverloadMessage,
  );
}

export async function extractReceipts(images: ReceiptImage[]): Promise<VerifiedReceipt[]> {
  if (!images.length) return [];

  const text = await generate(images);

  if (!text) {
    throw new ReceiptExtractionError(
      "El modelo no devolvió datos. Puede ser que las fotos estén muy oscuras o borrosas.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ReceiptExtractionError("El modelo devolvió una respuesta que no se pudo leer.", error);
  }

  const list = (parsed as { comprobantes?: unknown }).comprobantes;
  if (!Array.isArray(list)) return [];

  const receipts = list
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map(sanitize)
    // Sin total ni litros no hay nada aprovechable.
    .filter((receipt) => receipt.totalAmount !== null || receipt.liters !== null);

  return dedupeReceipts(receipts).map(verifyReceipt);
}
