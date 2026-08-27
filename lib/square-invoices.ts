/**
 * One-way pull of Square invoices and payments into the Sere book.
 *
 * Sere stays the shop book. Square Invoices that Sere did not create are
 * imported. Payments match a Sere invoice by the sere: note on a payment
 * link, then by square_invoice_id, then land as unmatched ledger rows on
 * the Square customer.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db, nowISO, token } from "./db";
import { addEvent, refreshInvoice, recordExternalPayment } from "./finance";
import { squareConfig } from "./integrations";
import {
  listSquareInvoices,
  listSquareLocations,
  listSquarePayments,
  retrieveSquareCustomer,
  retrieveSquareInvoice,
  retrieveSquarePayment,
  type SquareInvoice,
  type SquareListedPayment,
  type SquarePayment,
} from "./square";
import { customers, invoiceLines, invoices, organizations, payments } from "./schema";
import { describeBookSync, type BookSyncResult } from "./stripe-invoices";

export { describeBookSync, type BookSyncResult };

export function squareInvoiceStatus(status?: string | null): "draft" | "sent" | "void" {
  const value = (status || "").toUpperCase();
  if (value === "PAID" || value === "PARTIALLY_PAID") return "sent";
  if (value === "CANCELED" || value === "CANCELLED") return "void";
  if (value === "UNPAID" || value === "SCHEDULED" || value === "PUBLISHED") return "sent";
  if (value === "DRAFT") return "draft";
  return "draft";
}

export function parseSereSquareNote(note?: string | null): {
  organizationId: number;
  invoiceId: number;
  customerId: number;
} | null {
  const match = (note || "").trim().match(/^sere:(\d+):(\d+):(\d+)$/);
  if (!match) return null;
  const organizationId = Number(match[1]);
  const invoiceId = Number(match[2]);
  const customerId = Number(match[3]);
  if (!organizationId || !invoiceId) return null;
  return { organizationId, invoiceId, customerId };
}

function moneyCents(value?: { amount?: number } | null): number {
  return Math.max(0, Math.round(Number(value?.amount || 0)));
}

function recipientName(invoice: SquareInvoice): string {
  const given = invoice.primary_recipient?.given_name?.trim() || "";
  const family = invoice.primary_recipient?.family_name?.trim() || "";
  const name = [given, family].filter(Boolean).join(" ").trim();
  return name || "Square customer";
}

function dueDateOf(invoice: SquareInvoice, fallback: string): string {
  return invoice.payment_requests?.find((request) => request.due_date)?.due_date || fallback;
}

function issueDateOf(invoice: SquareInvoice): string {
  return invoice.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function isSquareMoneyReference(reference: string): boolean {
  return (reference || "").startsWith("sq:");
}

async function squareCollectedCents(invoiceId: number): Promise<number> {
  const rows = await db()
    .select({
      amountCents: payments.amountCents,
      reference: payments.reference,
    })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)));
  return rows
    .filter((row) => isSquareMoneyReference(row.reference || ""))
    .reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
}

async function uniqueImportedNumber(
  organizationId: number,
  prefix: string,
  preferred: string,
  fallbackId: string,
): Promise<string> {
  const trimmed = preferred.trim();
  if (trimmed) {
    const [hit] = await db()
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.number, trimmed)));
    if (!hit) return trimmed;
  }
  const short = fallbackId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || Date.now().toString(36);
  return `${prefix}SQ-${short}`;
}

async function findOrCreateSquareCustomer(opts: {
  organizationId: number;
  squareCustomerId?: string;
  name: string;
  email?: string;
  phone?: string;
  accessToken: string;
  sandbox?: boolean;
}): Promise<number | null> {
  const squareCustomerId = (opts.squareCustomerId || "").trim();
  const email = (opts.email || "").trim().toLowerCase();

  if (squareCustomerId) {
    const [existing] = await db()
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, opts.organizationId),
          eq(customers.squareCustomerId, squareCustomerId),
        ),
      );
    if (existing) return existing.id;
  }

  if (email) {
    const [existing] = await db()
      .select()
      .from(customers)
      .where(and(eq(customers.organizationId, opts.organizationId), eq(customers.email, email)));
    if (existing) {
      if (squareCustomerId && !existing.squareCustomerId) {
        await db()
          .update(customers)
          .set({ squareCustomerId })
          .where(eq(customers.id, existing.id));
      }
      return existing.id;
    }
  }

  let name = opts.name;
  let phone = opts.phone || "";
  let resolvedEmail = email;
  if (squareCustomerId) {
    const remote = await retrieveSquareCustomer(opts.accessToken, squareCustomerId, opts.sandbox);
    name =
      [remote?.given_name, remote?.family_name].filter(Boolean).join(" ").trim() ||
      remote?.company_name?.trim() ||
      name;
    phone = remote?.phone_number?.trim() || phone;
    resolvedEmail = remote?.email_address?.trim() || resolvedEmail;
  }

  if (!squareCustomerId && !resolvedEmail && name === "Square customer") return null;

  const [created] = await db()
    .insert(customers)
    .values({
      organizationId: opts.organizationId,
      name,
      email: resolvedEmail,
      phone,
      notes: "Imported from Square",
      squareCustomerId,
      customerSince: nowISO().slice(0, 10),
      createdAt: nowISO(),
    })
    .returning({ id: customers.id });
  return created.id;
}

export async function ingestSquareInvoice(
  organizationId: number,
  remote: SquareInvoice,
  opts: { accessToken?: string; sandbox?: boolean } = {},
): Promise<{ invoiceId: number; created: boolean } | null> {
  if (!remote.id) return null;
  const status = squareInvoiceStatus(remote.status);
  const totalCents = Math.max(
    moneyCents(remote.payment_requests?.[0]?.computed_amount_money),
    moneyCents(remote.payment_requests?.[0]?.total_completed_amount_money),
  );
  if (status === "draft" && totalCents <= 0) return null;

  const [existing] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.squareInvoiceId, remote.id)));

  const config = await squareConfig(organizationId);
  const accessToken = opts.accessToken || config?.accessToken || "";
  const sandbox = opts.sandbox ?? config?.sandbox;
  const customerId = await findOrCreateSquareCustomer({
    organizationId,
    squareCustomerId: remote.primary_recipient?.customer_id,
    name: recipientName(remote),
    email: remote.primary_recipient?.email_address,
    phone: remote.primary_recipient?.phone_number,
    accessToken,
    sandbox,
  });
  if (!customerId && !existing) return null;

  const issueDate = issueDateOf(remote);
  const dueDate = dueDateOf(remote, issueDate);
  const notes = remote.description?.trim() || "";
  let invoice = existing;
  let created = false;

  if (!invoice) {
    const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
    const number = await uniqueImportedNumber(
      organizationId,
      org?.invoicePrefix || "INV-",
      remote.invoice_number || "",
      remote.id,
    );
    const [row] = await db()
      .insert(invoices)
      .values({
        organizationId,
        customerId: customerId as number,
        number,
        status: status === "void" ? "void" : status === "draft" ? "draft" : "sent",
        issueDate,
        dueDate,
        notes,
        publicToken: token(),
        squareInvoiceId: remote.id,
        sentAt: status === "draft" || status === "void" ? null : nowISO(),
        voidedAt: status === "void" ? nowISO() : null,
        createdAt: nowISO(),
      })
      .returning();
    invoice = row;
    const lineTotal = totalCents || 0;
    await db().insert(invoiceLines).values({
      organizationId,
      invoiceId: invoice.id,
      position: 0,
      description: remote.title?.trim() || remote.invoice_number || "Square invoice",
      quantity: "1",
      unitPriceCents: lineTotal,
      amountCents: lineTotal,
    });
    await addEvent(organizationId, invoice.id, "created", `${invoice.number} imported from Square`);
    created = true;
  } else {
    await db()
      .update(invoices)
      .set({
        squareInvoiceId: remote.id,
        notes: notes || invoice.notes,
        dueDate: remote.payment_requests?.find((request) => request.due_date)?.due_date || invoice.dueDate,
        voidedAt: status === "void" ? invoice.voidedAt || nowISO() : invoice.voidedAt,
        status: status === "void" ? "void" : invoice.status,
      })
      .where(eq(invoices.id, invoice.id));
  }

  await refreshInvoice(invoice.id, organizationId);

  const paidCents = moneyCents(remote.payment_requests?.[0]?.total_completed_amount_money);
  if (paidCents > 0 && status !== "void") {
    const already = await squareCollectedCents(invoice.id);
    const delta = paidCents - already;
    if (delta > 0) {
      await recordExternalPayment({
        organizationId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        amountCents: delta,
        method: "card",
        reference: `sq:${remote.id}:paid:${paidCents}`,
        notes: "Paid in Square",
      });
    }
  }

  return { invoiceId: invoice.id, created };
}

function paymentAmountCents(payment: SquarePayment | SquareListedPayment): number {
  if ("refunded_money" in payment) {
    const amount = Number(payment.amount_money?.amount || 0);
    const refunded = Number(payment.refunded_money?.amount || 0);
    return Math.max(0, amount - refunded);
  }
  return moneyCents(payment.amount_money);
}

export async function ingestSquarePayment(
  organizationId: number,
  payment: SquarePayment | SquareListedPayment,
  opts: { accessToken?: string; sandbox?: boolean } = {},
): Promise<{ invoiceId: number | null; paymentId: number | null; alreadyRecorded: boolean } | null> {
  const id = payment.id || "";
  if (!id || (payment.status || "").toUpperCase() !== "COMPLETED") return null;
  const amountCents = paymentAmountCents(payment);
  if (amountCents <= 0) return null;

  const tagged = parseSereSquareNote(payment.note);
  if (tagged && tagged.organizationId !== organizationId) return null;

  let invoiceId = tagged?.invoiceId || 0;
  if (!invoiceId && payment.invoice_id) {
    const [linked] = await db()
      .select({ id: invoices.id, customerId: invoices.customerId })
      .from(invoices)
      .where(
        and(eq(invoices.organizationId, organizationId), eq(invoices.squareInvoiceId, payment.invoice_id)),
      );
    invoiceId = linked?.id || 0;
  }

  const config = await squareConfig(organizationId);
  const accessToken = opts.accessToken || config?.accessToken || "";
  const sandbox = opts.sandbox ?? config?.sandbox;
  let customerId = tagged?.customerId || 0;
  if (!customerId) {
    customerId =
      (await findOrCreateSquareCustomer({
        organizationId,
        squareCustomerId: payment.customer_id,
        name: "Square customer",
        accessToken,
        sandbox,
      })) || 0;
  }
  if (!customerId && invoiceId) {
    const [invoice] = await db()
      .select({ customerId: invoices.customerId })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
    customerId = invoice?.customerId || 0;
  }
  if (!customerId) return null;

  const result = await recordExternalPayment({
    organizationId,
    customerId,
    invoiceId: invoiceId || null,
    amountCents,
    method: "card",
    reference: `sq:${id}`,
    notes: "Paid in Square",
    paidOn: payment.created_at?.slice(0, 10),
  });
  return {
    invoiceId: invoiceId || null,
    paymentId: result.paymentId,
    alreadyRecorded: result.alreadyRecorded,
  };
}

export async function ingestSquarePaymentId(
  organizationId: number,
  paymentId: string,
): Promise<{ invoiceId: number | null; paymentId: number | null; alreadyRecorded: boolean } | null> {
  const config = await squareConfig(organizationId);
  if (!config?.accessToken) return null;
  const payment = await retrieveSquarePayment(config.accessToken, paymentId, config.sandbox);
  if (!payment.id) return null;
  return ingestSquarePayment(organizationId, payment, {
    accessToken: config.accessToken,
    sandbox: config.sandbox,
  });
}

export async function ingestSquareInvoiceId(
  organizationId: number,
  invoiceId: string,
): Promise<{ invoiceId: number; created: boolean } | null> {
  const config = await squareConfig(organizationId);
  if (!config?.accessToken) return null;
  const remote = await retrieveSquareInvoice(config.accessToken, invoiceId, config.sandbox);
  if (!remote?.id) return null;
  return ingestSquareInvoice(organizationId, remote, {
    accessToken: config.accessToken,
    sandbox: config.sandbox,
  });
}

export async function syncSquareBook(
  organizationId: number,
  opts: { limit?: number } = {},
): Promise<BookSyncResult> {
  const config = await squareConfig(organizationId);
  if (!config?.accessToken) {
    return { ok: false, invoices: 0, payments: 0, error: "Connect Square first." };
  }
  const max = opts.limit && opts.limit > 0 ? opts.limit : 100;
  let locationId = config.locationId;
  if (!locationId) {
    const locations = await listSquareLocations(config.accessToken, config.sandbox);
    locationId = locations[0]?.id || "";
  }
  let invoicesIn = 0;
  let paymentsIn = 0;
  try {
    if (locationId) {
      const squareInvoices = await listSquareInvoices(config.accessToken, {
        locationId,
        sandbox: config.sandbox,
        limit: max,
      });
      for (const invoice of squareInvoices) {
        const saved = await ingestSquareInvoice(organizationId, invoice, {
          accessToken: config.accessToken,
          sandbox: config.sandbox,
        });
        if (saved) invoicesIn += 1;
      }
    }
    const listed = await listSquarePayments(config.accessToken, {
      locationId: locationId || undefined,
      sandbox: config.sandbox,
      limit: max,
    });
    for (const payment of listed) {
      const ingested = await ingestSquarePayment(organizationId, payment, {
        accessToken: config.accessToken,
        sandbox: config.sandbox,
      });
      if (ingested && !ingested.alreadyRecorded && ingested.paymentId) paymentsIn += 1;
    }
    return { ok: true, invoices: invoicesIn, payments: paymentsIn };
  } catch (error) {
    return {
      ok: false,
      invoices: invoicesIn,
      payments: paymentsIn,
      error: (error as Error).message,
    };
  }
}

export function squareInvoiceEventNames(): string[] {
  return [
    "invoice.published",
    "invoice.updated",
    "invoice.payment_made",
    "invoice.canceled",
    "invoice.scheduled_charge_collected",
  ];
}

export function squarePaymentEventNames(): string[] {
  return ["payment.created", "payment.updated"];
}
