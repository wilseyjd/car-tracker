import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gauge, Pencil, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  ExpenseFormDialog,
  invalidateExpenseData,
} from "@/components/ExpenseFormDialog";
import { ImportExpensesDialog } from "@/components/ImportExpensesDialog";
import { QueryError } from "@/components/QueryError";
import { apiRequest } from "@/lib/queryClient";
import { categoryColor } from "@/lib/chart-colors";
import { formatDate, formatMiles, formatMonth, formatMoney } from "@/lib/format";
import type { Expense, ExpenseCategory, Vehicle } from "@shared/schema";

type SortOption = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

function ExpenseRow({
  expense: e,
  categoryName,
  showDate,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  categoryName: Map<string, string>;
  showDate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = categoryColor(e.categoryId);
  return (
    <Card>
      <CardContent className="py-2.5 px-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Merchant is the primary "what did I buy" text; category is secondary metadata. */}
            <p className="text-sm font-semibold truncate">
              {e.vendor || categoryName.get(e.categoryId) || "—"}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {showDate && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(e.expenseDate)}
                </span>
              )}
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-medium"
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                }}
              >
                {categoryName.get(e.categoryId) ?? "—"}
              </Badge>
              {e.odometer != null && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Gauge className="h-3 w-3" />
                  Odometer: {formatMiles(e.odometer)}
                </span>
              )}
            </div>
            {e.notes && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {e.notes}
              </p>
            )}
            {e.gallons && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {parseFloat(e.gallons).toFixed(2)} gal
                {e.pricePerGallon
                  ? ` @ $${parseFloat(e.pricePerGallon).toFixed(3)}/gal`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold mr-1">
              {formatMoney(e.amount)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={onEdit}
              title="Edit"
              aria-label="Edit expense"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Delete"
              aria-label="Delete expense"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Expenses() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");

  const {
    data: expenses,
    isLoading,
    isError: expensesError,
    refetch: refetchExpenses,
  } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });
  const {
    data: categories = [],
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
  });
  const {
    data: vehicles = [],
    isError: vehiclesError,
    refetch: refetchVehicles,
  } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    let list = expenses ?? [];
    if (vehicleFilter !== "all")
      list = list.filter((e) => e.vehicleId === vehicleFilter);
    if (categoryFilter !== "all")
      list = list.filter((e) => e.categoryId === categoryFilter);
    if (from) list = list.filter((e) => e.expenseDate >= from);
    if (to) list = list.filter((e) => e.expenseDate <= to);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => {
        const cat = categoryName.get(e.categoryId) ?? "";
        return (
          e.vendor?.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [expenses, vehicleFilter, categoryFilter, from, to, search, categoryName]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + parseFloat(e.amount), 0),
    [filtered],
  );

  const sorted = useMemo(() => {
    if (sortBy === "date-desc") return filtered;
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortBy === "date-asc") return a.expenseDate.localeCompare(b.expenseDate);
      const amountDiff = parseFloat(a.amount) - parseFloat(b.amount);
      return sortBy === "amount-asc" ? amountDiff : -amountDiff;
    });
    return list;
  }, [filtered, sortBy]);

  // Grouped by month, then by day within the month, so a run of same-day expenses shares one
  // date header instead of each row repeating it. Only meaningful in the default date-desc
  // order — any other sort renders as a flat list instead (see below).
  const groupedByMonth = useMemo(() => {
    const monthGroups = new Map<string, Expense[]>();
    for (const e of filtered) {
      const key = e.expenseDate.slice(0, 7); // YYYY-MM
      if (!monthGroups.has(key)) monthGroups.set(key, []);
      monthGroups.get(key)!.push(e);
    }
    return Array.from(monthGroups.entries()).map(([month, items]) => {
      const dayGroups = new Map<string, Expense[]>();
      for (const e of items) {
        if (!dayGroups.has(e.expenseDate)) dayGroups.set(e.expenseDate, []);
        dayGroups.get(e.expenseDate)!.push(e);
      }
      return {
        month,
        total: items.reduce((sum, e) => sum + parseFloat(e.amount), 0),
        days: Array.from(dayGroups.entries()).map(([date, dayItems]) => ({
          date,
          items: dayItems,
        })),
      };
    });
  }, [filtered]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      invalidateExpenseData();
      toast.success("Expense deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openEdit(expense: Expense) {
    setEditing(expense);
    setDialogOpen(true);
  }

  function confirmDelete(expense: Expense) {
    const label = expense.vendor || categoryName.get(expense.categoryId) || "this expense";
    if (confirm(`Delete "${label}" (${formatMoney(expense.amount)})? This can't be undone.`)) {
      deleteMutation.mutate(expense.id);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} expenses · {formatMoney(filteredTotal)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4 mr-1" /> Import CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="w-48 pl-8"
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search expenses"
          />
        </div>
        {vehicles.length > 1 && (
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-44">
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest first</SelectItem>
            <SelectItem value="date-asc">Oldest first</SelectItem>
            <SelectItem value="amount-desc">Amount: high to low</SelectItem>
            <SelectItem value="amount-asc">Amount: low to high</SelectItem>
          </SelectContent>
        </Select>
        {(from ||
          to ||
          categoryFilter !== "all" ||
          vehicleFilter !== "all" ||
          search ||
          sortBy !== "date-desc") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
              setCategoryFilter("all");
              setVehicleFilter("all");
              setSearch("");
              setSortBy("date-desc");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* List */}
      {expensesError || categoriesError || vehiclesError ? (
        <Card>
          <CardContent>
            <QueryError
              message="We couldn't load your expenses."
              onRetry={() => {
                refetchExpenses();
                refetchCategories();
                refetchVehicles();
              }}
            />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No expenses found. Add one to start tracking.
          </CardContent>
        </Card>
      ) : sortBy === "date-desc" ? (
        <div className="space-y-5">
          {groupedByMonth.map((group) => (
            <div key={group.month}>
              <div className="flex items-center justify-between px-1 pb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatMonth(group.month)}
                </h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {formatMoney(group.total)}
                </span>
              </div>
              <div className="space-y-3">
                {group.days.map((day) => (
                  <div key={day.date}>
                    <p className="text-xs text-muted-foreground px-1 pb-1">
                      {formatDate(day.date)}
                    </p>
                    <div className="space-y-1.5">
                      {day.items.map((e) => (
                        <ExpenseRow
                          key={e.id}
                          expense={e}
                          categoryName={categoryName}
                          showDate={false}
                          onEdit={() => openEdit(e)}
                          onDelete={() => confirmDelete(e)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((e) => (
            <ExpenseRow
              key={e.id}
              expense={e}
              categoryName={categoryName}
              showDate
              onEdit={() => openEdit(e)}
              onDelete={() => confirmDelete(e)}
            />
          ))}
        </div>
      )}

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
      />
      <ImportExpensesDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
