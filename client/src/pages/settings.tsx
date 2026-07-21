import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Check, Pencil, Plus, X } from "lucide-react";
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
import type { ExpenseCategory } from "@shared/schema";

export default function Settings() {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
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
    </div>
  );
}
