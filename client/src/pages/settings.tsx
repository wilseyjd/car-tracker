import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Check,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  RecurringCostFormDialog,
  invalidateRecurringData,
} from "@/components/RecurringCostFormDialog";
import { formatDate, formatMoney } from "@/lib/format";
import type { ExpenseCategory, RecurringCost } from "@shared/schema";

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  "semi-annual": "Semi-annual",
  annual: "Annual",
};

export default function Settings() {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringCost | null>(null);

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
  });
  const { data: recurringCosts = [] } = useQuery<RecurringCost[]>({
    queryKey: ["/api/recurring"],
  });

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const pauseMutation = useMutation({
    mutationFn: ({ id, isPaused }: { id: string; isPaused: boolean }) =>
      apiRequest("PATCH", `/api/recurring/${id}`, { isPaused }),
    onSuccess: (_data, { isPaused }) => {
      invalidateRecurringData();
      toast.success(isPaused ? "Recurring cost paused" : "Recurring cost resumed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRecurringMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recurring/${id}`),
    onSuccess: () => {
      invalidateRecurringData();
      toast.success("Recurring cost deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
  }

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/categories", { name }),
    onSuccess: () => {
      invalidate();
      setNewName("");
      toast.success("Category added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; isArchived?: boolean };
    }) => apiRequest("PATCH", `/api/categories/${id}`, data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const active = categories.filter((c) => !c.isArchived);
  const archived = categories.filter((c) => c.isArchived);

  function CategoryRow({ category }: { category: ExpenseCategory }) {
    const isEditing = editingId === category.id;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
        {isEditing ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (editName.trim()) {
                updateMutation.mutate({
                  id: category.id,
                  data: { name: editName.trim() },
                });
              }
            }}
          >
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8"
              autoFocus
            />
            <Button type="submit" size="icon" className="h-8 w-8">
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditingId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{category.name}</span>
              {category.isSystem && (
                <Badge variant="outline" className="text-xs">
                  default
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Rename"
                onClick={() => {
                  setEditingId(category.id);
                  setEditName(category.name);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={category.isArchived ? "Restore" : "Archive"}
                onClick={() =>
                  updateMutation.mutate({
                    id: category.id,
                    data: { isArchived: !category.isArchived },
                  })
                }
              >
                {category.isArchived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense Categories</CardTitle>
          <CardDescription>
            Rename or archive categories. Archived categories are hidden from
            the expense form but stay attached to past expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createMutation.mutate(newName.trim());
            }}
          >
            <Input
              placeholder="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" disabled={createMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </form>

          <div className="space-y-1">
            {active.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </div>

          {archived.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Archived
              </p>
              <div className="space-y-1 opacity-60">
                {archived.map((c) => (
                  <CategoryRow key={c.id} category={c} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recurring Costs</CardTitle>
            <CardDescription>
              Predictable costs like car payment or insurance, logged
              automatically each period.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingRecurring(null);
              setRecurringDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent>
          {recurringCosts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No recurring costs yet. Add your car payment or insurance to
              stop logging it by hand.
            </p>
          ) : (
            <div className="space-y-1">
              {recurringCosts.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted/50 ${
                    r.isPaused ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Repeat className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.name}
                        {r.isPaused && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (paused)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {categoryName.get(r.categoryId)} ·{" "}
                        {CADENCE_LABELS[r.cadence] ?? r.cadence} · since{" "}
                        {formatDate(r.startDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-semibold mr-1">
                      {formatMoney(r.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={r.isPaused ? "Resume" : "Pause"}
                      onClick={() =>
                        pauseMutation.mutate({
                          id: r.id,
                          isPaused: !r.isPaused,
                        })
                      }
                    >
                      {r.isPaused ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit"
                      onClick={() => {
                        setEditingRecurring(r);
                        setRecurringDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Delete"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${r.name}"? Past logged expenses stay in your ledger, but future instances stop.`,
                          )
                        ) {
                          deleteRecurringMutation.mutate(r.id);
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

      <RecurringCostFormDialog
        open={recurringDialogOpen}
        onOpenChange={setRecurringDialogOpen}
        recurringCost={editingRecurring}
      />
    </div>
  );
}
