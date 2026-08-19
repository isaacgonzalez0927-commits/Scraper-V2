export const JOB_STATUSES = [
  "unscheduled",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
  "void",
] as const;

export const PAYMENT_METHODS = ["card", "ach", "cash", "check", "zelle", "venmo", "other"] as const;
export const COST_CATEGORIES = [
  "materials",
  "equipment",
  "subcontractors",
  "labor",
  "miscellaneous",
] as const;

export const LABELS: Record<string, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partial: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  card: "Card",
  ach: "ACH / bank",
  cash: "Cash",
  check: "Check",
  zelle: "Zelle",
  venmo: "Venmo",
  other: "Other",
  materials: "Materials",
  equipment: "Equipment",
  subcontractors: "Subcontractors",
  labor: "Labor",
  miscellaneous: "Miscellaneous",
};

/* An unknown value renders as empty text. Callers decide what to show instead. */

export function label(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] || value.replace(/_/g, " ");
}

export function prettyDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.includes("T") ? value : `${value}T00:00:00`) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function prettyWhen(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
