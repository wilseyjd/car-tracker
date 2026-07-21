import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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

  const [vehicleId, setVehicleId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [odometer, setOdometer] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [gallons, setGallons] = useState("");
  const [pricePerGallon, setPricePerGallon] = useState("");

  // Reset form whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setVehicleId(expense?.vehicleId ?? defaultVehicleId ?? "");
    setCategoryId(expense?.categoryId ?? "");
    setAmount(expense?.amount ?? "");
    setExpenseDate(expense?.expenseDate ?? todayISO());
    setOdometer(expense?.odometer != null ? String(expense.odometer) : "");
    setVendor(expense?.vendor ?? "");
    setNotes(expense?.notes ?? "");
    setGallons(expense?.gallons ?? "");
    setPricePerGallon(expense?.pricePerGallon ?? "");
  }, [open, expense, defaultVehicleId]);

  // Default the vehicle when there's only one
  useEffect(() => {
    if (open && !vehicleId && vehicles.length === 1) {
      setVehicleId(vehicles[0].id);
    }
  }, [open, vehicleId, vehicles]);

  const activeCategories = categories.filter(
    (c) => !c.isArchived || c.id === categoryId,
  );
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isFuel = selectedCategory?.name === "Fuel";

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        vehicleId,
        categoryId,
        amount,
        expenseDate,
        odometer: odometer ? parseInt(odometer, 10) : null,
        vendor: vendor || null,
        notes: notes || null,
        gallons: isFuel && gallons ? gallons : null,
        pricePerGallon: isFuel && pricePerGallon ? pricePerGallon : null,
      };
      if (expense) {
        await apiRequest("PATCH", `/api/expenses/${expense.id}`, payload);
      } else {
        await apiRequest("POST", "/api/expenses", payload);
      }
    },
    onSuccess: () => {
      invalidateExpenseData();
      toast.success(expense ? "Expense updated" : "Expense added");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return toast.error("Select a vehicle");
    if (!categoryId) return toast.error("Select a category");
    if (!amount || Number.isNaN(parseFloat(amount)))
      return toast.error("Enter a valid amount");
    mutation.mutate();
  }

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
              <Select value={vehicleId} onValueChange={setVehicleId}>
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
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expenseDate">Date</Label>
              <Input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
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
                  onChange={(e) => setGallons(e.target.value)}
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
                  onChange={(e) => setPricePerGallon(e.target.value)}
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
                onChange={(e) => setOdometer(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                placeholder="Optional"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
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
              onChange={(e) => setNotes(e.target.value)}
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving..."
                : expense
                  ? "Save Changes"
                  : "Add Expense"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
