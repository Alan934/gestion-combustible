import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de presentación: sólo en pantallas grandes. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/6 p-12 lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(40rem 30rem at 20% 20%, rgba(34,211,238,0.16), transparent 60%), radial-gradient(36rem 28rem at 80% 80%, rgba(167,139,250,0.14), transparent 60%)",
          }}
        />
        <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">⛽</span>
          Gestión de Combustible
        </Link>

        <div className="max-w-lg">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-ink-50">
            Cada carga, convertida en información útil.
          </h2>
          <p className="mt-4 text-ink-300">
            Registrá la fecha, los kilómetros y el total de la carga. La app calcula el consumo real
            de tu vehículo, el costo por kilómetro y cómo se mueve el precio del litro mes a mes.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-ink-300">
            {[
              "Consumo real en L/100km calculado de tanque lleno a tanque lleno",
              "Costo por kilómetro y proyección del gasto mensual",
              "Evolución del precio del litro para ver el impacto de los aumentos",
              "Varios vehículos por cuenta, cada uno con su historial",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-accent">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-ink-500">Datos guardados en tu propia base PostgreSQL.</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
