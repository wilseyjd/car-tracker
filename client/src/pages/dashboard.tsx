import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Car,
  DollarSign,
  Gauge,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { QueryError } from "@/components/QueryError";
import { CHART_COLORS } from "@/lib/chart-colors";
import { formatDate, formatMiles, formatMonth, formatMoney } from "@/lib/format";
import type {
  Expense,
  ExpenseCategory,
  SummaryReport,
  Vehicle,
} from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: React.ReactNode;
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

function MonthlyTrendHint({ summary }: { summary: SummaryReport }) {
  if (summary.monthlySpendPrior == null || summary.monthlySpendPrior === 0) {
    return <>Trailing 12-month average</>;
  }
  const delta =
    ((summary.monthlySpend - summary.monthlySpendPrior) /
      summary.monthlySpendPrior) *
    100;
  const rounded = Math.round(delta);
  if (Math.abs(rounded) < 1) {
    return <>Flat vs prior 12 months</>;
  }
  const up = rounded > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 ${up ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(rounded)}% vs prior 12mo
    </span>
  );
}

export default function Dashboard() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const {
    data: vehicles,
    isLoading: vehiclesLoading,
    isError: vehiclesError,
    refetch: refetchVehicles,
  } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const vehicleParam =
    selectedVehicleId !== "all"
      ? selectedVehicleId
      : vehicles?.length === 1
        ? vehicles[0].id
        : undefined;

  const summaryParams = new URLSearchParams();
  if (vehicleParam) summaryParams.set("vehicleId", vehicleParam);
  if (from) summaryParams.set("from", from);
  if (to) summaryParams.set("to", to);
  const summaryQuery = summaryParams.toString();
  const summaryUrl = `/api/reports/summary${summaryQuery ? `?${summaryQuery}` : ""}`;

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery<SummaryReport>({
    queryKey: [summaryUrl],
    enabled: !!vehicles && vehicles.length > 0,
  });

  const {
    data: expenses,
    isError: expensesError,
    refetch: refetchExpenses,
  } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    enabled: !!vehicles && vehicles.length > 0,
  });
  const {
    data: categories,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
    enabled: !!vehicles && vehicles.length > 0,
  });

  const categoryName = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  const recentExpenses = useMemo(() => {
    let list = expenses ?? [];
    if (vehicleParam) list = list.filter((e) => e.vehicleId === vehicleParam);
    if (from) list = list.filter((e) => e.expenseDate >= from);
    if (to) list = list.filter((e) => e.expenseDate <= to);
    return list.slice(0, 5);
  }, [expenses, vehicleParam, from, to]);

  const trendData = useMemo(
    () =>
      (summary?.byMonth ?? []).map((m) => ({
        month: formatMonth(m.month),
        total: m.total,
      })),
    [summary],
  );

  if (vehiclesLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (vehiclesError) {
    return (
      <QueryError
        message="We couldn't load your vehicles."
        onRetry={() => refetchVehicles()}
      />
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

  const multiVehicleAllSelected = vehicles.length > 1 && !vehicleParam;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-36"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            className="w-36"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {summaryError ? (
        <Card>
          <CardContent>
            <QueryError
              message="We couldn't load your cost summary."
              onRetry={() => refetchSummary()}
            />
          </CardContent>
        </Card>
      ) : summaryLoading || !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
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
              hint={<MonthlyTrendHint summary={summary} />}
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
                summary.costPerMile != null
                  ? `${formatMiles(summary.milesDriven)} driven`
                  : multiVehicleAllSelected
                    ? "Select a single vehicle to see cost/mile"
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip
                        formatter={(value) => formatMoney(value as number)}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Bar
                        dataKey="total"
                        fill={CHART_COLORS[0]}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  No expenses in this range yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
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
            {expensesError || categoriesError ? (
              <QueryError
                message="We couldn't load your recent expenses."
                onRetry={() => {
                  refetchExpenses();
                  refetchCategories();
                }}
              />
            ) : recentExpenses.length > 0 ? (
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
