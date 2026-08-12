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
import { invalidateExpenseData } from "@/components/ExpenseFormDialog";
import { invalidateMaintenanceData } from "@/components/MaintenanceScheduleFormDialog";
import { todayISO } from "@/lib/format";
import type {
  ExpenseCategory,
  MaintenanceSchedule,
  ServiceRecord,
} from "@shared/schema";

const ONE_OFF = "__one_off__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  record?: ServiceRecord | null;
  defaultScheduleId?: string;
}

export function ServiceRecordFormDialog({
  open,
  onOpenChange,
  vehicleId,
  record,
  defaultScheduleId,
}: Props) {
  const { data: schedules = [] } = useQuery<MaintenanceSchedule[]>({
    queryKey: [`/api/vehicles/${vehicleId}/schedules`],
    enabled: open,
  });
  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
    enabled: open,
  });

  const [scheduleId, setScheduleId] = useState(ONE_OFF);
  const [serviceDate, setServiceDate] = useState(todayISO());
  const [odometer, setOdometer] = useState("");
  const [shop, setShop] = useState("");
  const [notes, setNotes] = useState("");
  const [hasCost, setHasCost] = useState(false);
  const [cost, setCost] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (!open) return;
    setScheduleId(record?.scheduleId ?? defaultScheduleId ?? ONE_OFF);
    setServiceDate(record?.serviceDate ?? todayISO());
    setOdometer(record?.odometer != null ? String(record.odometer) : "");
    setShop(record?.shop ?? "");
    setNotes(record?.notes ?? "");
    setHasCost(false);
    setCost("");
    setCategoryId("");
  }, [open, record, defaultScheduleId]);

  const activeSchedules = schedules.filter(
    (s) => !s.isArchived || s.id === scheduleId,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        scheduleId: scheduleId === ONE_OFF ? null : scheduleId,
        serviceDate,
        odometer: odometer ? parseInt(odometer, 10) : null,
        shop: shop || null,
        notes: notes || null,
      };
      if (record) {
        await apiRequest("PATCH", `/api/services/${record.id}`, payload);
      } else {
        if (hasCost) {
          payload.cost = cost;
          payload.categoryId = categoryId;
        }
        await apiRequest("POST", `/api/vehicles/${vehicleId}/services`, payload);
      }
    },
    onSuccess: () => {
      invalidateMaintenanceData(vehicleId);
      if (hasCost) invalidateExpenseData();
      toast.success(record ? "Service updated" : "Service logged");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceDate) return toast.error("Enter a date");
    if (hasCost && (!cost || Number.isNaN(parseFloat(cost))))
      return toast.error("Enter a valid cost");
    if (hasCost && !categoryId) return toast.error("Select a category");
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Edit Service" : "Log Service"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={scheduleId} onValueChange={setScheduleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ONE_OFF}>One-off / Other</SelectItem>
                {activeSchedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="serviceDate">Date</Label>
              <Input
                id="serviceDate"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
              />
            </div>
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shop">Shop / DIY</Label>
            <Input
              id="shop"
              placeholder="Optional"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
            />
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

          {!record && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasCost}
                  onChange={(e) => setHasCost(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Log a cost for this service
              </label>
              {hasCost && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cost">Amount ($)</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((c) => !c.isArchived)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
          {record && (
            <p className="text-xs text-muted-foreground">
              To change the linked cost, edit the expense directly from the
              Expenses page.
            </p>
          )}

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
                : record
                  ? "Save Changes"
                  : "Log Service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
