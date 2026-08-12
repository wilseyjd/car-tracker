import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fuel as FuelIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { CHART_COLORS } from "@/lib/chart-colors";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import type { FuelAnalytics, Vehicle } from "@shared/schema";

function formatPricePerGallon(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(3)}/gal`;
}

export default function Fuel() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const vehicleParam =
    selectedVehicleId !== "all"
      ? selectedVehicleId
      : vehicles?.length === 1
        ? vehicles[0].id
        : undefined;

  const fuelUrl = vehicleParam
    ? `/api/reports/fuel?vehicleId=${vehicleParam}`
    : "/api/reports/fuel";

  const {
    data: fuel,
    isLoading,
    isError,
    refetch,
  } = useQuery<FuelAnalytics>({
    queryKey: [fuelUrl],
    enabled: !!vehicles && vehicles.length > 0,
  });

  const priceTrendData = useMemo(
    () =>
      (fuel?.priceTrend ?? []).map((p) => ({
        date: formatDate(p.date),
        price: p.pricePerGallon,
      })),
    [fuel],
  );

  const monthData = useMemo(
    () =>
      (fuel?.byMonth ?? []).map((m) => ({
        month: formatMonth(m.month),
        avgPrice: m.avgPrice,
        totalSpent: m.totalSpent,
      })),
    [fuel],
  );

  if (vehiclesLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <FuelIcon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">No vehicle yet</h2>
        <p className="text-muted-foreground mt-1 max-w-sm">
          Add a car in the Garage to start tracking fuel prices.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Gas Analytics</h1>
        {vehicles.length > 1 && (
          <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nickname || `${v.year} ${v.make} ${v.model}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isError ? (
        <Card>
          <CardContent>
            <QueryError
              message="We couldn't load fuel analytics."
              onRetry={() => refetch()}
            />
          </CardContent>
        </Card>
      ) : isLoading || !fuel ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      ) : fuel.fillUpCount === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No fuel expenses logged yet — log a fill-up (with gallons and
            price/gallon) to see price trends and comparisons here.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price / Gallon Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {priceTrendData.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={priceTrendData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={56}
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v) => `$${(v as number).toFixed(2)}`}
                      />
                      <Tooltip
                        formatter={(value) =>
                          formatPricePerGallon(value as number)
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={CHART_COLORS[0]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  No fill-ups with a price/gallon recorded yet.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Avg Price by Day of Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={fuel.byDayOfWeek}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="day"
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
                        width={48}
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip
                        formatter={(value, _name, props) => [
                          formatPricePerGallon(value as number),
                          `${props.payload.fillUps} fill-up${props.payload.fillUps === 1 ? "" : "s"}`,
                        ]}
                      />
                      <Bar
                        dataKey="avgPrice"
                        fill={CHART_COLORS[0]}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Station</CardTitle>
              </CardHeader>
              <CardContent>
                {fuel.byVendor.length > 0 ? (
                  <div className="space-y-2">
                    {fuel.byVendor.map((v) => (
                      <div
                        key={v.vendor}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{v.vendor}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.fillUps} fill-up{v.fillUps === 1 ? "" : "s"} ·{" "}
                            {formatMoney(v.totalSpent)}
                          </p>
                        </div>
                        <span className="font-semibold shrink-0">
                          {formatPricePerGallon(v.avgPrice)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No vendor recorded on fuel expenses yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By Month</CardTitle>
            </CardHeader>
            <CardContent>
              {monthData.length > 0 ? (
                <div className="space-y-2">
                  {monthData.map((m) => (
                    <div
                      key={m.month}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{m.month}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {formatPricePerGallon(m.avgPrice)} avg
                        </span>
                        <span className="font-medium">
                          {formatMoney(m.totalSpent)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No fuel expenses logged yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
