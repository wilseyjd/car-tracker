import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MaintenanceSchedule } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  schedule?: MaintenanceSchedule | null;
}

export function invalidateMaintenanceData(vehicleId: string) {
  queryClient.invalidateQueries({
    queryKey: [`/api/vehicles/${vehicleId}/schedules`],
  });
  queryClient.invalidateQueries({
    queryKey: [`/api/vehicles/${vehicleId}/maintenance-status`],
  });
}

export function MaintenanceScheduleFormDialog({
  open,
  onOpenChange,
  vehicleId,
  schedule,
}: Props) {
  const [name, setName] = useState("");
  const [intervalMiles, setIntervalMiles] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(schedule?.name ?? "");
    setIntervalMiles(
      schedule?.intervalMiles != null ? String(schedule.intervalMiles) : "",
    );
    setIntervalMonths(
      schedule?.intervalMonths != null ? String(schedule.intervalMonths) : "",
    );
    setNotes(schedule?.notes ?? "");
  }, [open, schedule]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        intervalMiles: intervalMiles ? parseInt(intervalMiles, 10) : null,
        intervalMonths: intervalMonths ? parseInt(intervalMonths, 10) : null,
        notes: notes || null,
      };
      if (schedule) {
        await apiRequest("PATCH", `/api/schedules/${schedule.id}`, payload);
      } else {
        await apiRequest("POST", `/api/vehicles/${vehicleId}/schedules`, payload);
      }
    },
    onSuccess: () => {
      invalidateMaintenanceData(vehicleId);
      toast.success(schedule ? "Schedule item updated" : "Schedule item added");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter a name");
    if (!intervalMiles && !intervalMonths)
      return toast.error("Set a mileage interval, a time interval, or both");
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {schedule ? "Edit Schedule Item" : "Add Schedule Item"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Oil & filter change"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="intervalMiles">Every (miles)</Label>
              <Input
                id="intervalMiles"
                type="number"
                min="0"
                placeholder="Optional"
                value={intervalMiles}
                onChange={(e) => setIntervalMiles(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intervalMonths">Every (months)</Label>
              <Input
                id="intervalMonths"
                type="number"
                min="0"
                placeholder="Optional"
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Set either or both — due status uses whichever comes first.
          </p>

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
                : schedule
                  ? "Save Changes"
                  : "Add Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
