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
} from "@shared/schema";

const odometerBodySchema = z.object({
  reading: z.number().int().nonnegative(),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
