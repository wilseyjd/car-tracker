import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Car, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryState } from "@/components/QueryState";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { formatDate, formatMoney } from "@/lib/format";
import type { Vehicle } from "@shared/schema";

export default function Vehicles() {
  const [addOpen, setAddOpen] = useState(false);
  const {
    data: vehicles,
    isLoading,
    isError,
    error,
  } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Garage</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Vehicle
        </Button>
      </div>

      <QueryState
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={vehicles}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        }
        empty={
          <Card>
            <CardContent className="py-16 text-center">
              <Car className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No vehicles yet. Add your car to start tracking.
              </p>
            </CardContent>
          </Card>
        }
      >
        {(vehicles) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {vehicles.map((v) => (
              <Link key={v.id} href={`/vehicle/${v.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                          <Car className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">
                            {v.nickname || `${v.year} ${v.make} ${v.model}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {v.nickname
                              ? `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`
                              : v.trim || " "}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-4 flex gap-6 text-sm text-muted-foreground">
                      {v.purchaseDate && (
                        <span>Purchased {formatDate(v.purchaseDate)}</span>
                      )}
                      {v.purchasePrice && (
                        <span>{formatMoney(v.purchasePrice)}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </QueryState>

      <VehicleFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
