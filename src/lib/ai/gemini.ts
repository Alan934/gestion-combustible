import "server-only";

import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";

import { FUEL_TYPE_IDS, PAYMENT_METHOD_IDS, STATIONS } from "@/lib/catalogs";

import {
  isQuotaError,
  isRetiredModel,
  markExhausted,
  markRetired,
  quotaRetryMs,
  rememberWorking,
  resolveModels,
  suggestedModels,
} from "./models";
import { EXTRACTION_PROMPT, dedupeReceipts, verifyReceipt } from "./receipt";
import type { ExtractedReceipt, VerifiedReceipt } from "./receipt";

/**
 * Implementación de la lectura de tickets con Gemini.
 *
 * Todo lo específico del proveedor vive acá: si mañana se cambia de modelo, se
 * reemplaza este archivo y el resto de la app no se entera. El contrato es
 * `extractReceipts(images) => VerifiedReceipt[]`.
 */

/** Qué modelo usar lo decide `./models`: acá no hay ningún nombre escrito a mano. */
const ATTEMPTS_PER_MODEL = 2;
/**
 * Tope de llamadas por escaneo. En la capa gratuita el límite es por cantidad de
 * pedidos, así que insistir de más es justamente lo que deja sin cuota.
 */
const MAX_CALLS = 5;
/** Si la cuota se libera en menos que esto conviene esperar y no cambiar de modelo. */
const SHORT_WAIT_MS = 10_000;

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

/** Convierte una espera en algo que se pueda leer en pantalla. */
function describeWait(ms: number) {
  const segundos = Math.ceil(ms / 1000);
  if (segundos <= 90) return `unos ${segundos} segundos`;
  const minutos = Math.round(segundos / 60);
  if (minutos <= 90) return `unos ${minutos} minutos`;
  return `unas ${Math.round(minutos / 60)} horas`;
}

/** El modelo está momentáneamente saturado: reintentar sirve. */
function isOverloaded(message: string) {
  return /UNAVAILABLE|503|high demand|overloaded|deadline|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    message,
  );
}

/**
 * Pide la extracción recorriendo los modelos candidatos. Cada uno con un
 * reintento y espera creciente si está saturado (los 503 de la capa gratuita
 * duran segundos), y salto al siguiente si Google lo dio de baja.
 */
async function generate(images: ReceiptImage[]) {
  const ai = getClient();
  const queue = await resolveModels(ai);

  const parts = [
    { text: EXTRACTION_PROMPT },
    ...images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];

  const tried = new Set<string>();
  let calls = 0;
  let lastOverloadMessage = "";
  let lastRetiredMessage = "";
  let lastQuotaMessage = "";
  let shortestQuotaWait = Number.POSITIVE_INFINITY;

  while (queue.length && calls < MAX_CALLS) {
    const model = queue.shift()!;
    if (tried.has(model)) continue;
    tried.add(model);

    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL && calls < MAX_CALLS; attempt++) {
      try {
        calls++;
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
        rememberWorking(model);
        return response.text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (/API.?key|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(message)) {
          throw new ReceiptExtractionError(
            "La clave de Gemini fue rechazada. Revisá GEMINI_API_KEY en el .env.",
            error,
          );
        }
        if (isQuotaError(message)) {
          // Las cuotas son por modelo: el siguiente candidato suele tener la suya.
          const wait = quotaRetryMs(message);
          lastQuotaMessage = message;
          shortestQuotaWait = Math.min(shortestQuotaWait, wait);
          console.warn(`[leer-ticket] ${model} sin cuota (se libera en ~${Math.round(wait / 1000)} s)`);
          if (wait <= SHORT_WAIT_MS && attempt < ATTEMPTS_PER_MODEL && calls < MAX_CALLS) {
            await sleep(wait + 500);
            continue;
          }
          markExhausted(model, wait);
          break;
        }
        if (isRetiredModel(message)) {
          lastRetiredMessage = message;
          markRetired(model);
          console.warn(`[leer-ticket] ${model} ya no está disponible, se prueba con otro`);
          // El propio error suele nombrar al reemplazo; si no, se relee el catálogo.
          const hinted = suggestedModels(message, model).filter((id) => !tried.has(id));
          queue.unshift(...hinted);
          if (!queue.length) {
            queue.push(...(await resolveModels(ai)).filter((id) => !tried.has(id)));
          }
          break;
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

  if (shortestQuotaWait < Number.POSITIVE_INFINITY) {
    throw new ReceiptExtractionError(
      `Se agotó la cuota gratuita de Gemini en todos los modelos disponibles. Se libera en ${describeWait(shortestQuotaWait)}; mientras tanto podés cargar el ticket a mano.`,
      lastQuotaMessage,
    );
  }
  if (lastRetiredMessage) {
    throw new ReceiptExtractionError(
      "Ningún modelo de Gemini disponible aceptó la consulta. Puede que haga falta actualizar la librería @google/genai, o que GEMINI_MODEL apunte a un modelo que ya no existe.",
      lastRetiredMessage,
    );
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
