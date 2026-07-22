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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateExpenseData } from "@/components/ExpenseFormDialog";
import { todayISO } from "@/lib/format";
import type {
  ExpenseCategory,
  RecurringCadence,
  RecurringCost,
  Vehicle,
} from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurringCost?: RecurringCost | null;
  defaultVehicleId?: string;
}

const CADENCES: { value: RecurringCadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi-annual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
];

export function invalidateRecurringData() {
  queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
  invalidateExpenseData();
}

export function RecurringCostFormDialog({
  open,
  onOpenChange,
  recurringCost,
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
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<RecurringCadence>("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [hasLoan, setHasLoan] = useState(false);
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [loanOriginalAmount, setLoanOriginalAmount] = useState("");
  const [loanApr, setLoanApr] = useState("");

  useEffect(() => {
    if (!open) return;
    setVehicleId(recurringCost?.vehicleId ?? defaultVehicleId ?? "");
    setCategoryId(recurringCost?.categoryId ?? "");
    setName(recurringCost?.name ?? "");
    setAmount(recurringCost?.amount ?? "");
    setCadence((recurringCost?.cadence as RecurringCadence) ?? "monthly");
    setStartDate(recurringCost?.startDate ?? todayISO());
    setEndDate(recurringCost?.endDate ?? "");
    const loanFieldsPresent = !!(
      recurringCost?.principalAmount ||
      recurringCost?.interestAmount ||
      recurringCost?.loanOriginalAmount ||
      recurringCost?.loanApr
    );
    setHasLoan(loanFieldsPresent);
    setPrincipalAmount(recurringCost?.principalAmount ?? "");
    setInterestAmount(recurringCost?.interestAmount ?? "");
    setLoanOriginalAmount(recurringCost?.loanOriginalAmount ?? "");
    setLoanApr(recurringCost?.loanApr ?? "");
  }, [open, recurringCost, defaultVehicleId]);

  useEffect(() => {
    if (open && !vehicleId && vehicles.length === 1) {
      setVehicleId(vehicles[0].id);
    }
  }, [open, vehicleId, vehicles]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        vehicleId,
        categoryId,
        name,
        amount,
        cadence,
        startDate,
        endDate: endDate || null,
        principalAmount: hasLoan && principalAmount ? principalAmount : null,
        interestAmount: hasLoan && interestAmount ? interestAmount : null,
        loanOriginalAmount:
          hasLoan && loanOriginalAmount ? loanOriginalAmount : null,
        loanApr: hasLoan && loanApr ? loanApr : null,
      };
      if (recurringCost) {
        await apiRequest("PATCH", `/api/recurring/${recurringCost.id}`, payload);
      } else {
        await apiRequest("POST", "/api/recurring", payload);
      }
      // Materialize any elapsed instances (e.g. a past start date) right away
      // instead of waiting for the next app load.
      await apiRequest("POST", "/api/recurring/generate");
    },
    onSuccess: () => {
      invalidateRecurringData();
      toast.success(recurringCost ? "Recurring cost updated" : "Recurring cost added");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return toast.error("Select a vehicle");
    if (!categoryId) return toast.error("Select a category");
    if (!name.trim()) return toast.error("Enter a name");
    if (!amount || Number.isNaN(parseFloat(amount)))
      return toast.error("Enter a valid amount");
    if (!recurringCost && startDate < todayISO()) {
      const proceed = window.confirm(
        `This start date is in the past. Any missed ${cadence} payments from ${startDate} through today will be backfilled as expenses. Continue?`,
      );
      if (!proceed) return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {recurringCost ? "Edit Recurring Cost" : "Add Recurring Cost"}
          </DialogTitle>
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

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Car Payment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
              <Label>Cadence</Label>
              <Select
                value={cadence}
                onValueChange={(v) => setCadence(v as RecurringCadence)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((c) => !c.isArchived || c.id === categoryId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input
                id="endDate"
                type="date"
                placeholder="Optional"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasLoan}
                onChange={(e) => setHasLoan(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Track loan details (for future equity tracking)
            </label>
            {hasLoan && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="principalAmount">Principal / pmt</Label>
                  <Input
                    id="principalAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="interestAmount">Interest / pmt</Label>
                  <Input
                    id="interestAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    value={interestAmount}
                    onChange={(e) => setInterestAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loanOriginalAmount">Original loan amt</Label>
                  <Input
                    id="loanOriginalAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional"
                    value={loanOriginalAmount}
                    onChange={(e) => setLoanOriginalAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loanApr">APR (%)</Label>
                  <Input
                    id="loanApr"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="Optional"
                    value={loanApr}
                    onChange={(e) => setLoanApr(e.target.value)}
                  />
                </div>
              </div>
            )}
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
                : recurringCost
                  ? "Save Changes"
                  : "Add Recurring Cost"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
