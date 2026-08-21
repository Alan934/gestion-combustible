/**
 * Verificación del motor de consumo.
 *
 *   npm run test:consumo
 *
 * No toca la base: arma cargas a mano y comprueba que `enrichRecords` calcule
 * lo que corresponde. Sirve como red de seguridad cada vez que se toque
 * `src/lib/metrics.ts`.
 */

import { enrichRecords } from "../src/lib/metrics";
import type { FuelRecord } from "../src/lib/db/schema";

let contador = 0;

/** Crea una carga con lo mínimo indispensable; el resto va con valores neutros. */
function carga(
  odometer: number,
  liters: number,
  opciones: { lleno?: boolean; salteada?: boolean; combustible?: string; dia?: number } = {},
): FuelRecord {
  contador += 1;
  const precio = 1500;
  return {
    id: `r${contador}`,
    vehicleId: "v1",
    userId: "u1",
    filledAt: new Date(Date.UTC(2026, 0, opciones.dia ?? contador)),
    odometer,
    liters,
    pricePerLiter: precio,
    totalAmount: Math.round(liters * precio * 100) / 100,
    fuelType: (opciones.combustible ?? "nafta_super") as FuelRecord["fuelType"],
    station: null,
    stationBranch: null,
    paymentMethod: null,
    isFullTank: opciones.lleno ?? true,
    missedPreviousFill: opciones.salteada ?? false,
    invoiceNumber: null,
    netAmount: null,
    vatAmount: null,
    otherTaxes: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

let fallos = 0;

function comprobar(descripcion: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  console.log(`  ${ok ? "OK  " : "FALLA"}  ${descripcion}`);
  if (!ok) console.log(`        esperado ${JSON.stringify(esperado)} · obtenido ${JSON.stringify(obtenido)}`);
}

/* -------------------------------------------------------------------------- */

console.log("\n1) El caso de la duda: lleno a 5300 km y vuelvo a llenar a 5400 km");
console.log("   El combustible cargado a los 5300 todavía no se gastó.\n");
{
  contador = 0;
  const r = enrichRecords([
    carga(5300, 60), // llenada de referencia: 60 L que se van a gastar DESPUÉS
    carga(5400, 8), // para volver a llenar hicieron falta 8 L
  ]);

  comprobar("la carga de 5300 no tiene consumo (es el punto de partida)", r[0].consumption, null);
  comprobar("los 60 L de la primera carga no se cuentan en ningún tramo", r[0].legLiters, null);
  comprobar("el tramo mide 100 km", r[1].distance, 100);
  comprobar("el tramo usa los 8 L de la SEGUNDA carga, no los 60 de la primera", r[1].legLiters, 8);
  comprobar("consumo = 8 L / 100 km = 8 L/100km", r[1].consumption, 8);
  comprobar("rendimiento = 12,5 km/L", r[1].kmPerLiter, 12.5);
}

console.log("\n2) Carga parcial en el medio: los litros se acumulan hasta el próximo lleno\n");
{
  contador = 0;
  const r = enrichRecords([
    carga(5300, 60), // lleno (referencia)
    carga(5400, 20, { lleno: false }), // parcial: no cierra el tramo
    carga(5500, 25), // lleno: cierra 200 km con 20 + 25 = 45 L
  ]);

  comprobar("la carga parcial no cierra tramo", r[1].consumption, null);
  comprobar("el tramo completo abarca 200 km", r[2].odometer - r[0].odometer, 200);
  comprobar("suma los litros de la parcial y de la llenada: 45 L", r[2].legLiters, 45);
  comprobar("consumo = 45 L / 200 km = 22,5 L/100km", r[2].consumption, 22.5);
}

console.log("\n3) Nunca se llena el tanque: no se inventa ningún consumo\n");
{
  contador = 0;
  const r = enrichRecords([
    carga(5300, 20, { lleno: false }),
    carga(5400, 20, { lleno: false }),
    carga(5500, 20, { lleno: false }),
  ]);

  comprobar("ninguna carga tiene consumo", r.map((x) => x.consumption), [null, null, null]);
  comprobar("todas explican por qué", r.every((x) => Boolean(x.consumptionNote)), true);
}

console.log("\n4) Carga salteada: ese tramo se descarta\n");
{
  contador = 0;
  const r = enrichRecords([
    carga(5300, 60),
    carga(5600, 25, { salteada: true }), // hubo una carga sin registrar
    carga(5700, 8),
  ]);

  comprobar("el tramo con carga salteada no se calcula", r[1].consumption, null);
  comprobar("el tramo siguiente vuelve a ser confiable", r[2].consumption, 8);
}

console.log("\n5) Bicombustible: cada uno lleva su propia cadena\n");
{
  contador = 0;
  const r = enrichRecords([
    carga(5000, 45, { combustible: "nafta_super" }),
    carga(5120, 13, { combustible: "gnc" }),
    carga(5240, 13, { combustible: "gnc" }), // tramo limpio de GNC: 120 km
    carga(5300, 40, { combustible: "nafta_super" }), // tramo de nafta contaminado por el GNC
  ]);

  const gnc = r.filter((x) => x.fuelType === "gnc");
  const nafta = r.filter((x) => x.fuelType === "nafta_super");

  comprobar("el tramo de GNC mide 120 km y da 10,83 m³/100km", gnc[1].consumption, 10.83);
  comprobar("el tramo de GNC está limpio", gnc[1].legHasOtherFuel, false);
  comprobar("el tramo de nafta se descarta por tener GNC en el medio", nafta[1].consumption, null);
  comprobar("y queda marcado como contaminado", nafta[1].legHasOtherFuel, true);
}

console.log(
  fallos === 0
    ? "\nTodo en orden.\n"
    : `\n${fallos} comprobación(es) fallaron.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
