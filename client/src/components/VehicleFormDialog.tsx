import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEntityForm } from "@/hooks/use-entity-form";
import type { Vehicle } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
}

interface VehicleFormValues {
  year: string;
  make: string;
  model: string;
  trim: string;
  nickname: string;
  vin: string;
  licensePlate: string;
  purchaseDate: string;
  purchasePrice: string;
  purchaseOdometer: string;
}

export function VehicleFormDialog({ open, onOpenChange, vehicle }: Props) {
  const { values, setValue, isPending, handleSubmit } =
    useEntityForm<VehicleFormValues>({
      open,
      getInitialValues: () => ({
        year: vehicle ? String(vehicle.year) : "",
        make: vehicle?.make ?? "",
        model: vehicle?.model ?? "",
        trim: vehicle?.trim ?? "",
        nickname: vehicle?.nickname ?? "",
        vin: vehicle?.vin ?? "",
        licensePlate: vehicle?.licensePlate ?? "",
        purchaseDate: vehicle?.purchaseDate ?? "",
        purchasePrice: vehicle?.purchasePrice ?? "",
        purchaseOdometer:
          vehicle?.purchaseOdometer != null
            ? String(vehicle.purchaseOdometer)
            : "",
      }),
      resetDeps: [vehicle],
      validate: (v) => {
        const y = parseInt(v.year, 10);
        if (!y || y < 1900 || y > 2100) return "Enter a valid year";
        if (!v.make.trim()) return "Make is required";
        if (!v.model.trim()) return "Model is required";
        return null;
      },
      submit: async (v) => {
        const payload: Record<string, unknown> = {
          year: parseInt(v.year, 10),
          make: v.make,
          model: v.model,
          trim: v.trim || null,
          nickname: v.nickname || null,
          vin: v.vin || null,
          licensePlate: v.licensePlate || null,
          purchaseDate: v.purchaseDate || null,
          purchasePrice: v.purchasePrice || null,
          purchaseOdometer: v.purchaseOdometer
            ? parseInt(v.purchaseOdometer, 10)
            : null,
        };
        if (vehicle) {
          await apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, payload);
        } else {
          await apiRequest("POST", "/api/vehicles", payload);
        }
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0].startsWith("/api/vehicles") ||
              q.queryKey[0].startsWith("/api/reports/summary")),
        });
        onOpenChange(false);
      },
      successMessage: vehicle ? "Vehicle updated" : "Vehicle added",
    });
  const {
    year,
    make,
    model,
    trim,
    nickname,
    vin,
    licensePlate,
    purchaseDate,
    purchasePrice,
    purchaseOdometer,
  } = values;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                placeholder="2026"
                value={year}
                onChange={(e) => setValue("year", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                placeholder="Toyota"
                value={make}
                onChange={(e) => setValue("make", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="RAV4"
                value={model}
                onChange={(e) => setValue("model", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trim">Trim</Label>
              <Input
                id="trim"
                placeholder="Optional"
                value={trim}
                onChange={(e) => setValue("trim", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              placeholder="Optional — shown around the app"
              value={nickname}
              onChange={(e) => setValue("nickname", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                placeholder="Optional"
                maxLength={17}
                value={vin}
                onChange={(e) => setValue("vin", e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate">License Plate</Label>
              <Input
                id="plate"
                placeholder="Optional"
                value={licensePlate}
                onChange={(e) => setValue("licensePlate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="purchaseDate">Purchased</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={purchaseDate}
                onChange={(e) => setValue("purchaseDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchasePrice">Price ($)</Label>
              <Input
                id="purchasePrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="Optional"
                value={purchasePrice}
                onChange={(e) => setValue("purchasePrice", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchaseOdometer">Odometer</Label>
              <Input
                id="purchaseOdometer"
                type="number"
                min="0"
                placeholder="Optional"
                value={purchaseOdometer}
                onChange={(e) => setValue("purchaseOdometer", e.target.value)}
              />
            </div>
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
              {isPending ? "Saving..." : vehicle ? "Save Changes" : "Add Vehicle"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
