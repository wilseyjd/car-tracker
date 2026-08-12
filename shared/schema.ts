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

// Recurring cost templates (car payment, insurance, etc.) — materialize into `expenses`
export const RECURRING_CADENCES = [
  "weekly",
  "monthly",
  "quarterly",
  "semi-annual",
  "annual",
] as const;

export const recurringCosts = pgTable("recurring_costs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id")
    .references(() => vehicles.id)
    .notNull(),
  name: text("name").notNull(),
  categoryId: varchar("category_id")
    .references(() => expenseCategories.id)
    .notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  cadence: varchar("cadence", { length: 20 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isPaused: boolean("is_paused").default(false).notNull(),
  lastGeneratedDate: date("last_generated_date"), // date of the last materialized instance
  // Optional loan fields (used by Vehicle Value & Equity)
  principalAmount: numeric("principal_amount", { precision: 12, scale: 2 }),
  interestAmount: numeric("interest_amount", { precision: 12, scale: 2 }),
  loanOriginalAmount: numeric("loan_original_amount", {
    precision: 12,
    scale: 2,
  }),
  loanApr: numeric("loan_apr", { precision: 5, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Expenses (the ledger; recurring instances land here too, via recurringCostId)
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
  recurringCostId: varchar("recurring_cost_id").references(
    () => recurringCosts.id,
    { onDelete: "set null" },
  ),
  // Fuel-only fields
  gallons: numeric("gallons", { precision: 8, scale: 3 }),
  pricePerGallon: numeric("price_per_gallon", { precision: 6, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Maintenance schedule items (seeded per-vehicle with standard intervals, user-tunable)
export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id")
    .references(() => vehicles.id)
    .notNull(),
  name: text("name").notNull(),
  intervalMiles: integer("interval_miles"),
  intervalMonths: integer("interval_months"),
  notes: text("notes"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Default maintenance schedule seeded for each new vehicle
export const DEFAULT_MAINTENANCE_SCHEDULES: {
  name: string;
  intervalMiles: number | null;
  intervalMonths: number | null;
}[] = [
  { name: "Oil & filter change", intervalMiles: 5000, intervalMonths: 6 },
  { name: "Tire rotation", intervalMiles: 5000, intervalMonths: 6 },
  { name: "Engine air filter", intervalMiles: 30000, intervalMonths: 36 },
  { name: "Cabin air filter", intervalMiles: 15000, intervalMonths: 12 },
  { name: "Brake fluid", intervalMiles: null, intervalMonths: 36 },
  { name: "Coolant", intervalMiles: 60000, intervalMonths: 60 },
  { name: "Transmission service", intervalMiles: 60000, intervalMonths: null },
  { name: "Brake pads (inspect)", intervalMiles: 10000, intervalMonths: 12 },
  { name: "Battery (inspect/replace)", intervalMiles: null, intervalMonths: 48 },
  { name: "Wiper blades", intervalMiles: null, intervalMonths: 12 },
  { name: "Tires (replace)", intervalMiles: 50000, intervalMonths: null },
];

// Service records (history of maintenance/repairs performed)
export const serviceRecords = pgTable("service_records", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id")
    .references(() => vehicles.id)
    .notNull(),
  scheduleId: varchar("schedule_id").references(
    () => maintenanceSchedules.id,
    { onDelete: "set null" },
  ),
  serviceDate: date("service_date").notNull(),
  odometer: integer("odometer"),
  shop: text("shop"),
  notes: text("notes"),
  expenseId: varchar("expense_id").references(() => expenses.id, {
    onDelete: "set null",
  }),
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

// Categories treated as fixed/recurring cost of ownership (loan, insurance, government fees)
// vs. everything else, which is variable/operational spend (fuel, maintenance, repairs, etc).
// Used to split the dashboard category breakdown so a big fixed cost doesn't visually bury
// the variable trends that actually indicate vehicle health.
export const FIXED_CATEGORY_NAMES = [
  "Car Payment",
  "Insurance",
  "Registration/Taxes/Fees",
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

export const insertMaintenanceScheduleSchema = createInsertSchema(
  maintenanceSchedules,
).omit({
  id: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceRecordSchema = createInsertSchema(
  serviceRecords,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecurringCostSchema = createInsertSchema(recurringCosts, {
  cadence: z.enum(RECURRING_CADENCES),
}).omit({
  id: true,
  isPaused: true,
  lastGeneratedDate: true,
  createdAt: true,
  updatedAt: true,
});

export const updateExpenseSchema = insertExpenseSchema.partial();
export const updateVehicleSchema = insertVehicleSchema.partial();
export const updateMaintenanceScheduleSchema = insertMaintenanceScheduleSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() });
export const updateServiceRecordSchema = insertServiceRecordSchema.partial();
export const updateRecurringCostSchema = insertRecurringCostSchema
  .partial()
  .extend({ isPaused: z.boolean().optional() });
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
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type InsertMaintenanceSchedule = z.infer<
  typeof insertMaintenanceScheduleSchema
>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;

// Rule-based dashboard insight (spend spikes, expense outliers, etc.)
export type DashboardInsight = {
  id: string;
  type: "spend_spike" | "expense_outlier";
  categoryId: string;
  message: string;
};

export type RecurringCadence = (typeof RECURRING_CADENCES)[number];
export type RecurringCost = typeof recurringCosts.$inferSelect;
export type InsertRecurringCost = z.infer<typeof insertRecurringCostSchema>;

export type ReportGranularity = "week" | "month" | "year";

// Dashboard summary payload
export type SummaryReport = {
  totalSpend: number;
  monthlySpend: number; // trailing 12 months average (or since first expense if newer)
  monthlySpendPrior: number | null; // same average for the 12 months before that, for comparison
  // false when the expense history is too short (< 45 days) for monthlySpend to be a
  // meaningful average rather than just restating totalSpend under a different label.
  monthlySpendReliable: boolean;
  costPerMile: number | null;
  costPerMilePrior: number | null; // same lifetime-average-style figure computed as of the prior period, for trend
  currentOdometer: number | null;
  milesDriven: number | null;
  expenseCount: number;
  byCategory: {
    categoryId: string;
    name: string;
    total: number;
    costType: "fixed" | "variable";
  }[];
  granularity: ReportGranularity;
  // period format depends on granularity: YYYY-MM-DD (Monday of that week) for "week",
  // YYYY-MM for "month", YYYY for "year". Always chronological. Zero-filled across the full
  // default window (even periods with no spend) so the chart always shows consistent context.
  byPeriod: { period: string; total: number }[];
  insights: DashboardInsight[];
};

// Maintenance status payload (per schedule item, computed server-side)
export type MaintenanceStatusLevel = "ok" | "due_soon" | "overdue";
export type MaintenanceItemStatus = {
  schedule: MaintenanceSchedule;
  lastService: ServiceRecord | null;
  status: MaintenanceStatusLevel;
  dueByDate: string | null; // YYYY-MM-DD
  dueByOdometer: number | null;
  milesRemaining: number | null;
  daysRemaining: number | null;
};
