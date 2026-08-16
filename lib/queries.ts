import { and, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import { db } from "./db";
import { displayName } from "./display";
import { amountPaidCents, balanceCents } from "./finance";
import {
  customers,
  invoiceLines,
  invoices,
  jobCosts,
  jobs,
  notifications,
  payments,
} from "./schema";

export const OPEN_STATUSES = ["sent", "viewed", "partial", "overdue"] as const;
export const COLLECTIBLE_STATUSES = ["sent", "viewed", "partial", "paid", "overdue"] as const;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthBounds(d = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: isoDate(start), end: isoDate(end) };
}

export function weekBounds(d = new Date()): { start: string; end: string } {
  const mondayOffset = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

export function lastMonthBounds(d = new Date()): { start: string; end: string } {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const prev = new Date(first);
  prev.setDate(0);
  return monthBounds(prev);
}

export function periodBounds(key: string, start?: string, end?: string) {
  if (key === "custom" && start && end) return { start, end };
  if (key === "this_week") return weekBounds();
  if (key === "last_month") return lastMonthBounds();
  return monthBounds();
}

export function jobRevenueCents(job: { actualRevenueCents: number; estimatedRevenueCents: number }) {
  return job.actualRevenueCents || job.estimatedRevenueCents;
}

export async function paidMap(organizationId: number, invoiceIds: number[]) {
  const map = new Map<number, number>();
  if (!invoiceIds.length) return map;
  const rows = await db()
    .select({
      invoiceId: payments.invoiceId,
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        isNull(payments.voidedAt),
        inArray(payments.invoiceId, invoiceIds),
      ),
    )
    .groupBy(payments.invoiceId);
  for (const row of rows) {
    if (row.invoiceId) map.set(row.invoiceId, Number(row.total || 0));
  }
  return map;
}

export async function collectedCents(organizationId: number, start?: string, end?: string) {
  const filters = [eq(payments.organizationId, organizationId), isNull(payments.voidedAt)];
  if (start) filters.push(gte(payments.paidOn, start));
  if (end) filters.push(lte(payments.paidOn, end));
  const rows = await db()
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(and(...filters));
  return Number(rows[0]?.total || 0);
}

export async function invoicedRevenueCents(organizationId: number, start?: string, end?: string) {
  const filters = [
    eq(invoices.organizationId, organizationId),
    inArray(invoices.status, [...COLLECTIBLE_STATUSES]),
  ];
  if (start) filters.push(gte(invoices.issueDate, start));
  if (end) filters.push(lte(invoices.issueDate, end));
  const rows = await db()
    .select({ total: sql<number>`coalesce(sum(${invoices.totalCents}), 0)` })
    .from(invoices)
    .where(and(...filters));
  return Number(rows[0]?.total || 0);
}

export async function outstandingTotals(organizationId: number) {
  const open = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.status, [...OPEN_STATUSES])));
  const paid = await paidMap(organizationId, open.map((i) => i.id));
  const today = isoDate(new Date());
  let outstanding = 0;
  let overdue = 0;
  for (const invoice of open) {
    const remaining = balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status);
    outstanding += remaining;
    if (invoice.dueDate < today) overdue += remaining;
  }
  return { outstanding, overdue };
}

export async function expectedCash(organizationId: number) {
  const open = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.status, [...OPEN_STATUSES])));
  const paid = await paidMap(organizationId, open.map((i) => i.id));
  const buckets = new Map<string, number>();
  for (const invoice of open) {
    const remaining = balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status);
    if (remaining <= 0) continue;
    buckets.set(invoice.dueDate, (buckets.get(invoice.dueDate) || 0) + remaining);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountCents]) => ({ date, amountCents }));
}

export async function customerLifetimeCents(organizationId: number, customerId: number) {
  const rows = await db()
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.customerId, customerId),
        isNull(payments.voidedAt),
      ),
    );
  return Number(rows[0]?.total || 0);
}

export async function customerBalanceCents(organizationId: number, customerId: number) {
  const open = await db()
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.customerId, customerId),
        inArray(invoices.status, [...OPEN_STATUSES]),
      ),
    );
  const paid = await paidMap(organizationId, open.map((i) => i.id));
  return open.reduce(
    (sum, invoice) => sum + balanceCents(invoice.totalCents, paid.get(invoice.id) || 0, invoice.status),
    0,
  );
}

export async function jobCostTotal(organizationId: number, jobId: number, fallback = 0) {
  const rows = await db()
    .select({ total: sql<number>`coalesce(sum(${jobCosts.amountCents}), 0)` })
    .from(jobCosts)
    .where(and(eq(jobCosts.organizationId, organizationId), eq(jobCosts.jobId, jobId)));
  const total = Number(rows[0]?.total || 0);
  return total || fallback;
}

export async function unreadCount(organizationId: number) {
  const rows = await db()
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.organizationId, organizationId), isNull(notifications.readAt)));
  return Number(rows[0]?.n || 0);
}

export async function invoiceWithRelations(organizationId: number, invoiceId: number) {
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
  if (!invoice) return null;
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  const lines = await db()
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoice.id));
  const paid = await amountPaidCents(invoice.id);
  return { invoice, customer, lines, paid, balance: balanceCents(invoice.totalCents, paid, invoice.status) };
}

export async function searchOrg(organizationId: number, q: string) {
  const term = `%${q.replace(/[%_]/g, "")}%`;
  const customerRows = await db()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, organizationId),
        or(
          like(customers.name, term),
          like(customers.companyName, term),
          like(customers.email, term),
          like(customers.phone, term),
          like(customers.serviceCity, term),
          like(customers.billingLine1, term),
          like(customers.serviceLine1, term),
        ),
      ),
    )
    .limit(8);
  const jobRows = await db()
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.organizationId, organizationId), or(like(jobs.title, term), like(jobs.description, term))))
    .limit(8);
  const invoiceRows = await db()
    .select({ invoice: invoices, customer: customers })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.organizationId, organizationId), or(like(invoices.number, term), like(customers.name, term))))
    .limit(8);
  return {
    customers: customerRows.map((c) => ({
      href: `/customers/${c.id}`,
      label: displayName(c),
      meta: [c.phone, c.email].filter(Boolean).join(" · "),
    })),
    jobs: jobRows.map(({ job, customer }) => ({
      href: `/jobs/${job.id}`,
      label: job.title,
      meta: displayName(customer),
    })),
    invoices: invoiceRows.map(({ invoice, customer }) => ({
      href: `/invoices/${invoice.id}`,
      label: invoice.number,
      meta: displayName(customer),
    })),
  };
}

