/**
 * Helpers para leer valores numéricos de un FormData. Se acepta tanto el punto
 * como la coma decimal porque es lo que la gente escribe en un teclado argentino,
 * y se ignoran los separadores de miles.
 */

export function parseNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // "1.234,56" -> "1234.56" ; "1234,56" -> "1234.56" ; "1234.56" -> "1234.56"
  const hasComma = raw.includes(",");
  const normalized = hasComma ? raw.replace(/\./g, "").replace(",", ".") : raw;

  const parsed = Number(normalized.replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function parseBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

export function parseInteger(value: FormDataEntryValue | null): number | null {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

/**
 * Un `<input type="datetime-local">` entrega "2026-08-17T17:12" sin zona horaria.
 * Lo interpretamos como hora local de Argentina (UTC-3) para que la fecha que ve
 * el usuario coincida con la que se guarda.
 */
export function parseArgentinaDateTime(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  // UTC-3 fijo: Argentina no aplica horario de verano.
  const date = new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
  return Number.isNaN(date.getTime()) ? null : date;
}
