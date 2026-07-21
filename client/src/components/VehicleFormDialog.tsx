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
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Vehicle } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
}

export function VehicleFormDialog({ open, onOpenChange, vehicle }: Props) {
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [nickname, setNickname] = useState("");
  const [vin, setVin] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseOdometer, setPurchaseOdometer] = useState("");

  useEffect(() => {
    if (!open) return;
    setYear(vehicle ? String(vehicle.year) : "");
    setMake(vehicle?.make ?? "");
    setModel(vehicle?.model ?? "");
    setTrim(vehicle?.trim ?? "");
    setNickname(vehicle?.nickname ?? "");
    setVin(vehicle?.vin ?? "");
    setLicensePlate(vehicle?.licensePlate ?? "");
    setPurchaseDate(vehicle?.purchaseDate ?? "");
    setPurchasePrice(vehicle?.purchasePrice ?? "");
    setPurchaseOdometer(
      vehicle?.purchaseOdometer != null ? String(vehicle.purchaseOdometer) : "",
    );
  }, [open, vehicle]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        year: parseInt(year, 10),
        make,
        model,
        trim: trim || null,
        nickname: nickname || null,
        vin: vin || null,
        licensePlate: licensePlate || null,
        purchaseDate: purchaseDate || null,
        purchasePrice: purchasePrice || null,
        purchaseOdometer: purchaseOdometer
          ? parseInt(purchaseOdometer, 10)
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
      toast.success(vehicle ? "Vehicle updated" : "Vehicle added");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const y = parseInt(year, 10);
    if (!y || y < 1900 || y > 2100) return toast.error("Enter a valid year");
    if (!make.trim()) return toast.error("Make is required");
    if (!model.trim()) return toast.error("Model is required");
    mutation.mutate();
  }

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
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                placeholder="Toyota"
                value={make}
                onChange={(e) => setMake(e.target.value)}
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
                onChange={(e) => setModel(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trim">Trim</Label>
              <Input
                id="trim"
                placeholder="Optional"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              placeholder="Optional — shown around the app"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
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
                onChange={(e) => setVin(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate">License Plate</Label>
              <Input
                id="plate"
                placeholder="Optional"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
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
                onChange={(e) => setPurchaseDate(e.target.value)}
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
                onChange={(e) => setPurchasePrice(e.target.value)}
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
                onChange={(e) => setPurchaseOdometer(e.target.value)}
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving..."
                : vehicle
                  ? "Save Changes"
                  : "Add Vehicle"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
