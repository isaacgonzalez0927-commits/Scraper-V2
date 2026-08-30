import { displayName } from "./display";
import { prettyDate, prettyWhen } from "./labels";
import { formatMoney } from "./money";

export type TimelineKind = "job" | "estimate" | "invoice" | "payment" | "note";

export type TimelineItem = {
  kind: TimelineKind;
  at: string;
  href: string;
  title: string;
  meta: string;
  amountCents?: number;
  status?: string;
};

export function buildCustomerTimeline(input: {
  jobs: Array<{
    id: number;
    title: string;
    status: string;
    scheduledStart: string | null;
    completedAt: string | null;
    createdAt: string;
    actualRevenueCents: number;
    estimatedRevenueCents: number;
  }>;
  estimates: Array<{
    id: number;
    number: string;
    status: string;
    totalCents: number;
    createdAt: string;
    sentAt: string | null;
    approvedAt: string | null;
  }>;
  invoices: Array<{
    id: number;
    number: string;
    status: string;
    totalCents: number;
    createdAt: string;
    sentAt: string | null;
    issueDate: string;
  }>;
  payments: Array<{
    id: number;
    amountCents: number;
    paidOn: string;
    method: string;
    voidedAt: string | null;
    createdAt: string;
  }>;
  notes: Array<{ id: number; body: string; createdAt: string }>;
}): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const job of input.jobs) {
    items.push({
      kind: "job",
      at: job.completedAt || job.scheduledStart || job.createdAt,
      href: `/jobs/${job.id}`,
      title: job.title,
      meta: job.status,
      amountCents: job.actualRevenueCents || job.estimatedRevenueCents,
      status: job.status,
    });
  }
  for (const estimate of input.estimates) {
    items.push({
      kind: "estimate",
      at: estimate.approvedAt || estimate.sentAt || estimate.createdAt,
      href: `/estimates/${estimate.id}`,
      title: estimate.number,
      meta: estimate.status,
      amountCents: estimate.totalCents,
      status: estimate.status,
    });
  }
  for (const invoice of input.invoices) {
    items.push({
      kind: "invoice",
      at: invoice.sentAt || invoice.createdAt,
      href: `/invoices/${invoice.id}`,
      title: invoice.number,
      meta: invoice.status,
      amountCents: invoice.totalCents,
      status: invoice.status,
    });
  }
  for (const payment of input.payments) {
    items.push({
      kind: "payment",
      at: payment.paidOn || payment.createdAt,
      href: `/payments/${payment.id}`,
      title: payment.voidedAt ? "Payment voided" : "Payment received",
      meta: payment.method,
      amountCents: payment.amountCents,
      status: payment.voidedAt ? "void" : "paid",
    });
  }
  for (const note of input.notes) {
    items.push({
      kind: "note",
      at: note.createdAt,
      href: "",
      title: note.body,
      meta: "Note",
    });
  }
  return items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

export function timelineMeta(item: TimelineItem): string {
  const when = prettyWhen(item.at) || prettyDate(item.at.slice(0, 10));
  const bits = [item.kind, item.meta, when].filter(Boolean);
  return bits.join(" · ");
}

export function lastJobSummary(
  jobs: Array<{
    title: string;
    scheduledStart: string | null;
    completedAt: string | null;
    createdAt: string;
    status: string;
  }>,
): { title: string; at: string } | null {
  if (!jobs.length) return null;
  const sorted = [...jobs].sort((a, b) => {
    const atA = a.completedAt || a.scheduledStart || a.createdAt;
    const atB = b.completedAt || b.scheduledStart || b.createdAt;
    return (atB || "").localeCompare(atA || "");
  });
  const job = sorted[0];
  return { title: job.title, at: job.completedAt || job.scheduledStart || job.createdAt };
}

export { displayName, formatMoney };
