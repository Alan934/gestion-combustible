"use client";

import { useRef, useState } from "react";

import { Card, CardHeader } from "@/components/ui";
import type { VerifiedReceipt } from "@/lib/ai/receipt";
import { fuelUnit } from "@/lib/catalogs";
import { formatCurrency, formatNumber } from "@/lib/format";

const MAX_IMAGES = 6;
/** Lado mayor al que se reduce cada foto antes de subirla. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

type Preview = { id: string; file: File; url: string };

/**
 * Reduce la foto en el navegador antes de subirla. Una foto de celular pesa
 * 3-5 MB y a 1600 px de lado mayor el texto del ticket se sigue leyendo
 * perfecto, pero pesa ~300 KB: sube más rápido y consume menos cuota.
 */
async function shrink(file: File): Promise<File> {
  try {
    // `from-image` respeta la orientación EXIF: sin esto las fotos verticales
    // de iPhone llegan acostadas y el modelo lee mucho peor.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && file.size < 1_000_000) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // HEIC y formatos que el navegador no decodifica: se manda el original.
    return file;
  }
}

function ReceiptSummary({ receipt }: { receipt: VerifiedReceipt }) {
  const rows: [string, string][] = [];
  const unit = fuelUnit(receipt.fuelType);

  if (receipt.liters !== null) {
    rows.push(["Cantidad", `${formatNumber(receipt.liters, 3)} ${unit}`]);
  }
  if (receipt.pricePerLiter !== null) {
    rows.push([`Precio por ${unit}`, formatCurrency(receipt.pricePerLiter)]);
  }
  if (receipt.totalAmount !== null) rows.push(["Total", formatCurrency(receipt.totalAmount)]);
  if (receipt.productName) rows.push(["Producto", receipt.productName]);
  if (receipt.stationBranch) rows.push(["Sucursal", receipt.stationBranch]);
  if (receipt.invoiceNumber) rows.push(["Factura", receipt.invoiceNumber]);

  return (
    <dl className="mt-3 grid gap-1.5 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 sm:justify-start">
          <dt className="text-xs text-ink-500">{label}</dt>
          <dd className="tabular text-xs font-semibold text-ink-100 sm:ml-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReceiptScanner({ onApply }: { onApply: (receipt: VerifiedReceipt) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [receipts, setReceipts] = useState<VerifiedReceipt[] | null>(null);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPreviews([]);
    setReceipts(null);
    setUsed(new Set());
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    setReceipts(null);
    setBusy(true);

    try {
      const incoming = Array.from(fileList).slice(0, MAX_IMAGES - previews.length);
      const shrunk = await Promise.all(incoming.map(shrink));

      setPreviews((current) => [
        ...current,
        ...shrunk.map((file, index) => ({
          id: `${Date.now()}-${index}`,
          file,
          url: URL.createObjectURL(file),
        })),
      ]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removePreview(id: string) {
    setPreviews((current) => {
      const target = current.find((preview) => preview.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((preview) => preview.id !== id);
    });
    setReceipts(null);
  }

  async function scan() {
    if (!previews.length) return;

    setBusy(true);
    setError(null);
    setReceipts(null);
    setUsed(new Set());

    try {
      const body = new FormData();
      previews.forEach((preview) => body.append("imagenes", preview.file));

      const response = await fetch("/api/leer-ticket", { method: "POST", body });
      const payload = (await response.json()) as { receipts?: VerifiedReceipt[]; error?: string };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo leer el ticket.");
        return;
      }

      const found = payload.receipts ?? [];
      setReceipts(found);

      // Si hay uno solo, se aplica directo: es el caso más común.
      if (found.length === 1) {
        onApply(found[0]);
        setUsed(new Set([0]));
      }
    } catch {
      setError("No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Leer desde una foto del ticket"
        subtitle="Sacale una foto al comprobante y los datos se completan solos. Podés subir varias fotos del mismo ticket, o de tickets distintos."
        action={
          previews.length || receipts ? (
            <button type="button" onClick={reset} className="btn btn-ghost px-3 py-1.5 text-xs">
              Empezar de nuevo
            </button>
          ) : null
        }
      />

      <div className="card-pad">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={(event) => handleFiles(event.target.files)}
          className="hidden"
          id="ticket-images"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || previews.length >= MAX_IMAGES}
            className="btn btn-secondary"
          >
            📷 Elegir fotos
          </button>

          {previews.length ? (
            <button type="button" onClick={scan} disabled={busy} className="btn btn-primary">
              {busy ? "Leyendo el ticket…" : `Leer ${previews.length === 1 ? "la foto" : `las ${previews.length} fotos`}`}
            </button>
          ) : null}

          <span className="text-xs text-ink-500">
            {previews.length
              ? `${previews.length} de ${MAX_IMAGES} fotos`
              : "JPG, PNG o HEIC · hasta 6 fotos"}
          </span>
        </div>

        {previews.length ? (
          <ul className="mt-4 flex flex-wrap gap-3">
            {previews.map((preview) => (
              <li key={preview.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt="Foto del ticket"
                  className="size-24 rounded-xl border border-white/10 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePreview(preview.id)}
                  aria-label="Quitar foto"
                  className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border border-white/15 bg-ink-900 text-xs text-ink-300 hover:text-rose-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {busy ? (
          <p className="mt-4 text-xs text-ink-400">
            Leyendo… suele tardar unos segundos según el tamaño de las fotos.
          </p>
        ) : null}

        {error ? (
          <p className="alert-error mt-4" role="alert">
            {error}
          </p>
        ) : null}

        {receipts?.length ? (
          <div className="mt-5 grid gap-3">
            <p className="text-xs font-semibold tracking-wide text-ink-300 uppercase">
              {receipts.length === 1
                ? "Comprobante detectado"
                : `${receipts.length} comprobantes detectados`}
            </p>

            {receipts.map((receipt, index) => {
              const isUsed = used.has(index);
              const hasMismatch = receipt.checks.arithmetic === "mismatch";

              return (
                <article
                  key={`${receipt.invoiceNumber ?? "s-n"}-${index}`}
                  className={`rounded-2xl border px-4 py-4 ${
                    hasMismatch
                      ? "border-amber-400/30 bg-amber-400/6"
                      : "border-white/10 bg-white/4"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-ink-100">{receipt.label}</h4>
                      {receipt.checks.arithmetic === "ok" ? (
                        <p className="mt-0.5 text-xs text-emerald-300">
                          ✓ Cantidad × precio da el total: las cifras son consistentes
                        </p>
                      ) : null}
                      {receipt.checks.fiscal === "ok" ? (
                        <p className="mt-0.5 text-xs text-emerald-300">
                          ✓ Neto + IVA + tributos da el total
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onApply(receipt);
                        setUsed((current) => new Set(current).add(index));
                      }}
                      className={isUsed ? "btn btn-secondary" : "btn btn-primary"}
                    >
                      {isUsed ? "Volver a aplicar" : "Usar estos datos"}
                    </button>
                  </div>

                  <ReceiptSummary receipt={receipt} />

                  {receipt.warnings.length ? (
                    <ul className="mt-3 grid gap-1.5 border-t border-white/8 pt-3">
                      {receipt.warnings.map((warning) => (
                        <li key={warning} className="flex gap-2 text-xs leading-relaxed text-amber-200">
                          <span aria-hidden>!</span>
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}

            {receipts.length > 1 ? (
              <p className="text-xs leading-relaxed text-ink-400">
                Los comprobantes se cargan de a uno: aplicá el primero, guardá la carga y volvé para
                el siguiente. Esta lista se mantiene mientras no recargues la página.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
