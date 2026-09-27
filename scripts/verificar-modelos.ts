/**
 * Qué modelo de Gemini va a usar la app.
 *
 *   npm run test:modelos
 *
 * Pregunta el catálogo a Google con la clave del .env, muestra los modelos
 * estables que encontró y el orden en que se van a probar. Sirve para chequear
 * de antemano que la lectura de tickets sigue teniendo modelo disponible.
 */

import { GoogleGenAI } from "@google/genai";

import { resolveModels } from "../src/lib/ai/models";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Falta GEMINI_API_KEY en el .env.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const disponibles: string[] = [];
  for await (const model of await ai.models.list({ config: { queryBase: true, pageSize: 100 } })) {
    const id = (model.name ?? "").replace(/^models\//, "");
    if (id.startsWith("gemini-")) disponibles.push(id);
  }

  console.log(`Modelos gemini-* visibles con esta clave (${disponibles.length}):`);
  for (const id of disponibles.sort()) console.log(`  ${id}`);

  const candidatos = await resolveModels(ai);
  console.log("\nOrden en que la app los va a probar:");
  candidatos.forEach((id, i) => console.log(`  ${i + 1}. ${id}`));

  if (process.env.GEMINI_MODEL) {
    console.log(`\nGEMINI_MODEL fuerza "${process.env.GEMINI_MODEL}" como primera opción.`);
  }
}

void main();
