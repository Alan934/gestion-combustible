import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Falta la variable de entorno DATABASE_URL. Copiá .env.example a .env y completala.",
  );
}

/**
 * En desarrollo Next.js recarga los módulos en cada cambio; sin este cache
 * global cada recarga abriría un pool nuevo hasta agotar las conexiones de Neon.
 */
const globalForDb = globalThis as unknown as { __fuelPool?: Pool };

const pool =
  globalForDb.__fuelPool ??
  new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__fuelPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
