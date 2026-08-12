import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { todayISO } from "@/lib/format";
import { useEntityForm } from "@/hooks/use-entity-form";
import type { Expense, ExpenseCategory, Vehicle } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  defaultVehicleId?: string;
}

export function invalidateExpenseData() {
  queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
  queryClient.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" &&
      (q.queryKey[0].startsWith("/api/reports/summary") ||
        q.queryKey[0].includes("/odometer")),
  });
}

interface ExpenseFormValues {
  vehicleId: string;
  categoryId: string;
  amount: string;
  expenseDate: string;
  odometer: string;
  vendor: string;
  notes: string;
  gallons: string;
  pricePerGallon: string;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  defaultVehicleId,
}: Props) {
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: open,
  });
  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
    enabled: open,
  });

  const { values, setValue, isPending, handleSubmit } =
    useEntityForm<ExpenseFormValues>({
      open,
      getInitialValues: () => ({
        vehicleId: expense?.vehicleId ?? defaultVehicleId ?? "",
        categoryId: expense?.categoryId ?? "",
        amount: expense?.amount ?? "",
        expenseDate: expense?.expenseDate ?? todayISO(),
        odometer: expense?.odometer != null ? String(expense.odometer) : "",
        vendor: expense?.vendor ?? "",
        notes: expense?.notes ?? "",
        gallons: expense?.gallons ?? "",
        pricePerGallon: expense?.pricePerGallon ?? "",
      }),
      resetDeps: [expense, defaultVehicleId],
      validate: (v) => {
        if (!v.vehicleId) return "Select a vehicle";
        if (!v.categoryId) return "Select a category";
        if (!v.amount || Number.isNaN(parseFloat(v.amount)))
          return "Enter a valid amount";
        return null;
      },
      submit: async (v) => {
        const payload: Record<string, unknown> = {
          vehicleId: v.vehicleId,
          categoryId: v.categoryId,
          amount: v.amount,
          expenseDate: v.expenseDate,
          odometer: v.odometer ? parseInt(v.odometer, 10) : null,
          vendor: v.vendor || null,
          notes: v.notes || null,
          gallons: isFuel && v.gallons ? v.gallons : null,
          pricePerGallon: isFuel && v.pricePerGallon ? v.pricePerGallon : null,
        };
        if (expense) {
          await apiRequest("PATCH", `/api/expenses/${expense.id}`, payload);
        } else {
          await apiRequest("POST", "/api/expenses", payload);
        }
      },
      onSuccess: () => {
        invalidateExpenseData();
        onOpenChange(false);
      },
      successMessage: expense ? "Expense updated" : "Expense added",
    });
  const { vehicleId, categoryId, amount, expenseDate, odometer, vendor, notes, gallons, pricePerGallon } =
    values;

  // Default the vehicle when there's only one
  useEffect(() => {
    if (open && !vehicleId && vehicles.length === 1) {
      setValue("vehicleId", vehicles[0].id);
    }
  }, [open, vehicleId, vehicles, setValue]);

  const activeCategories = categories.filter(
    (c) => !c.isArchived || c.id === categoryId,
  );
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isFuel = selectedCategory?.name === "Fuel";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {vehicles.length !== 1 && (
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select
                value={vehicleId}
                onValueChange={(v) => setValue("vehicleId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nickname || `${v.year} ${v.make} ${v.model}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setValue("amount", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expenseDate">Date</Label>
              <Input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setValue("expenseDate", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => setValue("categoryId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isFuel && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gallons">Gallons</Label>
                <Input
                  id="gallons"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="12.5"
                  value={gallons}
                  onChange={(e) => setValue("gallons", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ppg">Price / gal</Label>
                <Input
                  id="ppg"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="3.499"
                  value={pricePerGallon}
                  onChange={(e) => setValue("pricePerGallon", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="odometer">Odometer (mi)</Label>
              <Input
                id="odometer"
                type="number"
                min="0"
                placeholder="Optional"
                value={odometer}
                onChange={(e) => setValue("odometer", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                placeholder="Optional"
                value={vendor}
                onChange={(e) => setValue("vendor", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional"
              rows={2}
              value={notes}
              onChange={(e) => setValue("notes", e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : expense ? "Save Changes" : "Add Expense"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
