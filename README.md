# Gestión de Combustible

Aplicación web para llevar el control del combustible de uno o varios vehículos:
cada carga se registra en segundos y la app calcula consumo real, costo por
kilómetro, gasto mensual y la evolución del precio del litro.

Construida con **Next.js 16** (App Router, Server Actions), **PostgreSQL** en Neon
vía **Drizzle ORM**, **Tailwind CSS v4** y **Recharts**.

---

## Qué resuelve

| Necesidad | Cómo la resuelve |
| --- | --- |
| No sé cuántos litros cargué | Poné el total y el precio por litro: los litros se calculan solos. Funciona en cualquier dirección (con dos de los tres valores, el tercero aparece) |
| ¿Cuánto consume realmente? | Consumo **de tanque lleno a tanque lleno**, el único método confiable. Las cargas parciales suman litros al tramo pero no lo cierran |
| ¿Cuánto me cuesta cada kilómetro? | Costo por km y por 100 km, por vehículo y mes a mes |
| ¿En qué se me va la plata? | Gasto mensual, proyección anual, desglose por estación, combustible y medio de pago |
| ¿Cuánto aumentó el combustible? | Serie histórica del precio por litro con la variación porcentual desde la primera carga |
| ¿Dónde conviene cargar? | Precio promedio por estación y cuánto ahorrarías cargando siempre en la más barata |
| Necesito rendir el gasto | Número de factura, neto gravado, IVA 21% e impuestos internos por carga, más el crédito fiscal acumulado |
| Quiero los datos en Excel | Exportación a CSV (separador `;` y BOM, listo para Excel en español) |
| No quiero tipear el ticket | Sacale una foto y los campos se completan solos (ver *Lectura de tickets*) |

---

## Puesta en marcha

```bash
npm install
```

Copiá `.env.example` a `.env` y completá:

```env
DATABASE_URL=postgresql://usuario:password@host/basededatos?sslmode=require
SESSION_SECRET=<48 bytes aleatorios en base64url>
```

Para generar el secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Creá las tablas en la base:

```bash
npm run db:push
```

Levantá la app:

```bash
npm run dev
```

Queda en <http://localhost:3000>. Creá tu cuenta en `/registro`.

### Datos de demostración (opcional)

```bash
npm run db:seed
```

Genera el usuario `demo@combustible.app` / `combustible2026` con dos vehículos y
unos 14 meses de cargas realistas. Es idempotente: se puede correr varias veces y
sólo toca esa cuenta.

