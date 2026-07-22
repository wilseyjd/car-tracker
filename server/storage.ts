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
  type SummaryReport,
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

  // Reports
  getSummary(userId: string, vehicleId?: string): Promise<SummaryReport>;
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

  // ---- Reports ----
  async getSummary(userId: string, vehicleId?: string): Promise<SummaryReport> {
    const userVehicles = await this.getVehicles(userId);
    const scoped = vehicleId
      ? userVehicles.filter((v) => v.id === vehicleId)
      : userVehicles;

    const allExpenses = await this.getExpenses(userId, { vehicleId });
    const categories = await this.getCategories(userId);

    const totalSpend = allExpenses.reduce(
      (sum, e) => sum + parseFloat(e.amount),
      0,
    );

    // Trailing-12-month average (or since first expense if the history is shorter)
    let monthlySpend = 0;
    if (allExpenses.length > 0) {
      const now = new Date();
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const recent = allExpenses.filter(
        (e) => new Date(e.expenseDate) >= yearAgo,
      );
      const firstDate = recent.length
        ? recent.reduce(
            (min, e) => (e.expenseDate < min ? e.expenseDate : min),
            recent[0].expenseDate,
          )
        : null;
      if (firstDate) {
        const months = Math.max(
          1,
          (now.getTime() - new Date(firstDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30.44),
        );
        const recentTotal = recent.reduce(
          (sum, e) => sum + parseFloat(e.amount),
          0,
        );
        monthlySpend = recentTotal / months;
      }
    }

    // Cost per mile: only meaningful for a single vehicle's odometer history
    let currentOdometer: number | null = null;
    let milesDriven: number | null = null;
    let costPerMile: number | null = null;
    if (scoped.length === 1) {
      const vehicle = scoped[0];
      currentOdometer = await this.getCurrentOdometer(vehicle.id);
      if (currentOdometer != null) {
        const baseline = vehicle.purchaseOdometer ?? 0;
        milesDriven = Math.max(0, currentOdometer - baseline);
        if (milesDriven > 0) costPerMile = totalSpend / milesDriven;
      }
    }

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const byCategoryMap = new Map<string, number>();
    for (const e of allExpenses) {
      byCategoryMap.set(
        e.categoryId,
        (byCategoryMap.get(e.categoryId) ?? 0) + parseFloat(e.amount),
      );
    }
    const byCategory = [...byCategoryMap.entries()]
      .map(([categoryId, total]) => ({
        categoryId,
        name: categoryName.get(categoryId) ?? "Unknown",
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      totalSpend: Math.round(totalSpend * 100) / 100,
      monthlySpend: Math.round(monthlySpend * 100) / 100,
      costPerMile:
        costPerMile != null ? Math.round(costPerMile * 100) / 100 : null,
      currentOdometer,
      milesDriven,
      expenseCount: allExpenses.length,
      byCategory,
    };
  }
}

export const storage: IStorage = new DatabaseStorage();
