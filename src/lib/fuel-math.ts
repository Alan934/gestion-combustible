import { VAT_RATE } from "@/lib/catalogs";
import { round } from "@/lib/format";

/**
 * El trío litros / precio por litro / total está sobredeterminado: con dos
 * cualquiera se deduce el tercero. Este módulo centraliza esa aritmética para
 * que el formulario (cliente) y la server action calculen exactamente lo mismo.
 */

export type FuelTriple = {
  liters: number | null;
  pricePerLiter: number | null;
  totalAmount: number | null;
};

export type SolvedTriple =
  | { ok: true; liters: number; pricePerLiter: number; totalAmount: number; derived: keyof FuelTriple | null }
  | { ok: false; error: string };

/** Tolerancia al comparar los tres valores: los tickets redondean. */
const CONSISTENCY_TOLERANCE = 0.02;

export function solveTriple({ liters, pricePerLiter, totalAmount }: FuelTriple): SolvedTriple {
  const has = (value: number | null): value is number => value !== null && value > 0;
  const provided = [has(liters), has(pricePerLiter), has(totalAmount)].filter(Boolean).length;

  if (provided < 2) {
    return {
      ok: false,
      error:
        "Completá al menos dos de estos tres campos: litros, precio por litro y total. El tercero se calcula solo.",
    };
  }

  if (has(liters) && has(pricePerLiter) && has(totalAmount)) {
    const expected = liters * pricePerLiter;
    const drift = Math.abs(expected - totalAmount) / totalAmount;
    if (drift > CONSISTENCY_TOLERANCE) {
      return {
        ok: false,
        error: `Los números no cierran: ${round(liters, 3)} L × ${round(pricePerLiter, 3)} da ${round(expected, 2)}, pero el total dice ${round(totalAmount, 2)}. Revisá o borrá uno de los tres campos para recalcularlo.`,
      };
    }
    return {
      ok: true,
      liters: round(liters, 3),
      pricePerLiter: round(pricePerLiter, 3),
      totalAmount: round(totalAmount, 2),
      derived: null,
    };
  }

  if (has(liters) && has(pricePerLiter)) {
    return {
      ok: true,
      liters: round(liters, 3),
      pricePerLiter: round(pricePerLiter, 3),
      totalAmount: round(liters * pricePerLiter, 2),
      derived: "totalAmount",
    };
  }

  if (has(totalAmount) && has(pricePerLiter)) {
    return {
      ok: true,
      liters: round(totalAmount / pricePerLiter, 3),
      pricePerLiter: round(pricePerLiter, 3),
      totalAmount: round(totalAmount, 2),
      derived: "liters",
    };
  }

  // total + litros
  return {
    ok: true,
    liters: round(liters!, 3),
    pricePerLiter: round(totalAmount! / liters!, 3),
    totalAmount: round(totalAmount!, 2),
    derived: "pricePerLiter",
  };
}

/* -------------------------------------------------------------------------- */
/*                             Desglose impositivo                             */
/* -------------------------------------------------------------------------- */

/**
 * En un ticket de combustible argentino:
 *   total = neto gravado × (1 + IVA) + impuestos internos (ITC / IDC)
 *
 * Con el total y uno de los dos componentes se deducen los otros.
 */
export function solveTaxes(input: {
  totalAmount: number;
  netAmount: number | null;
  vatAmount: number | null;
  otherTaxes: number | null;
}) {
  const { totalAmount } = input;
  let { netAmount, vatAmount, otherTaxes } = input;

  if (netAmount === null && otherTaxes !== null) {
    netAmount = round((totalAmount - otherTaxes) / (1 + VAT_RATE), 2);
  }

  if (netAmount !== null && vatAmount === null) {
    vatAmount = round(netAmount * VAT_RATE, 2);
  }

  if (netAmount !== null && vatAmount !== null && otherTaxes === null) {
    otherTaxes = round(totalAmount - netAmount - vatAmount, 2);
    if (Math.abs(otherTaxes) < 0.01) otherTaxes = 0;
  }

  return {
    netAmount,
    vatAmount,
    otherTaxes: otherTaxes !== null && otherTaxes < 0 ? null : otherTaxes,
  };
}
