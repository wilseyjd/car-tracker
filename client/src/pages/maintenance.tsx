import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MaintenanceScheduleFormDialog,
  invalidateMaintenanceData,
} from "@/components/MaintenanceScheduleFormDialog";
import { ServiceRecordFormDialog } from "@/components/ServiceRecordFormDialog";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatMiles, formatMoney } from "@/lib/format";
import type {
  Expense,
  MaintenanceItemStatus,
  MaintenanceSchedule,
  MaintenanceStatusLevel,
  ServiceRecord,
  Vehicle,
} from "@shared/schema";

const STATUS_META: Record<
  MaintenanceStatusLevel,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  ok: {
    label: "OK",
    icon: CheckCircle2,
    className:
      "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  due_soon: {
    label: "Due soon",
    icon: Clock,
    className:
      "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  overdue: {
    label: "Overdue",
    icon: AlertTriangle,
    className: "",
  },
};

function dueInText(item: MaintenanceItemStatus): string {
  const parts: string[] = [];
  if (item.milesRemaining != null) {
    parts.push(
      item.milesRemaining >= 0
        ? `${formatMiles(item.milesRemaining)} left`
        : `${formatMiles(Math.abs(item.milesRemaining))} over`,
    );
  }
  if (item.daysRemaining != null) {
    parts.push(
      item.daysRemaining >= 0
        ? `${item.daysRemaining}d left`
        : `${Math.abs(item.daysRemaining)}d over`,
    );
  }
  return parts.length ? parts.join(" · ") : "No interval set";
}

export default function Maintenance() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<MaintenanceSchedule | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(
    null,
  );
  const [defaultScheduleId, setDefaultScheduleId] = useState<
    string | undefined
  >(undefined);

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const vehicleId =
    selectedVehicleId || (vehicles && vehicles.length > 0 ? vehicles[0].id : "");

  const {
    data: status,
    isLoading: statusLoading,
    isError: statusError,
    refetch: refetchStatus,
  } = useQuery<MaintenanceItemStatus[]>({
    queryKey: [`/api/vehicles/${vehicleId}/maintenance-status`],
    enabled: !!vehicleId,
  });

  const { data: services = [], isError: servicesError } = useQuery<
    ServiceRecord[]
  >({
    queryKey: [`/api/vehicles/${vehicleId}/services`],
    enabled: !!vehicleId,
  });

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    enabled: !!vehicleId,
  });
  const expenseAmount = useMemo(
    () => new Map(expenses.map((e) => [e.id, e.amount])),
    [expenses],
  );

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      apiRequest("PATCH", `/api/schedules/${id}`, { isArchived }),
    onSuccess: (_data, { isArchived }) => {
      invalidateMaintenanceData(vehicleId);
      toast.success(isArchived ? "Schedule item archived" : "Schedule item restored");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/services/${id}`),
    onSuccess: () => {
      invalidateMaintenanceData(vehicleId);
      toast.success("Service record deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (vehiclesLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Wrench className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">No vehicle yet</h2>
        <p className="text-muted-foreground mt-1 max-w-sm">
          Add a car in the Garage to start tracking its maintenance schedule.
        </p>
      </div>
    );
  }

  const activeSchedules = (status ?? []).filter((s) => !s.schedule.isArchived);
  const archivedSchedules = (status ?? [])
    .filter((s) => s.schedule.isArchived)
    .map((s) => s.schedule);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
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
      </div>

      <Tabs defaultValue="status">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="history">Service History</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingSchedule(null);
                setScheduleDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Custom Item
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingService(null);
                setDefaultScheduleId(undefined);
                setServiceDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Log Service
            </Button>
          </div>
        </div>

        <TabsContent value="status">
          {statusError ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                We couldn't load the maintenance status.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchStatus()}>
                Retry
              </Button>
            </div>
          ) : statusLoading ? (
            <div className="space-y-2 mt-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {activeSchedules
                .sort((a, b) => {
                  const order = { overdue: 0, due_soon: 1, ok: 2 };
                  return order[a.status] - order[b.status];
                })
                .map((item) => {
                  const meta = STATUS_META[item.status];
                  const Icon = meta.icon;
                  return (
                    <Card key={item.schedule.id}>
                      <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{item.schedule.name}</p>
                            <Badge
                              variant={
                                item.status === "overdue" ? "destructive" : undefined
                              }
                              className={meta.className}
                            >
                              <Icon className="h-3 w-3 mr-1" />
                              {meta.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {dueInText(item)}
                            {item.lastService &&
                              ` · last done ${formatDate(item.lastService.serviceDate)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => {
                              setEditingService(null);
                              setDefaultScheduleId(item.schedule.id);
                              setServiceDialogOpen(true);
                            }}
                          >
                            Log Service
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit"
                            onClick={() => {
                              setEditingSchedule(item.schedule);
                              setScheduleDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Archive"
                            onClick={() =>
                              archiveMutation.mutate({
                                id: item.schedule.id,
                                isArchived: true,
                              })
                            }
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

              {archivedSchedules.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Archived
                  </p>
                  <div className="space-y-1 opacity-60">
                    {archivedSchedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50"
                      >
                        <span className="text-sm">{s.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Restore"
                          onClick={() =>
                            archiveMutation.mutate({ id: s.id, isArchived: false })
                          }
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {servicesError ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              We couldn't load service history.
            </p>
          ) : services.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No services logged yet.
            </p>
          ) : (
            <div className="space-y-1 mt-2">
              {services.map((r) => {
                const scheduleName = (status ?? []).find(
                  (s) => s.schedule.id === r.scheduleId,
                )?.schedule.name;
                const amount = r.expenseId
                  ? expenseAmount.get(r.expenseId)
                  : undefined;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {scheduleName ?? "One-off / Other"}
                        {r.shop && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {r.shop}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.serviceDate)}
                        {r.odometer != null && ` · ${formatMiles(r.odometer)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {amount && (
                        <span className="text-sm font-semibold">
                          {formatMoney(amount)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Edit"
                        onClick={() => {
                          setEditingService(r);
                          setDefaultScheduleId(undefined);
                          setServiceDialogOpen(true);
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
                          if (window.confirm("Delete this service record?")) {
                            deleteServiceMutation.mutate(r.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MaintenanceScheduleFormDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        vehicleId={vehicleId}
        schedule={editingSchedule}
      />
      <ServiceRecordFormDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        vehicleId={vehicleId}
        record={editingService}
        defaultScheduleId={defaultScheduleId}
      />
    </div>
  );
}
