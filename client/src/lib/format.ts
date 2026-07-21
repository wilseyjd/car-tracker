export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // value is YYYY-MM-DD; construct as local date to avoid TZ shift
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMiles(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US")} mi`;
}

export function formatMonth(value: string): string {
  // value is YYYY-MM
  const [y, m] = value.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

// value's format depends on granularity: YYYY-MM-DD (week start) for "week",
// YYYY-MM for "month", YYYY for "year" — matches SummaryReport.byPeriod.
export function formatPeriod(
  value: string,
  granularity: "week" | "month" | "year",
): string {
  if (granularity === "year") return value;
  if (granularity === "month") return formatMonth(value);
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
