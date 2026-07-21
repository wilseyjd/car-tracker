import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  jsonb,
  index,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage for connect-pg-simple
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vehicles
export const vehicles = pgTable("vehicles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .references(() => users.id)
    .notNull(),
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  trim: text("trim"),
  nickname: text("nickname"),
  vin: varchar("vin", { length: 17 }),
  licensePlate: text("license_plate"),
  purchaseDate: date("purchase_date"),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  purchaseOdometer: integer("purchase_odometer"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Odometer readings (manual entries plus stamps from expenses/services)
export const odometerLogs = pgTable("odometer_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id")
    .references(() => vehicles.id)
    .notNull(),
  reading: integer("reading").notNull(),
  readingDate: date("reading_date").notNull(),
  source: varchar("source", { length: 20 }).default("manual").notNull(), // manual | expense | service
  sourceId: varchar("source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Expense categories (per user; system defaults seeded at registration)
export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Expenses (the ledger; recurring instances land here too in Phase 2)
export const expenses = pgTable("expenses", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id")
    .references(() => vehicles.id)
    .notNull(),
  categoryId: varchar("category_id")
    .references(() => expenseCategories.id)
    .notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: date("expense_date").notNull(),
  odometer: integer("odometer"),
  vendor: text("vendor"),
  notes: text("notes"),
  recurringCostId: varchar("recurring_cost_id"), // Phase 2 FK
  // Fuel-only fields
  gallons: numeric("gallons", { precision: 8, scale: 3 }),
  pricePerGallon: numeric("price_per_gallon", { precision: 6, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Default categories seeded for each new user
export const DEFAULT_CATEGORIES = [
  "Car Payment",
  "Insurance",
  "Fuel",
  "Maintenance",
  "Repairs",
  "Registration/Taxes/Fees",
  "Car Wash/Detailing",
  "Parking/Tolls",
  "Accessories",
  "Other",
] as const;

// Insert schemas (Zod)
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOdometerLogSchema = createInsertSchema(odometerLogs).omit({
  id: true,
  createdAt: true,
});

export const insertCategorySchema = createInsertSchema(expenseCategories).omit({
  id: true,
  userId: true,
  isSystem: true,
  createdAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateExpenseSchema = insertExpenseSchema.partial();
export const updateVehicleSchema = insertVehicleSchema.partial();
export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type OdometerLog = typeof odometerLogs.$inferSelect;
export type InsertOdometerLog = z.infer<typeof insertOdometerLogSchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

// Dashboard summary payload
export type SummaryReport = {
  totalSpend: number;
  monthlySpend: number; // trailing 12 months average (or since first expense if newer)
  monthlySpendPrior: number | null; // same average for the 12 months before that, for comparison
  costPerMile: number | null;
  currentOdometer: number | null;
  milesDriven: number | null;
  expenseCount: number;
  byCategory: { categoryId: string; name: string; total: number }[];
  byMonth: { month: string; total: number }[]; // YYYY-MM, chronological
};
