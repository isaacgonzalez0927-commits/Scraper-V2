/**
 * Collect: money that is already the shop's but not in the bank.
 * Ranking and copy live here so Overview, Collect, and tests share one rule.
 */

export type CollectKind = "unbilled" | "draft" | "open" | "estimate" | "followup";

export type CollectInput = {
  kind: CollectKind;
  id: number;
  customerId: number;
  customerName: string;
  phone: string;
  title: string;
  amountCents: number;
  sortAt: string;
  overdue?: boolean;
  publicToken?: string;
};

export type CollectRow = CollectInput & {
  href: string;
  action: string;
  group: string;
};

const KIND_ORDER: Record<CollectKind, number> = {
  open: 1,
  unbilled: 2,
  draft: 3,
  estimate: 4,
  followup: 5,
};

export function collectHref(row: CollectInput): string {
  if (row.kind === "unbilled") return `/jobs/${row.id}/finish`;
  if (row.kind === "draft" || row.kind === "open") return `/invoices/${row.id}`;
  if (row.kind === "estimate") return `/estimates/${row.id}`;
  return `/customers/${row.customerId}`;
}

export function collectAction(row: CollectInput): string {
  if (row.kind === "unbilled") return "Bill now";
  if (row.kind === "draft") return "Send";
  if (row.kind === "open") return "Text pay link";
  if (row.kind === "estimate") return "Convert to job";
  return "Open";
}

export function groupCollectRows(
  rows: CollectRow[],
): Array<{ group: string; rows: CollectRow[] }> {
  const order: string[] = [];
  const map = new Map<string, CollectRow[]>();
  for (const row of rows) {
    if (!map.has(row.group)) {
      order.push(row.group);
      map.set(row.group, []);
    }
    map.get(row.group)!.push(row);
  }
  return order.map((group) => ({ group, rows: map.get(group)! }));
}

export function collectGroup(row: CollectInput): string {
  if (row.kind === "unbilled") return "Finished, never billed";
  if (row.kind === "draft") return "Drafts never sent";
  if (row.kind === "open") return row.overdue ? "Past due" : "Unpaid invoices";
  if (row.kind === "estimate") return "Approved, not scheduled";
  return "Follow-ups";
}

export function rankCollectRows(rows: CollectInput[]): CollectRow[] {
  return [...rows]
    .sort((a, b) => {
      const overdueA = a.kind === "open" && a.overdue ? 0 : 1;
      const overdueB = b.kind === "open" && b.overdue ? 0 : 1;
      if (overdueA !== overdueB) return overdueA - overdueB;
      const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (kind) return kind;
      if (b.amountCents !== a.amountCents) return b.amountCents - a.amountCents;
      return (a.sortAt || "").localeCompare(b.sortAt || "");
    })
    .map((row) => ({
      ...row,
      href: collectHref(row),
      action: collectAction(row),
      group: collectGroup(row),
    }));
}

export function collectTotals(rows: CollectInput[]): {
  amountCents: number;
  unbilled: number;
  unpaid: number;
  count: number;
} {
  let amountCents = 0;
  let unbilled = 0;
  let unpaid = 0;
  for (const row of rows) {
    amountCents += Math.max(0, row.amountCents);
    if (row.kind === "unbilled") unbilled += 1;
    if (row.kind === "open" || row.kind === "draft") unpaid += 1;
  }
  return { amountCents, unbilled, unpaid, count: rows.length };
}

export function describeCollect(totals: ReturnType<typeof collectTotals>): string {
  if (!totals.count) {
    return "Nothing sitting out. New work shows up here when a job is finished or an invoice is waiting.";
  }
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(totals.amountCents / 100);
  const jobs = `${totals.unbilled} ${totals.unbilled === 1 ? "job" : "jobs"} never billed`;
  const invoices = `${totals.unpaid} ${totals.unpaid === 1 ? "invoice" : "invoices"} unpaid`;
  return `You have ${money} sitting outside the bank. ${jobs}. ${invoices}.`;
}

export function jobIsUnbilled(
  job: { id: number; status: string },
  invoicedJobIds: Set<number>,
): boolean {
  return job.status === "completed" && !invoicedJobIds.has(job.id);
}
