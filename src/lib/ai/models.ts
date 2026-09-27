import "server-only";

import type { GoogleGenAI } from "@google/genai";

/**
 * Elección automática del modelo de Gemini.
 *
 * Google jubila modelos cada pocos meses y, cuando eso pasa, el nombre escrito a
 * mano empieza a devolver 404 y la app se queda sin lectura de tickets. Acá se le
 * pregunta a la propia API qué modelos existen hoy y se arma una lista ordenada
 * de candidatos. Si la consulta falla quedan los alias `-latest`, y si un modelo
 * muere en pleno uso se lo marca como jubilado y se sigue con el siguiente sin
 * tocar el código.
 */

/** Cuánto vale la lista de modelos antes de volver a preguntarle a Google. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Listar modelos es accesorio: si tarda más que esto, se sigue sin la lista. */
const LIST_TIMEOUT_MS = 8_000;
/** Cuántos modelos se guardan por familia (el vigente y el anterior). */
const PER_FAMILY = 2;
/** Tope de candidatos: más que esto sería hacer esperar al usuario al pedo. */
const MAX_CANDIDATES = 4;

/**
 * Último recurso si `models.list()` no responde: los alias que Google mantiene
 * apuntando al modelo vigente de cada familia.
 */
const STATIC_CANDIDATES = ["gemini-flash-latest", "gemini-pro-latest"];

/** Prioridad por familia: flash alcanza para leer tickets y es la más barata. */
const FAMILY_RANK: Record<string, number> = { flash: 0, pro: 1, "flash-lite": 2 };

/**
 * `gemini-3.7-flash` sí, `gemini-3.7-flash-preview-11-2025` no: sólo entran los
 * nombres estables. Así quedan afuera los preview, los exp y los modelos de otra
 * cosa (embeddings, imagen, audio).
 */
const STABLE_MODEL = /^gemini-(\d+)(?:\.(\d+))?-(flash-lite|flash|pro)$/;

type DiscoveredModel = {
  id: string;
  family: number;
  major: number;
  minor: number;
};

let cache: { candidates: string[]; fetchedAt: number } | null = null;
/** Deduplica las consultas concurrentes: dos tickets a la vez piden una sola lista. */
let pending: Promise<string[]> | null = null;
/** Modelos que ya devolvieron 404 en este proceso. */
const retired = new Set<string>();
/** Último modelo que anduvo: se prueba primero para no volver a tantear. */
let working: string | null = null;

/** Marca un modelo como dado de baja y obliga a releer la lista de Google. */
export function markRetired(model: string) {
  retired.add(model);
  cache = null;
  if (working === model) working = null;
}

/** Recuerda el modelo que respondió bien para arrancar por ahí la próxima vez. */
export function rememberWorking(model: string) {
  working = model;
}

/** 404 y parientes: ese nombre de modelo ya no existe, reintentarlo no sirve. */
export function isRetiredModel(message: string) {
  return /\b404\b|NOT_FOUND|no longer available|is not found|not supported for generateContent|does not exist/i.test(
    message,
  );
}

/**
 * Cuando Google jubila un modelo suele decir en el mismo error cuál lo reemplaza
 * ("Please update your code to use models/gemini-3.8-flash"). Se le hace caso.
 */
export function suggestedModels(message: string, exclude: string) {
  const mentioned = [...message.matchAll(/models\/(gemini-[a-z0-9][a-z0-9.\-]*)/gi)].map(
    (match) => match[1],
  );
  return [...new Set(mentioned)].filter((id) => id !== exclude && !retired.has(id));
}

/**
 * Devuelve los modelos a probar, en orden: el forzado por `GEMINI_MODEL`, el que
 * anduvo la última vez, los que reporta la API y los alias de respaldo.
 */
export async function resolveModels(ai: GoogleGenAI) {
  const forced = process.env.GEMINI_MODEL?.trim();
  const discovered = await discover(ai);
  const ordered = [forced, working, ...discovered, ...STATIC_CANDIDATES].filter(
    (model): model is string => Boolean(model),
  );

  return [...new Set(ordered)].filter((model) => !retired.has(model));
}

async function discover(ai: GoogleGenAI) {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.candidates;

  pending ??= fetchCandidates(ai)
    .then((candidates) => {
      // Una lista vacía no se cachea: puede ser un filtro demasiado estricto.
      if (candidates.length) cache = { candidates, fetchedAt: Date.now() };
      return candidates;
    })
    .catch((error: unknown) => {
      console.warn("[gemini] no se pudieron listar los modelos disponibles:", error);
      return [] as string[];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

/** Pide el catálogo a Google y se queda con los modelos servibles, mejor primero. */
async function fetchCandidates(ai: GoogleGenAI) {
  const found: DiscoveredModel[] = [];

  const pager = await ai.models.list({
    config: {
      queryBase: true,
      pageSize: 100,
      abortSignal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    },
  });

  for await (const model of pager) {
    const id = (model.name ?? "").replace(/^models\//, "");
    const match = STABLE_MODEL.exec(id);
    if (!match) continue;
    // Algunos modelos sólo sirven para embeddings o para generar imágenes.
    if (model.supportedActions?.length && !model.supportedActions.includes("generateContent")) {
      continue;
    }

    found.push({
      id,
      family: FAMILY_RANK[match[3]],
      major: Number(match[1]),
      minor: Number(match[2] ?? 0),
    });
  }

  found.sort((a, b) => a.family - b.family || b.major - a.major || b.minor - a.minor);

  // Dos por familia: si mañana flash desaparece entero, todavía queda un pro.
  const perFamily = new Map<number, number>();
  const picked: string[] = [];
  for (const model of found) {
    const used = perFamily.get(model.family) ?? 0;
    if (used >= PER_FAMILY) continue;
    perFamily.set(model.family, used + 1);
    picked.push(model.id);
  }

  return picked.slice(0, MAX_CANDIDATES);
}
