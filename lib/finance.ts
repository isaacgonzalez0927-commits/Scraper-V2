import { and, eq, isNull, sql } from "drizzle-orm";
import { db, nowISO, token } from "./db";
import { formatMoney, lineAmountCents, taxCents } from "./money";
import {
  activities,
  invoiceEvents,
  invoiceLines,
  invoices,
  jobs,
  notifications,
  organizations,
  payments,
} from "./schema";

export async function amountPaidCents(invoiceId: number): Promise<number> {
  const rows = await db()
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)));
  return Number(rows[0]?.total || 0);
}

export function balanceCents(totalCents: number, paidCents: number, status: string): number {
  if (status === "void") return 0;
  return Math.max(0, totalCents - paidCents);
}

export function totalsFromLines(
  lines: { quantity: string | number; unitPriceCents: number }[],
  discountCents: number,
  taxBps: number,
) {
  const subtotal = lines.reduce(
    (sum, line) => sum + lineAmountCents(line.quantity, line.unitPriceCents),
    0,
  );
  const discount = Math.max(0, Math.min(discountCents, subtotal));
  const tax = taxCents(subtotal - discount, taxBps);
  return { subtotalCents: subtotal, discountCents: discount, taxCents: tax, totalCents: subtotal - discount + tax };
}

export function deriveStatus(input: {
  status: string;
  voidedAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  today?: string;
}): string {
  if (input.status === "void" || input.voidedAt) return "void";
  const remaining = Math.max(0, input.totalCents - input.paidCents);
  if (input.totalCents > 0 && remaining === 0) return "paid";
  if (input.status === "draft" && input.paidCents === 0) return "draft";
  const today = input.today || new Date().toISOString().slice(0, 10);
  const overdue = remaining > 0 && input.dueDate < today;
  if (input.paidCents > 0 && remaining > 0) return overdue ? "overdue" : "partial";
  if (overdue) return "overdue";
  if (input.viewedAt) return "viewed";
  if (input.sentAt) return "sent";
  return input.status || "draft";
}

export async function refreshInvoice(invoiceId: number, organizationId: number): Promise<void> {
  const [invoice] = await db().select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
  if (!invoice) return;
  const lines = await db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const calc = totalsFromLines(lines, invoice.discountCents, invoice.taxBps);
  const paid = await amountPaidCents(invoiceId);
  const previous = invoice.status;
  const status = deriveStatus({ ...invoice, ...calc, paidCents: paid });
  await db()
    .update(invoices)
    .set({ ...calc, status })
    .where(eq(invoices.id, invoiceId));
  if (previous !== "overdue" && status === "overdue") {
    await addEvent(organizationId, invoiceId, "overdue", `${invoice.number} became overdue`);
    await notify(organizationId, "invoice_overdue", `${invoice.number} is overdue`, "", `/invoices/${invoiceId}`);
    await logActivity(organizationId, "invoice_overdue", `${invoice.number} became overdue`, balanceCents(calc.totalCents, paid, status), `/invoices/${invoiceId}`);
  }
}

export async function addEvent(
  organizationId: number,
  invoiceId: number,
  kind: string,
  message: string,
  amountCents?: number | null,
) {
  await db().insert(invoiceEvents).values({
    organizationId,
    invoiceId,
    kind,
    message,
    amountCents: amountCents ?? null,
    createdAt: nowISO(),
  });
}

export async function notify(
  organizationId: number,
  kind: string,
  title: string,
  body: string,
  link: string,
) {
  await db().insert(notifications).values({
    organizationId,
    kind,
    title,
    body,
    link,
    createdAt: nowISO(),
  });
}

export async function logActivity(
  organizationId: number,
  kind: string,
  title: string,
  amountCents: number | null,
  link: string,
) {
  await db().insert(activities).values({
    organizationId,
    kind,
    title,
    amountCents,
    link,
    createdAt: nowISO(),
  });
}

export async function applyPayment(opts: {
  organizationId: number;
  customerId: number;
  invoiceId?: number | null;
  amountCents: number;
  paidOn: string;
  method: string;
  reference?: string;
  notes?: string;
}) {
  if (opts.amountCents <= 0) throw new Error("Payment amount must be greater than zero.");
  let customerId = opts.customerId;
  if (opts.invoiceId) {
    const [invoice] = await db()
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.organizationId, opts.organizationId)));
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "void") throw new Error("Cannot pay a void invoice.");
    await refreshInvoice(invoice.id, opts.organizationId);
    const [fresh] = await db().select().from(invoices).where(eq(invoices.id, invoice.id));
    const paid = await amountPaidCents(invoice.id);
    const remaining = balanceCents(fresh.totalCents, paid, fresh.status);
    if (opts.amountCents > remaining) {
      throw new Error(`Payment is larger than the remaining balance of ${formatMoney(remaining)}.`);
    }
    customerId = invoice.customerId;
  }
  const inserted = await db()
    .insert(payments)
    .values({
      organizationId: opts.organizationId,
      customerId,
      invoiceId: opts.invoiceId || null,
      amountCents: opts.amountCents,
      paidOn: opts.paidOn,
      method: opts.method,
      reference: opts.reference || "",
      notes: opts.notes || "",
      createdAt: nowISO(),
    })
    .returning({ id: payments.id });
  if (opts.invoiceId) {
    await addEvent(opts.organizationId, opts.invoiceId, "payment", `${formatMoney(opts.amountCents)} payment received`, opts.amountCents);
    await refreshInvoice(opts.invoiceId, opts.organizationId);
    const [invoice] = await db().select().from(invoices).where(eq(invoices.id, opts.invoiceId));
    if (invoice.status === "paid") {
      await addEvent(opts.organizationId, opts.invoiceId, "paid", `${invoice.number} paid in full`);
      if (invoice.jobId) {
        await db().update(jobs).set({ actualRevenueCents: invoice.totalCents }).where(eq(jobs.id, invoice.jobId));
      }
    }
  }
  await logActivity(
    opts.organizationId,
    "payment_received",
    `Payment received — ${formatMoney(opts.amountCents)}`,
    opts.amountCents,
    `/payments/${inserted[0].id}`,
  );
  await notify(
    opts.organizationId,
    "payment_received",
    `Payment received — ${formatMoney(opts.amountCents)}`,
    "",
    `/payments/${inserted[0].id}`,
  );
  return inserted[0].id;
}

export async function nextInvoiceNumber(organizationId: number): Promise<string> {
  const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
  const number = `${org.invoicePrefix}${org.nextInvoiceNumber}`;
  await db()
    .update(organizations)
    .set({ nextInvoiceNumber: org.nextInvoiceNumber + 1 })
    .where(eq(organizations.id, organizationId));
  return number;
}

export { token };
