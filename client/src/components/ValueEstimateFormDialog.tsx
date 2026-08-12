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
import { useEntityForm } from "@/hooks/use-entity-form";
import { todayISO } from "@/lib/format";
import { VALUE_SOURCES } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
}

interface ValueEstimateFormValues {
  estimateDate: string;
  value: string;
  source: string;
  notes: string;
}

export function invalidateValueData() {
  queryClient.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" &&
      (q.queryKey[0].includes("/values") ||
        q.queryKey[0].includes("/value-curve")),
  });
}

export function ValueEstimateFormDialog({ open, onOpenChange, vehicleId }: Props) {
  const { values, setValue, isPending, handleSubmit } =
    useEntityForm<ValueEstimateFormValues>({
      open,
      getInitialValues: () => ({
        estimateDate: todayISO(),
        value: "",
        source: "KBB",
        notes: "",
      }),
      validate: (v) => {
        if (!v.estimateDate) return "Select a date";
        if (!v.value || Number.isNaN(parseFloat(v.value)))
          return "Enter a valid value";
        return null;
      },
      submit: async (v) => {
        await apiRequest("POST", `/api/vehicles/${vehicleId}/values`, {
          estimateDate: v.estimateDate,
          value: v.value,
          source: v.source,
          notes: v.notes || null,
        });
      },
      onSuccess: () => {
        invalidateValueData();
        onOpenChange(false);
      },
      successMessage: "Value checkpoint added",
    });
  const { estimateDate, value, source, notes } = values;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Value Checkpoint</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="estimateDate">Date</Label>
              <Input
                id="estimateDate"
                type="date"
                value={estimateDate}
                onChange={(e) => setValue("estimateDate", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value">Estimated Value ($)</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue("value", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source">Source</Label>
            <Select value={source} onValueChange={(v) => setValue("source", v)}>
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALUE_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional"
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
              {isPending ? "Saving..." : "Add Checkpoint"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
