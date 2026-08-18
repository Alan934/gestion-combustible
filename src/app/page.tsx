import Link from "next/link";

const FEATURES = [
  {
    icon: "📉",
    title: "Consumo real, no el del folleto",
    text: "Calculado de tanque lleno a tanque lleno: el único método que no miente. Vas a ver tu L/100km real y cómo cambia con el tiempo.",
  },
  {
    icon: "🧮",
    title: "Cargá lo que tengas del ticket",
    text: "Si no sabés los litros, poné el total y el precio por litro: los litros salen solos. Y al revés también.",
  },
  {
    icon: "💸",
    title: "Costo por kilómetro",
    text: "La métrica que de verdad importa para comparar vehículos, decidir un viaje o cotizar un flete.",
  },
  {
    icon: "📈",
    title: "El precio del litro, mes a mes",
    text: "Con la inflación, saber cuánto aumentó tu combustible desde la primera carga cambia cómo planificás.",
  },
  {
    icon: "🚗",
    title: "Todos tus vehículos",
    text: "Auto, camioneta, moto o la flota entera. Cada uno con su historial y su color en los gráficos.",
  },
  {
    icon: "🧾",
    title: "Datos del ticket",
    text: "Estación, medio de pago, número de factura e IVA discriminado, por si necesitás rendir gastos.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <span className="inline-flex items-center gap-2.5 font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">⛽</span>
          Gestión de Combustible
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/ingresar" className="btn btn-ghost">
            Ingresar
          </Link>
          <Link href="/registro" className="btn btn-primary">
            Crear cuenta
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="py-16 text-center sm:py-24">
          <span className="chip">Control de combustible para tus vehículos</span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-ink-50 sm:text-6xl">
            Sabés cuánto gastás en nafta.
            <br />
            <span className="text-accent">¿Sabés en qué se te va?</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-300">
            Anotá cada carga en treinta segundos y obtené consumo real, costo por kilómetro, gasto
            mensual y la evolución del precio del litro. Todo en un panel.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/registro" className="btn btn-primary px-6 py-3">
              Empezar ahora
            </Link>
            <Link href="/ingresar" className="btn btn-secondary px-6 py-3">
              Ya tengo cuenta
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="card card-pad">
              <span className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-xl">
                {feature.icon}
              </span>
              <h2 className="mt-4 font-semibold text-ink-100">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{feature.text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-white/6 py-8 text-center text-xs text-ink-500">
        Gestión de Combustible · Next.js + PostgreSQL
      </footer>
    </div>
  );
}
