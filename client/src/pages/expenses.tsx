import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatMiles, formatMoney } from "@/lib/format";
import type { Expense, ExpenseCategory, Vehicle } from "@shared/schema";

export default function Expenses() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });
  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
  });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
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
    return list;
  }, [expenses, vehicleFilter, categoryFilter, from, to]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + parseFloat(e.amount), 0),
    [filtered],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      invalidateExpenseData();
      toast.success("Expense deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} expenses · {formatMoney(filteredTotal)}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
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
        {(from || to || categoryFilter !== "all" || vehicleFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
              setCategoryFilter("all");
              setVehicleFilter("all");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
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
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {formatDate(e.expenseDate)}
                      </span>
                      <Badge variant="secondary">
                        {categoryName.get(e.categoryId) ?? "—"}
                      </Badge>
                      {e.odometer != null && (
                        <span className="text-xs text-muted-foreground">
                          {formatMiles(e.odometer)}
                        </span>
                      )}
                    </div>
                    {(e.vendor || e.notes) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {[e.vendor, e.notes].filter(Boolean).join(" — ")}
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
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-semibold mr-2">
                      {formatMoney(e.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(e)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      title="Delete"
                      onClick={() => {
                        if (confirm("Delete this expense?")) {
                          deleteMutation.mutate(e.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
      />
    </div>
  );
}
