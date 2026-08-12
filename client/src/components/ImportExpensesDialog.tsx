import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { parseCsv, toCsvRow } from "@/lib/csv";
import { invalidateExpenseData } from "@/components/ExpenseFormDialog";
import type { ExpenseCategory, Vehicle } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE_COLUMNS = [
  "date",
  "vehicle",
  "category",
  "amount",
  "vendor",
  "odometer",
  "notes",
  "gallons",
  "pricePerGallon",
];

// Rejects not just malformed strings but out-of-range calendar dates (e.g. month 13, Feb 30) —
// a plain digit-shape regex would accept "2026-13-01" and let it reach the server as a 500.
function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

interface ParsedRow {
  line: number;
  raw: Record<string, string>;
  vehicleId?: string;
  categoryId?: string;
  error?: string;
}

type ImportStatus = "idle" | "importing" | "done";

function downloadTemplate(vehicles: Vehicle[], categories: ExpenseCategory[]) {
  const exampleVehicle = vehicles[0]
    ? vehicles[0].nickname || `${vehicles[0].year} ${vehicles[0].make} ${vehicles[0].model}`
    : "2022 Honda Civic";
  const exampleCategory = categories.find((c) => c.name === "Fuel")?.name ?? "Fuel";
  const lines = [
    toCsvRow(TEMPLATE_COLUMNS),
    toCsvRow([
      "2026-06-15",
      exampleVehicle,
      exampleCategory,
      "42.50",
      "Shell",
      "18500",
      "",
      "12.5",
      "3.399",
    ]),
  ];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "expenses-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseRows(
  text: string,
  vehicles: Vehicle[],
  categories: ExpenseCategory[],
): ParsedRow[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];

  const header = table[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);

  const vehicleByLabel = new Map(
    vehicles.map((v) => [
      (v.nickname || `${v.year} ${v.make} ${v.model}`).toLowerCase(),
      v.id,
    ]),
  );
  const categoryByName = new Map(
    categories
      .filter((c) => !c.isArchived)
      .map((c) => [c.name.toLowerCase(), c.id]),
  );

  const rows: ParsedRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cols = table[i];
    if (cols.every((c) => c.trim() === "")) continue;

    const raw: Record<string, string> = {};
    for (const key of TEMPLATE_COLUMNS) {
      const idx = colIndex(key.toLowerCase());
      raw[key] = idx >= 0 ? (cols[idx] ?? "").trim() : "";
    }

    const row: ParsedRow = { line: i + 1, raw };

    if (!isValidDateString(raw.date)) {
      row.error = `Invalid date "${raw.date}" (expected YYYY-MM-DD)`;
    } else if (!raw.vehicle) {
      row.error = "Missing vehicle";
    } else if (!vehicleByLabel.has(raw.vehicle.toLowerCase())) {
      row.error = `Unknown vehicle "${raw.vehicle}"`;
    } else if (!raw.category) {
      row.error = "Missing category";
    } else if (!categoryByName.has(raw.category.toLowerCase())) {
      row.error = `Unknown category "${raw.category}"`;
    } else if (!raw.amount || Number.isNaN(parseFloat(raw.amount))) {
      row.error = `Invalid amount "${raw.amount}"`;
    } else {
      row.vehicleId = vehicleByLabel.get(raw.vehicle.toLowerCase());
      row.categoryId = categoryByName.get(raw.category.toLowerCase());
    }

    rows.push(row);
  }
  return rows;
}

export function ImportExpensesDialog({ open, onOpenChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [results, setResults] = useState<{ line: number; error: string }[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: open,
  });
  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/categories"],
    enabled: open,
  });

  const validRows = rows.filter((r) => !r.error);
  const invalidRows = rows.filter((r) => r.error);

  function reset() {
    setRows([]);
    setStatus("idle");
    setResults([]);
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setRows(parseRows(text, vehicles, categories));
    setStatus("idle");
    setResults([]);
  }

  async function handleImport() {
    setStatus("importing");
    const failures: { line: number; error: string }[] = [];
    let succeeded = 0;

    for (const row of validRows) {
      try {
        await apiRequest("POST", "/api/expenses", {
          vehicleId: row.vehicleId,
          categoryId: row.categoryId,
          amount: row.raw.amount,
          expenseDate: row.raw.date,
          vendor: row.raw.vendor || null,
          odometer: row.raw.odometer ? parseInt(row.raw.odometer, 10) : null,
          notes: row.raw.notes || null,
          gallons: row.raw.gallons || null,
          pricePerGallon: row.raw.pricePerGallon || null,
        });
        succeeded++;
      } catch (e) {
        failures.push({
          line: row.line,
          error: e instanceof Error ? e.message : "Import failed",
        });
      }
    }

    setImportedCount(succeeded);
    setResults(failures);
    setStatus("done");
    if (succeeded > 0) invalidateExpenseData();
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Expenses from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Columns: date (YYYY-MM-DD), vehicle, category, amount, vendor,
              odometer, notes, gallons, pricePerGallon. Vehicle and category
              must match an existing name exactly (case-insensitive).
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate(vehicles, categories)}
            >
              <Download className="h-4 w-4 mr-1" /> Download Template
            </Button>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" /> Choose CSV File
            </Button>
          </div>

          {rows.length > 0 && status !== "done" && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {validRows.length} valid
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> {invalidRows.length} with errors
                  </Badge>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {rows.map((row) => (
                  <div
                    key={row.line}
                    className="px-3 py-2 text-sm flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate">
                        Line {row.line}: {row.raw.date} · {row.raw.vehicle} ·{" "}
                        {row.raw.category} · ${row.raw.amount}
                      </p>
                      {row.error && (
                        <p className="text-xs text-destructive mt-0.5">
                          {row.error}
                        </p>
                      )}
                    </div>
                    {row.error ? (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {status === "done" && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">
                Imported {importedCount} of {validRows.length} valid row
                {validRows.length === 1 ? "" : "s"}
                {invalidRows.length > 0 &&
                  ` (${invalidRows.length} skipped for validation errors)`}
              </p>
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map((r) => (
                    <p key={r.line} className="text-xs text-destructive">
                      Line {r.line}: {r.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
            {status !== "done" && (
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || status === "importing"}
              >
                {status === "importing"
                  ? "Importing..."
                  : `Import ${validRows.length} Row${validRows.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
