import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarSign, Plus, Scale, TrendingDown, Trash2 } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/QueryError";
import { ValueEstimateFormDialog } from "@/components/ValueEstimateFormDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDate, formatMoney } from "@/lib/format";
import type { ValueCurve, ValueEstimate, Vehicle } from "@shared/schema";

export default function Value() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const vehicleId =
    selectedVehicleId || (vehicles && vehicles.length > 0 ? vehicles[0].id : "");
  const vehicle = vehicles?.find((v) => v.id === vehicleId);

  const {
    data: curve,
    isLoading: curveLoading,
    isError: curveError,
    refetch: refetchCurve,
  } = useQuery<ValueCurve>({
    queryKey: [`/api/vehicles/${vehicleId}/value-curve`],
    enabled: !!vehicleId,
  });

  const {
    data: checkpoints = [],
    isError: checkpointsError,
    refetch: refetchCheckpoints,
  } = useQuery<ValueEstimate[]>({
    queryKey: [`/api/vehicles/${vehicleId}/values`],
    enabled: !!vehicleId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/values/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].includes("/values") ||
            q.queryKey[0].includes("/value-curve")),
      });
      toast.success("Checkpoint deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chartData = useMemo(
    () =>
      (curve?.points ?? []).map((p) => ({
        date: formatDate(p.date),
        value: p.value,
      })),
    [curve],
  );

  if (vehiclesLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <TrendingDown className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">No vehicle yet</h2>
        <p className="text-muted-foreground mt-1 max-w-sm">
          Add a car in the Garage to start tracking its value over time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Vehicle Value</h1>
        <div className="flex items-center gap-2">
          {vehicles.length > 1 && (
            <Select value={vehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nickname || `${v.year} ${v.make} ${v.model}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Checkpoint
          </Button>
        </div>
      </div>

      {curveError ? (
        <Card>
          <CardContent>
            <QueryError
              message="We couldn't load this vehicle's value curve."
              onRetry={() => refetchCurve()}
            />
          </CardContent>
        </Card>
      ) : curveLoading || !curve ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : curve.currentEstimate == null ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {vehicle?.nickname || `${vehicle?.year} ${vehicle?.make} ${vehicle?.model}`}{" "}
            has no purchase price and no value checkpoints yet — add one to start
            tracking its value.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Estimated Value
                  </p>
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {formatMoney(curve.currentEstimate)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Cumulative Spend
                  </p>
                  <TrendingDown className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {formatMoney(curve.cumulativeSpend)}
                </p>
              </CardContent>
            </Card>
            {curve.equity != null && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Equity</p>
                    <Scale className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-1 text-2xl font-bold">
                    {formatMoney(curve.equity)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatMoney(curve.remainingLoanBalance)} remaining on loan
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Value Over Time
                {vehicle?.purchasePrice && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · anchored at {formatMoney(vehicle.purchasePrice)} purchase price
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <YAxis
                        domain={[0, "auto"]}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={64}
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => formatMoney(value as number)}
                      />
                      <Tooltip
                        formatter={(value) => formatMoney(value as number)}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Not enough data to plot a curve yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checkpoints</CardTitle>
        </CardHeader>
        <CardContent>
          {checkpointsError ? (
            <QueryError
              message="We couldn't load value checkpoints."
              onRetry={() => refetchCheckpoints()}
            />
          ) : checkpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No checkpoints logged yet — add one from KBB, Carvana, a dealer
              offer, or another source.
            </p>
          ) : (
            <div className="space-y-2">
              {checkpoints.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 text-sm py-2 border-b last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(c.estimateDate)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.source}
                      {c.notes ? ` — ${c.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold">{formatMoney(c.value)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-destructive"
                      title="Delete checkpoint"
                      onClick={() => {
                        if (confirm(`Delete the ${formatDate(c.estimateDate)} checkpoint?`)) {
                          deleteMutation.mutate(c.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {vehicleId && (
        <ValueEstimateFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          vehicleId={vehicleId}
        />
      )}
    </div>
  );
}