---

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run db:push` | Sincroniza el esquema con la base (desarrollo) |
| `npm run db:generate` | Genera archivos de migración SQL |
| `npm run db:migrate` | Aplica las migraciones (producción) |
| `npm run db:studio` | Drizzle Studio para inspeccionar la base |
| `npm run db:seed` | Datos de demostración |

---

## Estructura

```
src/
├─ app/
│  ├─ (auth)/            Login y registro (layout propio, sin panel lateral)
│  ├─ (app)/             Zona autenticada
│  │  ├─ panel/          Dashboard general
│  │  ├─ cargas/         Alta, edición y listado de cargas
│  │  ├─ vehiculos/      CRUD de vehículos + ficha con estadísticas
│  │  ├─ estadisticas/   Análisis profundo, tablas y récords
│  │  └─ cuenta/         Datos del usuario, contraseña, baja
│  ├─ api/exportar/      Exportación CSV
│  └─ page.tsx           Landing pública
├─ components/           UI, gráficos y formularios
├─ lib/
│  ├─ db/                Esquema Drizzle y pool de conexión
│  ├─ auth/              JWT, cookie de sesión y server actions
│  ├─ actions/           Server actions de vehículos y cargas
│  ├─ metrics.ts         Motor de cálculo (consumo, costos, series)
│  ├─ fuel-math.ts       Aritmética litros / precio / total e impuestos
│  ├─ insights.ts        Traduce las métricas a observaciones en castellano
│  └─ catalogs.ts        Combustibles, estaciones y medios de pago
└─ proxy.ts              Guarda de rutas (Next 16 reemplaza middleware.ts)
```

---

## Cómo se calcula el consumo

El único momento en que se sabe con certeza cuánto combustible hay en el tanque
es cuando está lleno. Por eso, entre dos cargas **a tanque lleno**, los litros
cargados en el medio son exactamente los litros consumidos en esos kilómetros:

```
consumo (L/100km) = litros del tramo / kilómetros del tramo × 100
```

Consecuencias prácticas:

- Una **carga parcial** no cierra el tramo: sus litros se acumulan y se cuentan
  en el próximo llenado completo.
- Si marcás **"me salteé una carga"**, ese tramo queda excluido del promedio,
  porque faltan litros que sí se consumieron.
- La **primera carga** de un vehículo no tiene consumo: es el punto de partida.

El promedio general está ponderado por distancia, no es el promedio simple de los
tramos: un tramo de 600 km pesa más que uno de 200 km, como corresponde.

### GNC y otras unidades

No todos los combustibles se miden en litros: el GNC va en **m³** y la carga
eléctrica en **kWh**. Cada vehículo lleva su unidad y toda la interfaz la respeta
—consumo en `m³/100km`, rendimiento en `km/m³`, "precio del m³"—, tanto en las
tarjetas como en los gráficos, las tablas y los textos de las observaciones.

Que el GNC se cargue mucho más seguido y mucho más barato no cambia nada
estructural: las métricas son por tramo y por mes, así que más registros sólo
significan más precisión.

Donde sí hay que tener cuidado es al **mezclar unidades**:

- Sumar litros de nafta con m³ de GNC daría un número sin sentido. Cuando la flota
  no comparte unidad, los totales de cantidad, el consumo promedio y el precio
  unitario aparecen como `—` con la aclaración de mirarlo por vehículo. El
  **gasto** y el **costo por kilómetro** siguen siendo válidos: están en pesos.
- Si un vehículo tiene cargas en unidades distintas **sin estar declarado como
  bicombustible**, la ficha muestra un aviso: ese promedio no se puede leer.

### Vehículos bicombustible (nafta + GNC)

Un vehículo puede declarar un **segundo combustible**, con su propio tanque y su
propio consumo de referencia. Al registrar cada carga se elige con cuál cargaste,
y el motor lleva **una cadena de consumo por combustible**: el tramo de GNC va de
una carga de GNC a la siguiente, sin mezclarse con las de nafta.

Eso resuelve el problema de sumar litros con m³, pero deja otro: **el odómetro no
distingue con qué combustible hiciste cada kilómetro**. Un tramo de nafta que en
el medio tuvo cargas de GNC repartiría los litros de nafta sobre kilómetros que
en realidad hiciste a gas, y daría un consumo absurdamente bajo.

La decisión de diseño es **descartar esos tramos en vez de estimarlos**. Mostrar
un número inventado con una advertencia al lado es peor que no mostrarlo: el
número se recuerda y la advertencia no. Entonces:

- El consumo de cada combustible sale **sólo de los tramos limpios** —dos cargas
  seguidas del mismo combustible, sin el otro en el medio—.
- La ficha dice cuántos tramos quedaron afuera, y si un combustible no tiene
  ninguno limpio explica exactamente qué hacer: *cargar dos veces seguidas ese
  combustible sin cargar el otro en el medio*.
- El **costo por kilómetro global** se calcula sobre los totales —pesos gastados
  sobre kilómetros recorridos—, así que es exacto sin importar cómo alternes.

Con eso la ficha responde la pregunta que de verdad importa en un dual: cuánto te
sale el kilómetro con cada combustible y cuánto ahorrás andando a gas.

---

## Lectura de tickets desde una foto

En el formulario de carga hay un panel **"Leer desde una foto del ticket"**: subís una
o varias fotos y los campos se completan solos.

Para habilitarlo, poné una clave de [Google AI Studio](https://aistudio.google.com/apikey)
en el `.env`:

```env
GEMINI_API_KEY=tu-clave
GEMINI_MODEL=gemini-3.7-flash   # opcional
```

Sin esa variable la app funciona igual, sólo que el panel no aparece.

### Por qué un modelo de visión y no OCR

Cada controlador fiscal imprime distinto. Un OCR clásico con expresiones regulares
obligaría a mantener una plantilla por bandera y se rompería con cada cambio de
formato. Un modelo multimodal lee el ticket como lo leería una persona, sin
depender de dónde está cada dato.

### Cómo se evita que invente datos

Un ticket de combustible es **aritméticamente redundante**, y eso alcanza para
verificar la lectura sin confiar en lo que el modelo diga de sí mismo:

- `litros × precio por litro = total`
- `neto gravado + IVA + impuestos internos = total`

Ambas cuentas se recalculan en el servidor ([`src/lib/ai/receipt.ts`](src/lib/ai/receipt.ts)).
Si alguna no cierra, el comprobante se muestra con una advertencia concreta en vez
de darse por bueno.

La trampa más común está contemplada en el prompt: muchos tickets traen **dos**
precios unitarios —el neto sin impuestos (`24,0160 u x 1814,8069`) y el final al
público (`24,016 L $ 2499,000`)—. El que sirve es el segundo, y la validación
aritmética detecta si el modelo agarró el otro.

### Reglas de la implementación

- **Nunca se guarda solo.** La extracción precarga el formulario y vos confirmás.
- **El odómetro siempre va a mano**: no figura en el ticket, así que el foco salta
  a ese campo al aplicar los datos.
- **Varias fotos, un comprobante.** Si subís tres fotos del mismo ticket, se
  combinan en un registro. Si son tickets distintos, se listan por separado y los
  cargás de a uno. La deduplicación va por número de comprobante.
- **Las fotos se reducen en el navegador** a 1600 px de lado mayor antes de subir:
  una foto de celular pasa de ~4 MB a ~300 KB sin perder legibilidad.
- **Reintentos y modelo de respaldo.** La capa gratuita devuelve 503 cuando el
  modelo está saturado; se reintenta con espera creciente y se cae a
  `gemini-2.5-flash` si hace falta.
- **Las imágenes no se guardan.** Se usan para extraer y se descartan.

Todo lo específico del proveedor vive en [`src/lib/ai/gemini.ts`](src/lib/ai/gemini.ts).
El resto de la app sólo conoce `extractReceipts(images) => VerifiedReceipt[]`, así
que cambiar de modelo es tocar un archivo.

> El ticket viaja a un servicio de terceros e incluye CUIT y datos del medio de
> pago. Para uso personal no suele ser un problema, pero conviene saberlo.

---

## Modelo de datos

- **users** — cuenta, con contraseña hasheada con bcrypt.
- **vehicles** — pertenecen a un usuario. Guardan combustible habitual, capacidad
  del tanque, odómetro inicial, consumo de referencia de fábrica y color para los
  gráficos.
- **fuel_records** — cada carga: fecha, odómetro, litros, precio por litro, total,
  tanque lleno, carga salteada, estación, sucursal, medio de pago, y los datos
  fiscales del ticket.

El borrado es en cascada: borrar un vehículo borra sus cargas; borrar la cuenta
borra todo.

---

## Decisiones técnicas

- **Sesión con JWT firmado (jose)** en cookie `httpOnly`, verificable desde el
  runtime Edge de `proxy.ts` sin tocar la base en cada request.
- **Métricas en memoria, no en SQL.** Un usuario particular maneja cientos de
  registros, no millones. Traer todo y agregar en TypeScript es más simple,
  más flexible y evita consultas con ventanas complicadas.
- **`numeric` con `mode: "number"`** en Drizzle: los importes se guardan con
  precisión decimal en Postgres y llegan a la app como números.
- **Horario argentino fijo (UTC-3)** al interpretar las fechas del formulario:
  Argentina no aplica horario de verano, así que la fecha que ve el usuario es
  siempre la que se guarda.
- **Coma o punto decimal** en todos los campos numéricos: es lo que la gente
  escribe de verdad.
- **Grillas con `grid-cols-1` explícito.** Sin columnas declaradas, la columna
  implícita de un grid se dimensiona a `max-content`. Como `ResponsiveContainer`
  de Recharts se fija un ancho en píxeles, ese ancho pasaba a ser el contenido
  máximo y ensanchaba la página entera en celulares. Declarar la columna
  (`grid-cols-1` = `minmax(0, 1fr)`) corta el círculo. Los gráficos, además, van
  en una capa absoluta para no aportar ancho a ningún ancestro.
