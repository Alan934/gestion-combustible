import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { FuelTypeId, PaymentMethodId } from "../catalogs";

/* -------------------------------------------------------------------------- */
/*                                   Usuarios                                  */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

/* -------------------------------------------------------------------------- */
/*                                  Vehículos                                  */
/* -------------------------------------------------------------------------- */

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Alias corto con el que el usuario reconoce el vehículo. Ej: "Hilux blanca". */
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    year: integer("year"),
    /** Patente / dominio. */
    plate: text("plate"),

    /** Combustible principal. Cada carga puede sobreescribirlo. */
    fuelType: text("fuel_type").$type<FuelTypeId>().notNull().default("nafta_super"),
    /**
     * Segundo combustible de un vehículo bicombustible: el caso típico en
     * Argentina es nafta + GNC. Si es `null`, el vehículo usa uno solo.
     */
    secondaryFuelType: text("secondary_fuel_type").$type<FuelTypeId>(),
    /** Capacidad del tanque principal, en la unidad de su combustible. */
    tankCapacity: numeric("tank_capacity", { precision: 8, scale: 2, mode: "number" }),
    /** Capacidad del segundo tanque o tubo. */
    secondaryTankCapacity: numeric("secondary_tank_capacity", {
      precision: 8,
      scale: 2,
      mode: "number",
    }),
    /** Odómetro al momento de dar de alta el vehículo en la app. */
    initialOdometer: numeric("initial_odometer", { precision: 12, scale: 1, mode: "number" })
      .notNull()
      .default(0),
    /** Consumo declarado por el fabricante, para comparar contra el real. */
    targetConsumption: numeric("target_consumption", { precision: 6, scale: 2, mode: "number" }),
    /** Consumo de referencia del segundo combustible. */
    secondaryTargetConsumption: numeric("secondary_target_consumption", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),

    /** Color de acento usado en los gráficos. */
    color: text("color").notNull().default("#22d3ee"),
    notes: text("notes"),
    isArchived: boolean("is_archived").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("vehicles_user_idx").on(table.userId)],
);

/* -------------------------------------------------------------------------- */
/*                             Cargas de combustible                           */
/* -------------------------------------------------------------------------- */

export const fuelRecords = pgTable(
  "fuel_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    /** Desnormalizado a propósito: evita un join en cada consulta del dashboard. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Fecha y hora de la carga (la del ticket). */
    filledAt: timestamp("filled_at", { withTimezone: true }).notNull(),
    /** Kilometraje del odómetro en el momento de cargar. */
    odometer: numeric("odometer", { precision: 12, scale: 1, mode: "number" }).notNull(),

    /* --- Trío litros / precio por litro / total: siempre se guardan los tres --- */
    liters: numeric("liters", { precision: 10, scale: 3, mode: "number" }).notNull(),
    pricePerLiter: numeric("price_per_liter", { precision: 12, scale: 3, mode: "number" }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),

    fuelType: text("fuel_type").$type<FuelTypeId>().notNull(),
    /** Bandera de la estación: shell, ypf, axion, puma... */
    station: text("station"),
    /** Sucursal o dirección concreta. Ej: "Costa de Araujo - Lavalle". */
    stationBranch: text("station_branch"),
    paymentMethod: text("payment_method").$type<PaymentMethodId>(),

    /**
     * Tanque lleno. El cálculo de consumo real usa el método "lleno a lleno":
     * sólo los tramos que empiezan y terminan con tanque lleno son confiables.
     */
    isFullTank: boolean("is_full_tank").notNull().default(true),
    /**
     * El usuario reconoce haber salteado registrar alguna carga anterior:
     * rompe la cadena y ese tramo se excluye del promedio de consumo.
     */
    missedPreviousFill: boolean("missed_previous_fill").notNull().default(false),

    /* --- Datos fiscales del ticket (opcionales, útiles si descargás IVA) --- */
    invoiceNumber: text("invoice_number"),
    netAmount: numeric("net_amount", { precision: 14, scale: 2, mode: "number" }),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }),
    otherTaxes: numeric("other_taxes", { precision: 14, scale: 2, mode: "number" }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("fuel_records_vehicle_idx").on(table.vehicleId, table.odometer),
    index("fuel_records_user_date_idx").on(table.userId, table.filledAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*                                  Relaciones                                 */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  vehicles: many(vehicles),
  fuelRecords: many(fuelRecords),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  user: one(users, { fields: [vehicles.userId], references: [users.id] }),
  fuelRecords: many(fuelRecords),
}));

export const fuelRecordsRelations = relations(fuelRecords, ({ one }) => ({
  vehicle: one(vehicles, { fields: [fuelRecords.vehicleId], references: [vehicles.id] }),
  user: one(users, { fields: [fuelRecords.userId], references: [users.id] }),
}));

/* -------------------------------------------------------------------------- */
/*                                    Tipos                                    */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type FuelRecord = typeof fuelRecords.$inferSelect;
export type NewFuelRecord = typeof fuelRecords.$inferInsert;
