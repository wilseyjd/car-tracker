import type { Server } from "http";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { setupAuth, isAuthenticated, getUserId } from "./auth";
import { storage } from "./storage";
import {
  insertVehicleSchema,
  updateVehicleSchema,
  insertCategorySchema,
  updateCategorySchema,
  insertExpenseSchema,
  updateExpenseSchema,
  insertMaintenanceScheduleSchema,
  updateMaintenanceScheduleSchema,
  insertServiceRecordSchema,
  updateServiceRecordSchema,
  type InsertExpense,
  type InsertServiceRecord,
  insertRecurringCostSchema,
  updateRecurringCostSchema,
} from "@shared/schema";

const odometerBodySchema = z.object({
  reading: z.number().int().nonnegative(),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createServiceBodySchema = insertServiceRecordSchema
  .omit({ vehicleId: true, expenseId: true })
  .extend({
    cost: z.string().optional(),
    categoryId: z.string().optional(),
  })
  .refine((data) => !data.cost || !!data.categoryId, {
    message: "categoryId is required when cost is set",
    path: ["categoryId"],
  });

function zodError(res: Response, error: z.ZodError) {
  return res.status(400).json({ message: fromZodError(error).message });
}

export async function registerRoutes(_httpServer: Server, app: Express) {
  setupAuth(app);

  // Every helper below assumes isAuthenticated already ran
  async function ownedVehicle(req: Request, res: Response, vehicleId: string) {
    const vehicle = await storage.getVehicle(vehicleId);
    if (!vehicle || vehicle.userId !== getUserId(req)) {
      res.status(404).json({ message: "Vehicle not found" });
      return null;
    }
    return vehicle;
  }

  // ---- Vehicles ----
  app.get("/api/vehicles", isAuthenticated, async (req, res, next) => {
    try {
      res.json(await storage.getVehicles(getUserId(req)));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/vehicles", isAuthenticated, async (req, res, next) => {
    try {
      const parsed = insertVehicleSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const vehicle = await storage.createVehicle(getUserId(req), parsed.data);
      res.status(201).json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/vehicles/:id", isAuthenticated, async (req, res, next) => {
    try {
      const vehicle = await ownedVehicle(req, res, req.params.id);
      if (!vehicle) return;
      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/vehicles/:id", isAuthenticated, async (req, res, next) => {
    try {
      const vehicle = await ownedVehicle(req, res, req.params.id);
      if (!vehicle) return;
      const parsed = updateVehicleSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      res.json(await storage.updateVehicle(vehicle.id, parsed.data));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/vehicles/:id", isAuthenticated, async (req, res, next) => {
    try {
      const vehicle = await ownedVehicle(req, res, req.params.id);
      if (!vehicle) return;
      await storage.deleteVehicle(vehicle.id);
      res.json({ message: "Vehicle deleted" });
    } catch (e) {
      next(e);
    }
  });

  // ---- Odometer ----
  app.get(
    "/api/vehicles/:id/odometer",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        res.json(await storage.getOdometerLogs(vehicle.id));
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    "/api/vehicles/:id/odometer",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        const parsed = odometerBodySchema.safeParse(req.body);
        if (!parsed.success) return zodError(res, parsed.error);
        const log = await storage.createOdometerLog({
          vehicleId: vehicle.id,
          ...parsed.data,
        });
        res.status(201).json(log);
      } catch (e) {
        next(e);
      }
    },
  );

  app.delete("/api/odometer/:id", isAuthenticated, async (req, res, next) => {
    try {
      const log = await storage.getOdometerLog(req.params.id);
      if (!log) return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, log.vehicleId);
      if (!vehicle) return;
      await storage.deleteOdometerLog(log.id);
      res.json({ message: "Deleted" });
    } catch (e) {
      next(e);
    }
  });

  // ---- Categories ----
  app.get("/api/categories", isAuthenticated, async (req, res, next) => {
    try {
      res.json(await storage.getCategories(getUserId(req)));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/categories", isAuthenticated, async (req, res, next) => {
    try {
      const parsed = insertCategorySchema
        .pick({ name: true })
        .safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const category = await storage.createCategory(
        getUserId(req),
        parsed.data.name,
      );
      res.status(201).json(category);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/categories/:id", isAuthenticated, async (req, res, next) => {
    try {
      const category = await storage.getCategory(req.params.id);
      if (!category || category.userId !== getUserId(req)) {
        return res.status(404).json({ message: "Category not found" });
      }
      const parsed = updateCategorySchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      res.json(await storage.updateCategory(category.id, parsed.data));
    } catch (e) {
      next(e);
    }
  });

  // ---- Expenses ----
  app.get("/api/expenses", isAuthenticated, async (req, res, next) => {
    try {
      const { vehicleId, categoryId, from, to } = req.query as Record<
        string,
        string | undefined
      >;
      res.json(
        await storage.getExpenses(getUserId(req), {
          vehicleId,
          categoryId,
          from,
          to,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/expenses", isAuthenticated, async (req, res, next) => {
    try {
      const parsed = insertExpenseSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const vehicle = await ownedVehicle(req, res, parsed.data.vehicleId);
      if (!vehicle) return;
      const category = await storage.getCategory(parsed.data.categoryId);
      if (!category || category.userId !== getUserId(req)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      const expense = await storage.createExpense(parsed.data);
      res.status(201).json(expense);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/expenses/:id", isAuthenticated, async (req, res, next) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      if (!expense) return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, expense.vehicleId);
      if (!vehicle) return;
      const parsed = updateExpenseSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      if (parsed.data.categoryId) {
        const category = await storage.getCategory(parsed.data.categoryId);
        if (!category || category.userId !== getUserId(req)) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }
      if (parsed.data.vehicleId && parsed.data.vehicleId !== expense.vehicleId) {
        const target = await ownedVehicle(req, res, parsed.data.vehicleId);
        if (!target) return;
      }
      res.json(await storage.updateExpense(expense.id, parsed.data));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/expenses/:id", isAuthenticated, async (req, res, next) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      if (!expense) return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, expense.vehicleId);
      if (!vehicle) return;
      await storage.deleteExpense(expense.id);
      res.json({ message: "Deleted" });
    } catch (e) {
      next(e);
    }
  });

  // ---- Maintenance Schedules ----
  app.get(
    "/api/vehicles/:id/schedules",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        res.json(await storage.getMaintenanceSchedules(vehicle.id));
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    "/api/vehicles/:id/schedules",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        const parsed = insertMaintenanceScheduleSchema
          .omit({ vehicleId: true })
          .safeParse(req.body);
        if (!parsed.success) return zodError(res, parsed.error);
        const schedule = await storage.createMaintenanceSchedule(
          vehicle.id,
          { ...parsed.data, vehicleId: vehicle.id },
        );
        res.status(201).json(schedule);
      } catch (e) {
        next(e);
      }
    },
  );

  app.patch("/api/schedules/:id", isAuthenticated, async (req, res, next) => {
    try {
      const schedule = await storage.getMaintenanceSchedule(req.params.id);
      if (!schedule) return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, schedule.vehicleId);
      if (!vehicle) return;
      const parsed = updateMaintenanceScheduleSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      res.json(
        await storage.updateMaintenanceSchedule(schedule.id, parsed.data),
      );
    } catch (e) {
      next(e);
    }
  });

  // ---- Recurring Costs ----
  app.get("/api/recurring", isAuthenticated, async (req, res, next) => {
    try {
      res.json(await storage.getRecurringCosts(getUserId(req)));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/recurring", isAuthenticated, async (req, res, next) => {
    try {
      const parsed = insertRecurringCostSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const vehicle = await ownedVehicle(req, res, parsed.data.vehicleId);
      if (!vehicle) return;
      const category = await storage.getCategory(parsed.data.categoryId);
      if (!category || category.userId !== getUserId(req)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      const recurringCost = await storage.createRecurringCost(parsed.data);
      res.status(201).json(recurringCost);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/recurring/:id", isAuthenticated, async (req, res, next) => {
    try {
      const recurringCost = await storage.getRecurringCost(req.params.id);
      if (!recurringCost)
        return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, recurringCost.vehicleId);
      if (!vehicle) return;
      const parsed = updateRecurringCostSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      if (parsed.data.categoryId) {
        const category = await storage.getCategory(parsed.data.categoryId);
        if (!category || category.userId !== getUserId(req)) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }
      if (
        parsed.data.vehicleId &&
        parsed.data.vehicleId !== recurringCost.vehicleId
      ) {
        const target = await ownedVehicle(req, res, parsed.data.vehicleId);
        if (!target) return;
      }
      res.json(
        await storage.updateRecurringCost(recurringCost.id, parsed.data),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get(
    "/api/vehicles/:id/maintenance-status",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        res.json(await storage.getMaintenanceStatus(vehicle.id));
      } catch (e) {
        next(e);
      }
    },
  );

  // ---- Service Records ----
  app.get(
    "/api/vehicles/:id/services",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        const { scheduleId, from, to } = req.query as Record<
          string,
          string | undefined
        >;
        res.json(
          await storage.getServiceRecords(vehicle.id, { scheduleId, from, to }),
        );
      } catch (e) {
        next(e);
      }
    },
  );

  app.delete(
    "/api/recurring/:id",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const recurringCost = await storage.getRecurringCost(req.params.id);
        if (!recurringCost)
          return res.status(404).json({ message: "Not found" });
        const vehicle = await ownedVehicle(req, res, recurringCost.vehicleId);
        if (!vehicle) return;
        await storage.deleteRecurringCost(recurringCost.id);
        res.json({ message: "Deleted" });
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    "/api/vehicles/:id/services",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicle = await ownedVehicle(req, res, req.params.id);
        if (!vehicle) return;
        const parsed = createServiceBodySchema.safeParse(req.body);
        if (!parsed.success) return zodError(res, parsed.error);
        const { cost, categoryId, ...serviceData } = parsed.data;

        if (serviceData.scheduleId) {
          const schedule = await storage.getMaintenanceSchedule(
            serviceData.scheduleId,
          );
          if (!schedule || schedule.vehicleId !== vehicle.id) {
            return res.status(400).json({ message: "Invalid schedule item" });
          }
        }

        let expenseId: string | undefined;
        if (cost && categoryId) {
          const category = await storage.getCategory(categoryId);
          if (!category || category.userId !== getUserId(req)) {
            return res.status(400).json({ message: "Invalid category" });
          }
          const expense = await storage.createExpense({
            vehicleId: vehicle.id,
            categoryId,
            amount: cost,
            expenseDate: serviceData.serviceDate,
            odometer: serviceData.odometer ?? null,
            vendor: serviceData.shop ?? null,
          } as InsertExpense);
          expenseId = expense.id;
        }

        const record = await storage.createServiceRecord({
          ...serviceData,
          vehicleId: vehicle.id,
          expenseId,
        } as InsertServiceRecord);
        res.status(201).json(record);
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    "/api/recurring/generate",
    isAuthenticated,
    async (req, res, next) => {
      try {
        res.json(await storage.generateRecurringInstances(getUserId(req)));
      } catch (e) {
        next(e);
      }
    },
  );

  app.patch("/api/services/:id", isAuthenticated, async (req, res, next) => {
    try {
      const record = await storage.getServiceRecord(req.params.id);
      if (!record) return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, record.vehicleId);
      if (!vehicle) return;
      const parsed = updateServiceRecordSchema
        .omit({ vehicleId: true })
        .safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      if (parsed.data.scheduleId) {
        const schedule = await storage.getMaintenanceSchedule(
          parsed.data.scheduleId,
        );
        if (!schedule || schedule.vehicleId !== vehicle.id) {
          return res.status(400).json({ message: "Invalid schedule item" });
        }
      }
      res.json(await storage.updateServiceRecord(record.id, parsed.data));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/services/:id", isAuthenticated, async (req, res, next) => {
    try {
      const record = await storage.getServiceRecord(req.params.id);
      if (!record) return res.status(404).json({ message: "Not found" });
      const vehicle = await ownedVehicle(req, res, record.vehicleId);
      if (!vehicle) return;
      await storage.deleteServiceRecord(record.id);
      res.json({ message: "Deleted" });
    } catch (e) {
      next(e);
    }
  });

  // ---- Reports ----
  app.get(
    "/api/reports/summary",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const vehicleId = req.query.vehicleId as string | undefined;
        if (vehicleId) {
          const vehicle = await ownedVehicle(req, res, vehicleId);
          if (!vehicle) return;
        }
        res.json(await storage.getSummary(getUserId(req), vehicleId));
      } catch (e) {
        next(e);
      }
    },
  );
}
