import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Gauge, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDate, formatMiles, formatMoney, todayISO } from "@/lib/format";
import type { OdometerLog, Vehicle } from "@shared/schema";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function VehicleDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [reading, setReading] = useState("");
  const [readingDate, setReadingDate] = useState(todayISO());

  const vehicleUrl = `/api/vehicles/${params.id}`;
  const odometerUrl = `/api/vehicles/${params.id}/odometer`;

  const { data: vehicle, isLoading } = useQuery<Vehicle>({
    queryKey: [vehicleUrl],
  });
  const { data: logs = [] } = useQuery<OdometerLog[]>({
    queryKey: [odometerUrl],
  });

  const currentReading = logs.length
    ? Math.max(...logs.map((l) => l.reading))
    : null;

  function invalidate() {
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0].startsWith("/api/vehicles") ||
          q.queryKey[0].startsWith("/api/reports/summary")),
    });
  }

  const addReadingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", odometerUrl, {
        reading: parseInt(reading, 10),
        readingDate,
      }),
    onSuccess: () => {
      invalidate();
      setReading("");
      setReadingDate(todayISO());
      toast.success("Odometer reading added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteReadingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/odometer/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Reading deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", vehicleUrl),
    onSuccess: () => {
      queryClient.clear();
      toast.success("Vehicle deleted");
      navigate("/vehicles");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!vehicle) {
    return (
      <p className="text-sm text-muted-foreground py-16 text-center">
        Vehicle not found.
      </p>
    );
  }

  function handleAddReading(e: React.FormEvent) {
    e.preventDefault();
    const value = parseInt(reading, 10);
    if (!value || value < 0) return toast.error("Enter a valid reading");
    if (
      currentReading != null &&
      value < currentReading &&
      !confirm(
        `This reading (${value.toLocaleString()}) is lower than the current odometer (${currentReading.toLocaleString()}). Add anyway?`,
      )
    ) {
      return;
    }
    addReadingMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          </h1>
          {vehicle.nickname && (
            <p className="text-sm text-muted-foreground">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim ? ` ${vehicle.trim}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => {
              if (
                confirm(
                  "Delete this vehicle? All of its expenses and odometer history will be deleted too.",
                )
              ) {
                deleteVehicleMutation.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle Info</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow
              label="Vehicle"
              value={`${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`}
            />
            {vehicle.vin && <InfoRow label="VIN" value={vehicle.vin} />}
            {vehicle.licensePlate && (
              <InfoRow label="License Plate" value={vehicle.licensePlate} />
            )}
            <InfoRow
              label="Purchase Date"
              value={formatDate(vehicle.purchaseDate)}
            />
            <InfoRow
              label="Purchase Price"
              value={formatMoney(vehicle.purchasePrice)}
            />
            <InfoRow
              label="Odometer at Purchase"
              value={
                vehicle.purchaseOdometer != null
                  ? formatMiles(vehicle.purchaseOdometer)
                  : "—"
              }
            />
            <InfoRow
              label="Current Odometer"
              value={currentReading != null ? formatMiles(currentReading) : "—"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Odometer Log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddReading} className="flex items-end gap-2">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="reading">Reading (mi)</Label>
                <Input
                  id="reading"
                  type="number"
                  min="0"
                  placeholder="12500"
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="readingDate">Date</Label>
                <Input
                  id="readingDate"
                  type="date"
                  className="w-36"
                  value={readingDate}
                  onChange={(e) => setReadingDate(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={addReadingMutation.isPending}
                title="Add reading"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>

            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No readings yet.
              </p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatMiles(log.reading)}
                      </span>
                      {log.source !== "manual" && (
                        <Badge variant="outline" className="text-xs">
                          {log.source}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(log.readingDate)}
                      </span>
                      {log.source === "manual" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          title="Delete reading"
                          onClick={() => {
                            if (confirm("Delete this reading?")) {
                              deleteReadingMutation.mutate(log.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <VehicleFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vehicle={vehicle}
      />
    </div>
  );
}
