/**
 * Verificación del motor de consumo.
 *
 *   npm run test:consumo
 *
 * No toca la base: arma cargas a mano y comprueba que `enrichRecords` calcule
 * lo que corresponde. Sirve como red de seguridad cada vez que se toque
 * `src/lib/metrics.ts`.
 */

import { buildInsights } from "../src/lib/insights";
import { computeVehicleStats, enrichRecords } from "../src/lib/metrics";
import type { FuelRecord, Vehicle } from "../src/lib/db/schema";

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

/** Vehículo de prueba. Por defecto una S10: gasoil y tanque de 80 L. */
function vehiculo(opciones: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    userId: "u1",
    name: "S10",
    brand: null,
    model: null,
    year: null,
    plate: null,
    fuelType: "nafta_super",
    secondaryFuelType: null,
    tankCapacity: 80,
    secondaryTankCapacity: null,
    initialOdometer: 0,
    targetConsumption: null,
    secondaryTargetConsumption: null,
    color: "#22d3ee",
    notes: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...opciones,
  };
}

/** Serie de cargas parciales regulares: `cantidad` cargas cada `paso` km. */
function parciales(cantidad: number, paso: number, litros: number, desde = 5000) {
  return Array.from({ length: cantidad }, (_, i) =>
    carga(desde + i * paso, litros, { lleno: false }),
  );
}

