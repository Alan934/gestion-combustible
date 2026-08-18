import { getSession } from "@/lib/auth/session";
import { ReceiptExtractionError, extractReceipts } from "@/lib/ai/gemini";
import type { ReceiptImage } from "@/lib/ai/gemini";

/** El cliente redimensiona antes de subir; estos topes son la red de contención. */
const MAX_IMAGES = 6;
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("No autorizado", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("No se pudieron leer las imágenes enviadas.", 400);
  }

  const files = formData.getAll("imagenes").filter((entry): entry is File => entry instanceof File);

  if (!files.length) return fail("No mandaste ninguna imagen.", 400);
  if (files.length > MAX_IMAGES) {
    return fail(`Máximo ${MAX_IMAGES} fotos por vez.`, 400);
  }

  let totalBytes = 0;
  const images: ReceiptImage[] = [];

  for (const file of files) {
    if (!ACCEPTED.includes(file.type)) {
      return fail(`El archivo "${file.name}" no es una imagen soportada (JPG, PNG, WEBP o HEIC).`, 400);
    }
    if (file.size > MAX_BYTES_PER_IMAGE) {
      return fail(`La foto "${file.name}" pesa demasiado. Probá con una más chica.`, 400);
    }

    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) return fail("Las fotos suman demasiado peso en total.", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    images.push({ mimeType: file.type, data: buffer.toString("base64") });
  }

  try {
    const receipts = await extractReceipts(images);

    if (!receipts.length) {
      return fail(
        "No se reconoció ningún ticket de combustible en las fotos. Probá con más luz, sin sombras y con el ticket entero en cuadro.",
        422,
      );
    }

    return Response.json({ receipts });
  } catch (error) {
    if (error instanceof ReceiptExtractionError) {
      console.error("[leer-ticket]", error.message, error.cause ?? "");
      return fail(error.message, 502);
    }
    console.error("[leer-ticket] error inesperado", error);
    return fail("Hubo un problema al leer el ticket. Probá de nuevo.", 500);
  }
}
