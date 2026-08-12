import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  Car,
  Clock,
  DollarSign,
  Gauge,
  Plus,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { formatDate, formatMiles, formatMoney } from "@/lib/format";
import type {
  Expense,
  ExpenseCategory,
  MaintenanceItemStatus,
  SummaryReport,
  Vehicle,
} from "@shared/schema";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const vehicleParam =
    selectedVehicleId !== "all"
      ? selectedVehicleId
      : vehicles?.length === 1
        ? vehicles[0].id
        : undefined;

  const summaryUrl = vehicleParam
    ? `/api/reports/summary?vehicleId=${vehicleParam}`
    : "/api/reports/summary";

  const { data: summary, isLoading: summaryLoading } =
    useQuery<SummaryReport>({
      queryKey: [summaryUrl],
      enabled: !!vehicles && vehicles.length > 0,
    });

  const { data: expenses } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    enabled: !!vehicles && vehicles.length > 0,
  });
  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
    enabled: !!vehicles && vehicles.length > 0,
  });
  const { data: maintenanceStatus } = useQuery<MaintenanceItemStatus[]>({
    queryKey: [`/api/vehicles/${vehicleParam}/maintenance-status`],
    enabled: !!vehicleParam,
  });
  const urgentMaintenance = useMemo(
    () =>
      (maintenanceStatus ?? [])
        .filter((s) => s.status !== "ok")
        .sort((a, b) => (a.status === "overdue" ? -1 : 1)),
    [maintenanceStatus],
  );

  const categoryName = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  const recentExpenses = useMemo(() => {
    let list = expenses ?? [];
    if (vehicleParam) list = list.filter((e) => e.vehicleId === vehicleParam);
    return list.slice(0, 5);
  }, [expenses, vehicleParam]);

  if (vehiclesLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Car className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Add your car to get started</h2>
          <p className="text-muted-foreground mt-1 max-w-sm">
            Register your vehicle and start logging every expense to see the
            true cost of ownership.
          </p>
          <Button className="mt-6" onClick={() => setAddVehicleOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Vehicle
          </Button>
        </div>
        <VehicleFormDialog
          open={addVehicleOpen}
          onOpenChange={setAddVehicleOpen}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        {vehicles.length > 1 && (
          <Select
            value={selectedVehicleId}
            onValueChange={setSelectedVehicleId}
          >
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

      {summaryLoading || !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Spend"
            value={formatMoney(summary.totalSpend)}
            icon={DollarSign}
            hint={`${summary.expenseCount} expenses logged`}
          />
          <StatCard
            title="Cost / Month"
            value={formatMoney(summary.monthlySpend)}
            icon={TrendingUp}
            hint="Trailing 12-month average"
          />
          <StatCard
            title="Cost / Mile"
            value={
              summary.costPerMile != null
                ? formatMoney(summary.costPerMile)
                : "—"
            }
            icon={Gauge}
            hint={
              summary.milesDriven != null
                ? `${formatMiles(summary.milesDriven)} driven`
                : "Log odometer readings"
            }
          />
          <StatCard
            title="Odometer"
            value={
              summary.currentOdometer != null
                ? formatMiles(summary.currentOdometer)
                : "—"
            }
            icon={Car}
            hint="Latest reading"
          />
        </div>
      )}

      {vehicleParam && urgentMaintenance.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Maintenance
            </CardTitle>
            <Link
              href="/maintenance"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {urgentMaintenance.slice(0, 4).map((item) => (
              <div
                key={item.schedule.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  {item.status === "overdue" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  )}
                  {item.schedule.name}
                </span>
                <Badge
                  variant={item.status === "overdue" ? "destructive" : undefined}
                  className={
                    item.status === "due_soon"
                      ? "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      : undefined
                  }
                >
                  {item.status === "overdue" ? "Overdue" : "Due soon"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.byCategory.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.byCategory}
                        dataKey="total"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {summary.byCategory.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatMoney(value as number)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-2">
                  {summary.byCategory.slice(0, 6).map((c, i) => (
                    <div
                      key={c.categoryId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                        {c.name}
                      </span>
                      <span className="font-medium">
                        {formatMoney(c.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No expenses yet — add your first one to see the breakdown.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Expenses</CardTitle>
            <Link
              href="/expenses"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentExpenses.length > 0 ? (
              <div className="space-y-3">
                {recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {e.vendor || categoryName.get(e.categoryId) || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(e.expenseDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">
                        {categoryName.get(e.categoryId)}
                      </Badge>
                      <span className="text-sm font-semibold">
                        {formatMoney(e.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No expenses yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
