import { and, desc, eq, gte, inArray, lte, max } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  vehicles,
  odometerLogs,
  expenseCategories,
  expenses,
  maintenanceSchedules,
  serviceRecords,
  recurringCosts,
  DEFAULT_CATEGORIES,
  DEFAULT_MAINTENANCE_SCHEDULES,
  type User,
  type Vehicle,
  type InsertVehicle,
  type OdometerLog,
  type ExpenseCategory,
  type Expense,
  type InsertExpense,
  type MaintenanceSchedule,
  type InsertMaintenanceSchedule,
  type ServiceRecord,
  type InsertServiceRecord,
  type MaintenanceItemStatus,
  type MaintenanceStatusLevel,
  type RecurringCost,
  type InsertRecurringCost,
  type RecurringCadence,
  type SummaryReport,
  type DashboardInsight,
  type ReportGranularity,
} from "@shared/schema";

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMonthsUTC(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  // Clamp month-end overflow (e.g. Jan 31 + 1mo should land on Feb 28/29, not Mar 3)
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next;
}

function addCadence(date: Date, cadence: RecurringCadence): Date {
  switch (cadence) {
    case "weekly": {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case "monthly":
      return addMonthsUTC(date, 1);
    case "quarterly":
      return addMonthsUTC(date, 3);
    case "semi-annual":
      return addMonthsUTC(date, 6);
    case "annual":
      return addMonthsUTC(date, 12);
  }
}

export type ExpenseFilters = {
  vehicleId?: string;
  categoryId?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
};

export type ServiceRecordFilters = {
  scheduleId?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
};

const monthKey = (dateStr: string) => dateStr.slice(0, 7); // YYYY-MM

function priorMonthKeys(currentMonthKey: string, count: number): string[] {
  const [year, month] = currentMonthKey.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

const SPIKE_MIN_CURRENT_SPEND = 20; // ignore tiny categories, too noisy
const SPIKE_MIN_PRIOR_AVG = 10; // avoid divide-by-near-zero "infinite" spikes
const SPIKE_THRESHOLD = 0.3; // 30% over trailing 3-month average
const OUTLIER_MIN_CATEGORY_HISTORY = 3; // need a baseline before calling something "unusual"
const OUTLIER_RATIO = 2; // 2x the category's historical average

// Rule-based insight generation: spend spikes (this month vs trailing 3-month
// average per category) and expense outliers (a recent expense well above its
// category's historical average). Pure function so it's easy to reason about
// and doesn't require the maintenance-schedule data model (JEF-197) that isn't
// in yet — missed-service insights can layer in once that lands.
export function computeDashboardInsights(
  allExpenses: Expense[],
  categoryName: Map<string, string>,
  now: Date = new Date(),
): DashboardInsight[] {
  const insights: DashboardInsight[] = [];

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const priorKeys = priorMonthKeys(currentMonthKey, 3);

  const currentByCategory = new Map<string, number>();
  const priorByCategory = new Map<string, number>();
  for (const e of allExpenses) {
    const key = monthKey(e.expenseDate);
    const amount = parseFloat(e.amount);
    if (key === currentMonthKey) {
      currentByCategory.set(
        e.categoryId,
        (currentByCategory.get(e.categoryId) ?? 0) + amount,
      );
    } else if (priorKeys.includes(key)) {
      priorByCategory.set(
        e.categoryId,
        (priorByCategory.get(e.categoryId) ?? 0) + amount,
      );
    }
  }

  const spikes: {
    categoryId: string;
    pct: number;
    current: number;
    priorAvg: number;
  }[] = [];
  for (const [categoryId, current] of Array.from(currentByCategory)) {
    if (current < SPIKE_MIN_CURRENT_SPEND) continue;
    const priorAvg = (priorByCategory.get(categoryId) ?? 0) / priorKeys.length;
    if (priorAvg < SPIKE_MIN_PRIOR_AVG) continue;
    const pct = (current - priorAvg) / priorAvg;
    if (pct >= SPIKE_THRESHOLD) spikes.push({ categoryId, pct, current, priorAvg });
  }
  spikes.sort((a, b) => b.pct - a.pct);
  for (const s of spikes.slice(0, 3)) {
    const name = categoryName.get(s.categoryId) ?? "Unknown";
    insights.push({
      id: `spike-${s.categoryId}`,
      type: "spend_spike",
      categoryId: s.categoryId,
      message: `${name} spending is up ${Math.round(s.pct * 100)}% this month ($${s.current.toFixed(2)} vs ~$${s.priorAvg.toFixed(2)} average)`,
    });
  }

  const byCategoryHistory = new Map<string, Expense[]>();
  for (const e of allExpenses) {
    const list = byCategoryHistory.get(e.categoryId) ?? [];
    list.push(e);
    byCategoryHistory.set(e.categoryId, list);
  }

  const outliers: { expense: Expense; avg: number; ratio: number }[] = [];
  for (const history of Array.from(byCategoryHistory.values())) {
    if (history.length < OUTLIER_MIN_CATEGORY_HISTORY + 1) continue;
    const sorted = [...history].sort((a, b) =>
      a.expenseDate < b.expenseDate ? 1 : -1,
    );
    const [latest, ...rest] = sorted;
    const restAvg =
      rest.reduce((sum, e) => sum + parseFloat(e.amount), 0) / rest.length;
    if (restAvg <= 0) continue;
    const latestAmount = parseFloat(latest.amount);
    const ratio = latestAmount / restAvg;
    if (ratio >= OUTLIER_RATIO) outliers.push({ expense: latest, avg: restAvg, ratio });
  }
  outliers.sort((a, b) => b.ratio - a.ratio);
  for (const o of outliers.slice(0, 2)) {
    const name = categoryName.get(o.expense.categoryId) ?? "Unknown";
    insights.push({
      id: `outlier-${o.expense.id}`,
      type: "expense_outlier",
      categoryId: o.expense.categoryId,
      message: `${name}: $${parseFloat(o.expense.amount).toFixed(2)} on ${o.expense.expenseDate} is notably higher than your typical $${o.avg.toFixed(2)} for this category`,
    });
  }

  return insights;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: { username: string; password: string }): Promise<User>;

  // Categories
  seedDefaultCategories(userId: string): Promise<void>;
  getCategories(userId: string): Promise<ExpenseCategory[]>;
  getCategory(id: string): Promise<ExpenseCategory | undefined>;
  createCategory(userId: string, name: string): Promise<ExpenseCategory>;
  updateCategory(
    id: string,
    data: Partial<Pick<ExpenseCategory, "name" | "isArchived" | "sortOrder">>,
  ): Promise<ExpenseCategory | undefined>;

  // Vehicles
  getVehicles(userId: string): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(userId: string, data: InsertVehicle): Promise<Vehicle>;
  updateVehicle(
    id: string,
    data: Partial<InsertVehicle>,
  ): Promise<Vehicle | undefined>;
  deleteVehicle(id: string): Promise<void>;

  // Odometer
  getOdometerLogs(vehicleId: string): Promise<OdometerLog[]>;
  getOdometerLog(id: string): Promise<OdometerLog | undefined>;
  createOdometerLog(data: {
    vehicleId: string;
    reading: number;
    readingDate: string;
    source?: string;
    sourceId?: string;
  }): Promise<OdometerLog>;
  deleteOdometerLog(id: string): Promise<void>;
  getCurrentOdometer(vehicleId: string): Promise<number | null>;

  // Expenses
  getExpenses(userId: string, filters?: ExpenseFilters): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(data: InsertExpense): Promise<Expense>;
  updateExpense(
    id: string,
    data: Partial<InsertExpense>,
  ): Promise<Expense | undefined>;
  deleteExpense(id: string): Promise<void>;

  // Maintenance schedules
  seedDefaultMaintenanceSchedules(vehicleId: string): Promise<void>;
  getMaintenanceSchedules(vehicleId: string): Promise<MaintenanceSchedule[]>;
  getMaintenanceSchedule(id: string): Promise<MaintenanceSchedule | undefined>;
  createMaintenanceSchedule(
    vehicleId: string,
    data: InsertMaintenanceSchedule,
  ): Promise<MaintenanceSchedule>;
  updateMaintenanceSchedule(
    id: string,
    data: Partial<InsertMaintenanceSchedule> & { isArchived?: boolean },
  ): Promise<MaintenanceSchedule | undefined>;
  getMaintenanceStatus(vehicleId: string): Promise<MaintenanceItemStatus[]>;

  // Service records
  getServiceRecords(
    vehicleId: string,
    filters?: ServiceRecordFilters,
  ): Promise<ServiceRecord[]>;
  getServiceRecord(id: string): Promise<ServiceRecord | undefined>;
  createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord>;
  updateServiceRecord(
    id: string,
    data: Partial<InsertServiceRecord>,
  ): Promise<ServiceRecord | undefined>;
  deleteServiceRecord(id: string): Promise<void>;

  // Recurring costs
  getRecurringCosts(userId: string): Promise<RecurringCost[]>;
  getRecurringCost(id: string): Promise<RecurringCost | undefined>;
  createRecurringCost(data: InsertRecurringCost): Promise<RecurringCost>;
  updateRecurringCost(
    id: string,
    data: Partial<InsertRecurringCost> & { isPaused?: boolean },
  ): Promise<RecurringCost | undefined>;
  deleteRecurringCost(id: string): Promise<void>;
  generateRecurringInstances(userId: string): Promise<{ generated: number }>;

  // Reports
  getSummary(
    userId: string,
    vehicleId?: string,
    from?: string,
    to?: string,
    granularity?: ReportGranularity,
  ): Promise<SummaryReport>;
}

class DatabaseStorage implements IStorage {
  // ---- Users ----
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async createUser(data: { username: string; password: string }) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  // ---- Categories ----
  async seedDefaultCategories(userId: string) {
    await db.insert(expenseCategories).values(
      DEFAULT_CATEGORIES.map((name, i) => ({
        userId,
        name,
        isSystem: true,
        sortOrder: i,
      })),
    );
  }

  async getCategories(userId: string) {
    return db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.userId, userId))
      .orderBy(expenseCategories.sortOrder, expenseCategories.name);
  }

  async getCategory(id: string) {
    const [category] = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, id));
    return category;
  }

  async createCategory(userId: string, name: string) {
    const existing = await this.getCategories(userId);
    const [category] = await db
      .insert(expenseCategories)
      .values({ userId, name, sortOrder: existing.length })
      .returning();
    return category;
  }

  async updateCategory(
    id: string,
    data: Partial<Pick<ExpenseCategory, "name" | "isArchived" | "sortOrder">>,
  ) {
    const [category] = await db
      .update(expenseCategories)
      .set(data)
      .where(eq(expenseCategories.id, id))
      .returning();
    return category;
  }

  // ---- Vehicles ----
  async getVehicles(userId: string) {
    return db
      .select()
      .from(vehicles)
      .where(eq(vehicles.userId, userId))
      .orderBy(vehicles.createdAt);
  }

  async getVehicle(id: string) {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, id));
    return vehicle;
  }

  async createVehicle(userId: string, data: InsertVehicle) {
    const [vehicle] = await db
      .insert(vehicles)
      .values({ ...data, userId })
      .returning();

    // Seed the odometer log with the purchase reading
    if (vehicle.purchaseOdometer != null) {
      await this.createOdometerLog({
        vehicleId: vehicle.id,
        reading: vehicle.purchaseOdometer,
        readingDate:
          vehicle.purchaseDate ?? new Date().toISOString().slice(0, 10),
        source: "manual",
      });
    }
    await this.seedDefaultMaintenanceSchedules(vehicle.id);
    return vehicle;
  }

  async updateVehicle(id: string, data: Partial<InsertVehicle>) {
    const [vehicle] = await db
      .update(vehicles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(vehicles.id, id))
      .returning();
    return vehicle;
  }

  async deleteVehicle(id: string) {
    await db.delete(odometerLogs).where(eq(odometerLogs.vehicleId, id));
    await db.delete(serviceRecords).where(eq(serviceRecords.vehicleId, id));
    await db
      .delete(maintenanceSchedules)
      .where(eq(maintenanceSchedules.vehicleId, id));
    await db.delete(recurringCosts).where(eq(recurringCosts.vehicleId, id));
    await db.delete(expenses).where(eq(expenses.vehicleId, id));
    await db.delete(vehicles).where(eq(vehicles.id, id));
  }

  // ---- Odometer ----
  async getOdometerLogs(vehicleId: string) {
    return db
      .select()
      .from(odometerLogs)
      .where(eq(odometerLogs.vehicleId, vehicleId))
      .orderBy(desc(odometerLogs.readingDate), desc(odometerLogs.createdAt));
  }

  async getOdometerLog(id: string) {
    const [log] = await db
      .select()
      .from(odometerLogs)
      .where(eq(odometerLogs.id, id));
    return log;
  }

  async createOdometerLog(data: {
    vehicleId: string;
    reading: number;
    readingDate: string;
    source?: string;
    sourceId?: string;
  }) {
    const [log] = await db.insert(odometerLogs).values(data).returning();
    return log;
  }

  async deleteOdometerLog(id: string) {
    await db.delete(odometerLogs).where(eq(odometerLogs.id, id));
  }

  async getCurrentOdometer(vehicleId: string) {
    const [row] = await db
      .select({ reading: max(odometerLogs.reading) })
      .from(odometerLogs)
      .where(eq(odometerLogs.vehicleId, vehicleId));
    return row?.reading ?? null;
  }

  // ---- Expenses ----
  private async userVehicleIds(userId: string) {
    const rows = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.userId, userId));
    return rows.map((r) => r.id);
  }

  async getExpenses(userId: string, filters: ExpenseFilters = {}) {
    const vehicleIds = await this.userVehicleIds(userId);
    if (vehicleIds.length === 0) return [];

    const conditions = [inArray(expenses.vehicleId, vehicleIds)];
    if (filters.vehicleId)
      conditions.push(eq(expenses.vehicleId, filters.vehicleId));
    if (filters.categoryId)
      conditions.push(eq(expenses.categoryId, filters.categoryId));
    if (filters.from) conditions.push(gte(expenses.expenseDate, filters.from));
    if (filters.to) conditions.push(lte(expenses.expenseDate, filters.to));

    return db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  }

  async getExpense(id: string) {
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));
    return expense;
  }

  async createExpense(data: InsertExpense) {
    const [expense] = await db.insert(expenses).values(data).returning();

    // Stamp the odometer log so current mileage stays fresh
    if (expense.odometer != null) {
      await this.createOdometerLog({
        vehicleId: expense.vehicleId,
        reading: expense.odometer,
        readingDate: expense.expenseDate,
        source: "expense",
        sourceId: expense.id,
      });
    }
    return expense;
  }

  async updateExpense(id: string, data: Partial<InsertExpense>) {
    const [expense] = await db
      .update(expenses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();

    if (expense && data.odometer !== undefined) {
      // Replace any odometer stamp tied to this expense
      await db
        .delete(odometerLogs)
        .where(
          and(eq(odometerLogs.source, "expense"), eq(odometerLogs.sourceId, id)),
        );
      if (expense.odometer != null) {
        await this.createOdometerLog({
          vehicleId: expense.vehicleId,
          reading: expense.odometer,
          readingDate: expense.expenseDate,
          source: "expense",
          sourceId: expense.id,
        });
      }
    }
    return expense;
  }

  async deleteExpense(id: string) {
    await db
      .delete(odometerLogs)
      .where(
        and(eq(odometerLogs.source, "expense"), eq(odometerLogs.sourceId, id)),
      );
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  // ---- Maintenance schedules ----
  async seedDefaultMaintenanceSchedules(vehicleId: string) {
    await db.insert(maintenanceSchedules).values(
      DEFAULT_MAINTENANCE_SCHEDULES.map((s) => ({
        vehicleId,
        name: s.name,
        intervalMiles: s.intervalMiles,
        intervalMonths: s.intervalMonths,
      })),
    );
  }

  async getMaintenanceSchedules(vehicleId: string) {
    return db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.vehicleId, vehicleId))
      .orderBy(maintenanceSchedules.name);
  }

  async getMaintenanceSchedule(id: string) {
    const [schedule] = await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, id));
    return schedule;
  }

  async createMaintenanceSchedule(
    vehicleId: string,
    data: InsertMaintenanceSchedule,
  ) {
    const [schedule] = await db
      .insert(maintenanceSchedules)
      .values({ ...data, vehicleId })
      .returning();
    return schedule;
  }

  async updateMaintenanceSchedule(
    id: string,
    data: Partial<InsertMaintenanceSchedule> & { isArchived?: boolean },
  ) {
    const [schedule] = await db
      .update(maintenanceSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(maintenanceSchedules.id, id))
      .returning();
    return schedule;
  }

  async getMaintenanceStatus(
    vehicleId: string,
  ): Promise<MaintenanceItemStatus[]> {
    const vehicle = await this.getVehicle(vehicleId);
    const schedules = (await this.getMaintenanceSchedules(vehicleId)).filter(
      (s) => !s.isArchived,
    );
    const currentOdometer = await this.getCurrentOdometer(vehicleId);
    const todayStr = formatDateOnly(new Date());

    const results: MaintenanceItemStatus[] = [];
    for (const schedule of schedules) {
      const [lastService] = await db
        .select()
        .from(serviceRecords)
        .where(
          and(
            eq(serviceRecords.vehicleId, vehicleId),
            eq(serviceRecords.scheduleId, schedule.id),
          ),
        )
        .orderBy(desc(serviceRecords.serviceDate), desc(serviceRecords.createdAt))
        .limit(1);

      const baselineDate =
        lastService?.serviceDate ??
        vehicle?.purchaseDate ??
        formatDateOnly(schedule.createdAt);
      const baselineOdometer =
        lastService?.odometer ?? vehicle?.purchaseOdometer ?? 0;

      const dueByDate =
        schedule.intervalMonths != null
          ? formatDateOnly(
              addMonthsUTC(parseDateOnly(baselineDate), schedule.intervalMonths),
            )
          : null;
      const dueByOdometer =
        schedule.intervalMiles != null
          ? baselineOdometer + schedule.intervalMiles
          : null;

      const daysRemaining =
        dueByDate != null
          ? Math.round(
              (parseDateOnly(dueByDate).getTime() -
                parseDateOnly(todayStr).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;
      const milesRemaining =
        dueByOdometer != null && currentOdometer != null
          ? dueByOdometer - currentOdometer
          : null;

      let status: MaintenanceStatusLevel = "ok";
      if (
        (daysRemaining != null && daysRemaining < 0) ||
        (milesRemaining != null && milesRemaining < 0)
      ) {
        status = "overdue";
      } else if (
        (daysRemaining != null && daysRemaining <= 30) ||
        (milesRemaining != null && milesRemaining <= 500)
      ) {
        status = "due_soon";
      }

      results.push({
        schedule,
        lastService: lastService ?? null,
        status,
        dueByDate,
        dueByOdometer,
        milesRemaining,
        daysRemaining,
      });
    }

    return results;
  }

  // ---- Service records ----
  async getServiceRecords(
    vehicleId: string,
    filters: ServiceRecordFilters = {},
  ) {
    const conditions = [eq(serviceRecords.vehicleId, vehicleId)];
    if (filters.scheduleId)
      conditions.push(eq(serviceRecords.scheduleId, filters.scheduleId));
    if (filters.from)
      conditions.push(gte(serviceRecords.serviceDate, filters.from));
    if (filters.to)
      conditions.push(lte(serviceRecords.serviceDate, filters.to));

    return db
      .select()
      .from(serviceRecords)
      .where(and(...conditions))
      .orderBy(desc(serviceRecords.serviceDate), desc(serviceRecords.createdAt));
  }

  async getServiceRecord(id: string) {
    const [record] = await db
      .select()
      .from(serviceRecords)
      .where(eq(serviceRecords.id, id));
    return record;
  }

  async createServiceRecord(data: InsertServiceRecord) {
    const [record] = await db
      .insert(serviceRecords)
      .values(data)
      .returning();

    if (record.odometer != null) {
      await this.createOdometerLog({
        vehicleId: record.vehicleId,
        reading: record.odometer,
        readingDate: record.serviceDate,
        source: "service",
        sourceId: record.id,
      });
    }
    return record;
  }

  async updateServiceRecord(id: string, data: Partial<InsertServiceRecord>) {
    const [record] = await db
      .update(serviceRecords)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(serviceRecords.id, id))
      .returning();

    if (record && data.odometer !== undefined) {
      await db
        .delete(odometerLogs)
        .where(
          and(eq(odometerLogs.source, "service"), eq(odometerLogs.sourceId, id)),
        );
      if (record.odometer != null) {
        await this.createOdometerLog({
          vehicleId: record.vehicleId,
          reading: record.odometer,
          readingDate: record.serviceDate,
          source: "service",
          sourceId: record.id,
        });
      }
    }
    return record;
  }

  async deleteServiceRecord(id: string) {
    await db
      .delete(odometerLogs)
      .where(
        and(eq(odometerLogs.source, "service"), eq(odometerLogs.sourceId, id)),
      );
    await db.delete(serviceRecords).where(eq(serviceRecords.id, id));
  }

  // ---- Recurring costs ----
  async getRecurringCosts(userId: string) {
    const vehicleIds = await this.userVehicleIds(userId);
    if (vehicleIds.length === 0) return [];
    return db
      .select()
      .from(recurringCosts)
      .where(inArray(recurringCosts.vehicleId, vehicleIds))
      .orderBy(recurringCosts.name);
  }

  async getRecurringCost(id: string) {
    const [template] = await db
      .select()
      .from(recurringCosts)
      .where(eq(recurringCosts.id, id));
    return template;
  }

  async createRecurringCost(data: InsertRecurringCost) {
    const [template] = await db
      .insert(recurringCosts)
      .values(data)
      .returning();
    return template;
  }

  async updateRecurringCost(
    id: string,
    data: Partial<InsertRecurringCost> & { isPaused?: boolean },
  ) {
    const [template] = await db
      .update(recurringCosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(recurringCosts.id, id))
      .returning();
    return template;
  }

  async deleteRecurringCost(id: string) {
    await db.delete(recurringCosts).where(eq(recurringCosts.id, id));
  }

  async generateRecurringInstances(userId: string) {
    const vehicleIds = await this.userVehicleIds(userId);
    if (vehicleIds.length === 0) return { generated: 0 };

    const templates = await db
      .select()
      .from(recurringCosts)
      .where(inArray(recurringCosts.vehicleId, vehicleIds));

    const todayStr = formatDateOnly(new Date());
    let generated = 0;

    for (const template of templates) {
      if (template.isPaused) continue;

      const cadence = template.cadence as RecurringCadence;
      let cursor = template.lastGeneratedDate
        ? addCadence(parseDateOnly(template.lastGeneratedDate), cadence)
        : parseDateOnly(template.startDate);
      let lastGenerated = template.lastGeneratedDate;

      while (true) {
        const cursorStr = formatDateOnly(cursor);
        if (cursorStr > todayStr) break;
        if (template.endDate && cursorStr > template.endDate) break;

        await this.createExpense({
          vehicleId: template.vehicleId,
          categoryId: template.categoryId,
          amount: template.amount,
          expenseDate: cursorStr,
          vendor: template.name,
          recurringCostId: template.id,
        } as InsertExpense);

        generated++;
        lastGenerated = cursorStr;
        cursor = addCadence(cursor, cadence);
      }

      if (lastGenerated !== template.lastGeneratedDate) {
        await db
          .update(recurringCosts)
          .set({ lastGeneratedDate: lastGenerated, updatedAt: new Date() })
          .where(eq(recurringCosts.id, template.id));
      }
    }

    return { generated };
  }

  // ---- Reports ----
  // Average monthly spend for expenses falling in [rangeStart, rangeEnd), anchored to the
  // earliest expense in that window rather than rangeStart itself when history is shorter
  // than the window — otherwise a young window would be diluted by months with no data.
  private monthlyAverage(
    allExpenses: Expense[],
    rangeStart: Date,
    rangeEnd: Date,
  ): number | null {
    const inRange = allExpenses.filter((e) => {
      const d = new Date(e.expenseDate);
      return d >= rangeStart && d < rangeEnd;
    });
    if (inRange.length === 0) return null;
    const firstDate = inRange.reduce(
      (min, e) => (e.expenseDate < min ? e.expenseDate : min),
      inRange[0].expenseDate,
    );
    const effectiveStart = new Date(
      Math.max(new Date(firstDate).getTime(), rangeStart.getTime()),
    );
    const months = Math.max(
      1,
      (rangeEnd.getTime() - effectiveStart.getTime()) /
        (1000 * 60 * 60 * 24 * 30.44),
    );
    const total = inRange.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    return total / months;
  }

  // Buckets an expense date into its trend-chart period. Week buckets are keyed by the
  // Monday of that week (as YYYY-MM-DD) rather than an ISO week number, to sidestep
  // ISO week-numbering edge cases around year boundaries.
  private periodKey(expenseDate: string, granularity: ReportGranularity): string {
    if (granularity === "year") return expenseDate.slice(0, 4);
    if (granularity === "month") return expenseDate.slice(0, 7);
    const [y, m, d] = expenseDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay(); // 0=Sun..6=Sat
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  async getSummary(
    userId: string,
    vehicleId?: string,
    from?: string,
    to?: string,
    granularity: ReportGranularity = "month",
  ): Promise<SummaryReport> {
    const userVehicles = await this.getVehicles(userId);
    const scoped = vehicleId
      ? userVehicles.filter((v) => v.id === vehicleId)
      : userVehicles;

    // Fetched once, unbounded; the optional date range is applied in-memory below so a
    // single query covers both the range-scoped totals and the trend stats that always
    // need full history, instead of hitting the database twice.
    const fullHistory = await this.getExpenses(userId, { vehicleId });
    const rangedExpenses =
      from || to
        ? fullHistory.filter(
            (e) =>
              (!from || e.expenseDate >= from) && (!to || e.expenseDate <= to),
          )
        : fullHistory;
    const categories = await this.getCategories(userId);

    const totalSpend = rangedExpenses.reduce(
      (sum, e) => sum + parseFloat(e.amount),
      0,
    );

    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const monthlySpend = this.monthlyAverage(fullHistory, yearAgo, now) ?? 0;
    const monthlySpendPrior = this.monthlyAverage(
      fullHistory,
      twoYearsAgo,
      yearAgo,
    );

    // The trend chart respects an explicit date range same as the other scoped stats.
    // With no range selected, the default window scales with granularity: a year view is
    // inherently compact (one bar per year) so it stays unbounded, a week view defaults to
    // a recent 12 weeks, and month keeps its original trailing-12-month default — otherwise
    // a user with years of history would get dozens of unbounded weekly/monthly bars.
    let chartExpenses = rangedExpenses;
    if (!from && !to) {
      if (granularity === "year") {
        chartExpenses = fullHistory;
      } else if (granularity === "week") {
        const twelveWeeksAgo = new Date(now);
        twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 7 * 12);
        chartExpenses = fullHistory.filter(
          (e) => new Date(e.expenseDate) >= twelveWeeksAgo,
        );
      } else {
        chartExpenses = fullHistory.filter(
          (e) => new Date(e.expenseDate) >= yearAgo,
        );
      }
    }

    // Cost per mile: only meaningful for a single vehicle's odometer history, and always
    // computed against lifetime spend so it doesn't shift with the date-range filter.
    let currentOdometer: number | null = null;
    let milesDriven: number | null = null;
    let costPerMile: number | null = null;
    if (scoped.length === 1) {
      const vehicle = scoped[0];
      currentOdometer = await this.getCurrentOdometer(vehicle.id);
      if (currentOdometer != null) {
        const baseline = vehicle.purchaseOdometer ?? 0;
        milesDriven = Math.max(0, currentOdometer - baseline);
        if (milesDriven > 0) {
          const lifetimeTotal = fullHistory.reduce(
            (sum, e) => sum + parseFloat(e.amount),
            0,
          );
          costPerMile = lifetimeTotal / milesDriven;
        }
      }
    }

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const byCategoryMap = new Map<string, number>();
    for (const e of rangedExpenses) {
      byCategoryMap.set(
        e.categoryId,
        (byCategoryMap.get(e.categoryId) ?? 0) + parseFloat(e.amount),
      );
    }
    const byPeriodMap = new Map<string, number>();
    for (const e of chartExpenses) {
      const key = this.periodKey(e.expenseDate, granularity);
      byPeriodMap.set(key, (byPeriodMap.get(key) ?? 0) + parseFloat(e.amount));
    }
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([categoryId, total]) => ({
        categoryId,
        name: categoryName.get(categoryId) ?? "Unknown",
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);
    const byPeriod = Array.from(byPeriodMap.entries())
      .map(([period, total]) => ({ period, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const insights = computeDashboardInsights(fullHistory, categoryName);

    return {
      totalSpend: Math.round(totalSpend * 100) / 100,
      monthlySpend: Math.round(monthlySpend * 100) / 100,
      monthlySpendPrior:
        monthlySpendPrior != null
          ? Math.round(monthlySpendPrior * 100) / 100
          : null,
      costPerMile:
        costPerMile != null ? Math.round(costPerMile * 100) / 100 : null,
      currentOdometer,
      milesDriven,
      expenseCount: rangedExpenses.length,
      byCategory,
      granularity,
      byPeriod,
      insights,
    };
  }
}

export const storage: IStorage = new DatabaseStorage();