/** ¿Se emitió el insight con ese id? */
function tieneInsight(stats: ReturnType<typeof computeVehicleStats>, id: string) {
  return buildInsights(stats).some((i) => i.id === id);
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

console.log("\n6) Sólo cargas parciales, ventana larga: se estima con margen\n");
{
  contador = 0;
  // 12 cargas de 42,5 L cada 500 km. Los litros de la primera no cuentan:
  // 11 × 42,5 = 467,5 L sobre 5500 km = 8,5 L/100km.
  const stats = computeVehicleStats(vehiculo(), parciales(12, 500, 42.5));

  comprobar("no hay consumo real (nunca se llenó el tanque)", stats.avgConsumption, null);
  comprobar("el estimado da 8,5 L/100km", stats.estimatedConsumption, 8.5);
  comprobar("el rendimiento estimado da 11,76 km/L", stats.estimatedKmPerLiter, 11.76);
  comprobar("el margen es 42,5 L sobre 5500 km = ±0,77", stats.estimatedMargin, 0.77);
  comprobar("la ventana abarca 5500 km", stats.estimatedDistance, 5500);
  comprobar("y las 12 cargas", stats.estimatedFills, 12);
  comprobar("la ventana es larga: precisión normal", stats.estimatedLowPrecision, false);
  comprobar("y no falta nada para afinarlo", stats.estimatedKmToPrecise, null);
  comprobar("si hay número, no hay nota de por qué falta", stats.estimationNote, null);
}

console.log("\n7) Sólo cargas parciales, ventana corta: sale con precisión baja\n");
{
  contador = 0;
  // Mismo consumo real (8,5) pero sobre 1600 km: margen ±2,13, el 25% del
  // consumo. Pasa el umbral de precisión (15%) pero no el techo de lo publicable
  // (50%), así que el número sale marcado como flojo y con los km que faltan.
  const stats = computeVehicleStats(vehiculo(), parciales(5, 400, 34));

  comprobar("el estimado se publica igual", stats.estimatedConsumption, 8.5);
  comprobar("con el margen ancho adentro", stats.estimatedMargin, 2.13);
  comprobar("marcado como de precisión baja", stats.estimatedLowPrecision, true);
  comprobar("y con los km que faltan para afinarlo", stats.estimatedKmToPrecise, 1067);
  comprobar("si hay número, no hay nota de por qué falta", stats.estimationNote, null);

  contador = 0;
  // Una carga grande al principio y tres chicas: el nivel del tanque pudo
  // haberse movido 60 L en 300 km. El margen (±20) duplica al consumo (10) y el
  // rango incluiría el cero: ahí el número no dice nada y no se publica.
  const absurdo = computeVehicleStats(vehiculo(), [
    carga(5000, 60, { lleno: false }),
    carga(5100, 10, { lleno: false }),
    carga(5200, 10, { lleno: false }),
    carga(5300, 10, { lleno: false }),
  ]);

  comprobar("con el margen más ancho que el consumo no sale", absurdo.estimatedConsumption, null);
  comprobar("tampoco el margen", absurdo.estimatedMargin, null);
  comprobar("explica por qué y cuántos km faltan", absurdo.estimationNote?.includes("3.700"), true);
}

console.log("\n8) Una o dos cargas parciales: ni se intenta\n");
{
  contador = 0;
  const stats = computeVehicleStats(vehiculo(), parciales(2, 500, 42.5));

  comprobar("sin estimado", stats.estimatedConsumption, null);
  comprobar("avisa que faltan cargas", stats.estimationNote?.includes("2 cargas seguidas"), true);

  contador = 0;
  const una = computeVehicleStats(vehiculo(), parciales(1, 500, 42.5));

  comprobar(
    "con una sola carga la cuenta bien (no dice 0)",
    una.estimationNote?.includes("1 carga seguida"),
    true,
  );
}

console.log("\n9) El estimado nunca compite con una medición real\n");
{
  contador = 0;
  const stats = computeVehicleStats(vehiculo(), [
    ...parciales(12, 500, 42.5),
    carga(11000, 45), // primer tanque lleno
    carga(11500, 42), // segundo: cierra un tramo real de 500 km
  ]);

  comprobar("hay consumo real", stats.avgConsumption, 8.4);
  comprobar("y el estimado desaparece", stats.estimatedConsumption, null);
  comprobar("sin nota, porque no falta nada", stats.estimationNote, null);
}

console.log("\n10) Una carga salteada parte la ventana: se usa la corrida limpia más larga\n");
{
  contador = 0;
  const registros = [
    ...parciales(4, 500, 42.5, 1000), // corrida corta: 1500 km
    ...parciales(12, 500, 42.5, 5000).map((r, i) =>
      i === 0 ? { ...r, missedPreviousFill: true } : r,
    ),
  ];
  const stats = computeVehicleStats(vehiculo(), registros);

  comprobar("usa la corrida larga, no la suma de las dos", stats.estimatedDistance, 5500);
  comprobar("y el consumo sale limpio", stats.estimatedConsumption, 8.5);
}

console.log("\n11) Bicombustible: con cargas parciales no se estima nada\n");
{
  contador = 0;
  const registros = [
    ...parciales(12, 500, 42.5),
    carga(11000, 13, { combustible: "gnc", lleno: false }),
  ];
  const stats = computeVehicleStats(vehiculo({ secondaryFuelType: "gnc" }), registros);

  comprobar("no estima el principal", stats.estimatedConsumption, null);
  comprobar(
    "porque el odómetro no reparte los kilómetros",
    stats.estimationNote?.includes("bicombustible"),
    true,
  );
}

console.log("\n12) Consumo imposiblemente bajo: se marca y se calla el de fábrica\n");
{
  contador = 0;
  // Banda del motor: 8,5 × 0,7 = 5,95 hasta 8,5 × 1,8 = 15,3.
  // 40 L en 1000 km da 4,0: no lo rinde ningún motor, faltan litros.
  const stats = computeVehicleStats(vehiculo({ targetConsumption: 8.5 }), [
    carga(5000, 50),
    carga(6000, 40),
  ]);

  comprobar("el promedio es 4,0", stats.avgConsumption, 4);
  comprobar("se marca como imposible", tieneInsight(stats, "implausible-consumption"), true);
  comprobar("y no se duplica con el de fábrica", tieneInsight(stats, "vs-target"), false);
}

console.log("\n13) Consumo imposiblemente alto: mismo criterio, otra causa\n");
{
  contador = 0;
  const stats = computeVehicleStats(vehiculo({ targetConsumption: 8.5 }), [
    carga(5000, 80),
    carga(5400, 70), // 17,5 L/100km, por encima del techo de 15,3
  ]);

  comprobar("el promedio es 17,5", stats.avgConsumption, 17.5);
  comprobar("se marca como imposible", tieneInsight(stats, "implausible-consumption"), true);
}

console.log("\n14) Consumo alto pero posible: informa, no alarma\n");
{
  contador = 0;
  const stats = computeVehicleStats(vehiculo({ targetConsumption: 8.5 }), [
    carga(5000, 50),
    carga(6000, 90), // 9,0: arriba de fábrica pero dentro de lo alcanzable
  ]);

  comprobar("no se marca como imposible", tieneInsight(stats, "implausible-consumption"), false);
  comprobar("sí se compara contra fábrica", tieneInsight(stats, "vs-target"), true);
}

console.log("\n15) Un tramo suelto fuera de la banda propia del vehículo\n");
{
  contador = 0;
  // Seis tramos parejos de 8,5 y uno último de 12: la MAD de los parejos es 0,
  // así que el piso de dispersión (5% de la mediana) es lo que decide.
  const registros = [
    carga(5000, 42.5),
    ...Array.from({ length: 6 }, (_, i) => carga(5500 + i * 500, 42.5)),
    carga(8500, 60), // tramo de 500 km a 12 L/100km
  ];
  const stats = computeVehicleStats(vehiculo({ targetConsumption: 8.5 }), registros);

  comprobar("el último tramo da 12", stats.lastConsumption, 12);
  comprobar("queda marcado como fuera de lo habitual", tieneInsight(stats, "outlier-leg"), true);
  comprobar("pero no como imposible: 12 entra en la banda", tieneInsight(stats, "implausible-consumption"), false);
}

console.log("\n16) Historial parejo: ninguna alarma\n");
{
  contador = 0;
  const registros = [
    carga(5000, 42.5),
    ...Array.from({ length: 6 }, (_, i) => carga(5500 + i * 500, 42.5)),
  ];
  const stats = computeVehicleStats(vehiculo({ targetConsumption: 8.5 }), registros);

  comprobar("sin tramo fuera de banda", tieneInsight(stats, "outlier-leg"), false);
  comprobar("sin consumo imposible", tieneInsight(stats, "implausible-consumption"), false);
}

console.log("\n17) Sin consumo de referencia no hay banda, y se avisa\n");
{
  contador = 0;
  const registros = [
    carga(5000, 42.5),
    ...Array.from({ length: 6 }, (_, i) => carga(5500 + i * 500, 42.5)),
  ];
  const stats = computeVehicleStats(vehiculo(), registros);

  comprobar("nunca se marca nada sin ancla", tieneInsight(stats, "implausible-consumption"), false);
  comprobar("y se pide el dato que falta", tieneInsight(stats, "missing-target"), true);
}

console.log("\n18) El margen del estimado juega a favor: la duda no dispara alarma\n");
{
  contador = 0;
  // 5,83 estimado con ±0,53 contra un piso de 5,95: el extremo superior entra,
  // así que no se alarma por un número que puede ser correcto.
  const cerca = computeVehicleStats(
    vehiculo({ targetConsumption: 8.5 }),
    parciales(12, 600, 35),
  );

  comprobar("el estimado da 5,83", cerca.estimatedConsumption, 5.83);
  comprobar("con margen ±0,53", cerca.estimatedMargin, 0.53);
  comprobar("y no se alarma", tieneInsight(cerca, "implausible-consumption"), false);

  contador = 0;
  // 3,33 ±0,30: ni el extremo más favorable llega al piso.
  const lejos = computeVehicleStats(
    vehiculo({ targetConsumption: 8.5 }),
    parciales(12, 600, 20),
  );

  comprobar("el estimado da 3,33", lejos.estimatedConsumption, 3.33);
  comprobar("y ahí sí se alarma", tieneInsight(lejos, "implausible-consumption"), true);
}

console.log(
  fallos === 0
    ? "\nTodo en orden.\n"
    : `\n${fallos} comprobación(es) fallaron.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
