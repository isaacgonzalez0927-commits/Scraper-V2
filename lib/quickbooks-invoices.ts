/**
 * One-way pull of QuickBooks Online invoices and payments into Sere.
 *
 * QBO is the shop's accountant copy. Sere does not push invoices back.
 * Tokens expire in about an hour, so Connect and Sync from QuickBooks
 * are the refresh path. Amounts arrive in dollars and are stored as cents.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db, nowISO, token } from "./db";
import { addEvent, refreshInvoice, recordExternalPayment } from "./finance";
import { quickbooksConfig } from "./integrations";
import {
  listQboInvoices,
  listQboPayments,
  qboDollarsToCents,
  qboLinkedInvoiceIds,
  retrieveQboCustomer,
  type QboInvoice,
  type QboInvoiceLine,
  type QboPayment,
} from "./quickbooks";
import { customers, invoiceLines, invoices, organizations, payments } from "./schema";
import { describeBookSync, type BookSyncResult } from "./stripe-invoices";

export { describeBookSync, qboDollarsToCents, qboLinkedInvoiceIds, type BookSyncResult };

export function qboInvoiceIsPaid(invoice: QboInvoice): boolean {
  const total = qboDollarsToCents(invoice.TotalAmt);
  const balance = qboDollarsToCents(invoice.Balance);
  return total > 0 && balance === 0;
}

function qboLineCents(line: QboInvoiceLine): { qty: string; unit: number; amount: number } {
  const amount = qboDollarsToCents(line.Amount);
  const qty = Number(line.SalesItemLineDetail?.Qty || 1) || 1;
  const unitFromQbo = line.SalesItemLineDetail?.UnitPrice;
  const unit = unitFromQbo != null ? qboDollarsToCents(unitFromQbo) : Math.round(amount / qty);
  return { qty: String(qty), unit, amount };
}

function isQboMoneyReference(reference: string): boolean {
  return (reference || "").startsWith("qbo-");
}

async function qboCollectedCents(invoiceId: number): Promise<number> {
  const rows = await db()
    .select({
      amountCents: payments.amountCents,
      reference: payments.reference,
    })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)));
  return rows
    .filter((row) => isQboMoneyReference(row.reference || ""))
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
  return `${prefix}QB-${short}`;
}

async function findOrCreateQboCustomer(opts: {
  organizationId: number;
  qboCustomerId?: string;
  name?: string;
  accessToken: string;
  realmId: string;
  sandbox?: boolean;
}): Promise<number | null> {
  const qboCustomerId = (opts.qboCustomerId || "").trim();
  if (qboCustomerId) {
    const [existing] = await db()
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(eq(customers.organizationId, opts.organizationId), eq(customers.qboCustomerId, qboCustomerId)),
      );
    if (existing) return existing.id;
  }

  let name = (opts.name || "").trim() || "QuickBooks customer";
  let email = "";
  let phone = "";
  let billingLine1 = "";
  let billingCity = "";
  let billingState = "";
  let billingPostal = "";
  let companyName = "";

  if (qboCustomerId) {
    const remote = await retrieveQboCustomer(
      opts.accessToken,
      opts.realmId,
      qboCustomerId,
      opts.sandbox,
    );
    name =
      remote?.DisplayName?.trim() ||
      [remote?.GivenName, remote?.FamilyName].filter(Boolean).join(" ").trim() ||
      remote?.CompanyName?.trim() ||
      name;
    email = remote?.PrimaryEmailAddr?.Address?.trim().toLowerCase() || "";
    phone = remote?.PrimaryPhone?.FreeFormNumber?.trim() || "";
    billingLine1 = remote?.BillAddr?.Line1?.trim() || "";
    billingCity = remote?.BillAddr?.City?.trim() || "";
    billingState = remote?.BillAddr?.CountrySubDivisionCode?.trim() || "";
    billingPostal = remote?.BillAddr?.PostalCode?.trim() || "";
    companyName = remote?.CompanyName?.trim() || "";
  }

  if (email) {
    const [existing] = await db()
      .select()
      .from(customers)
      .where(and(eq(customers.organizationId, opts.organizationId), eq(customers.email, email)));
    if (existing) {
      if (qboCustomerId && !existing.qboCustomerId) {
        await db().update(customers).set({ qboCustomerId }).where(eq(customers.id, existing.id));
      }
      return existing.id;
    }
  }

  if (name && name !== "QuickBooks customer") {
    const [existing] = await db()
      .select()
      .from(customers)
      .where(and(eq(customers.organizationId, opts.organizationId), eq(customers.name, name)));
    if (existing) {
      if (qboCustomerId && !existing.qboCustomerId) {
        await db().update(customers).set({ qboCustomerId }).where(eq(customers.id, existing.id));
      }
      return existing.id;
    }
  }

  if (!qboCustomerId && name === "QuickBooks customer") return null;

  const [created] = await db()
    .insert(customers)
    .values({
      organizationId: opts.organizationId,
      name,
      email,
      phone,
      companyName,
      billingLine1,
      billingCity,
      billingState,
      billingPostal,
      notes: "Imported from QuickBooks",
      qboCustomerId,
      customerSince: nowISO().slice(0, 10),
      createdAt: nowISO(),
    })
    .returning({ id: customers.id });
  return created.id;
}

function salesLines(invoice: QboInvoice): QboInvoiceLine[] {
  return (invoice.Line || []).filter((line) => {
    const type = line.DetailType || "";
    return type === "SalesItemLineDetail" || (!type && qboDollarsToCents(line.Amount) > 0);
  });
}

export async function ingestQboInvoice(
  organizationId: number,
  remote: QboInvoice,
  opts: { accessToken?: string; realmId?: string; sandbox?: boolean } = {},
): Promise<{ invoiceId: number; created: boolean } | null> {
  if (!remote.Id) return null;
  const totalCents = qboDollarsToCents(remote.TotalAmt);
  if (totalCents <= 0) return null;

  const [existing] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.qboInvoiceId, remote.Id)));

  const config = await quickbooksConfig(organizationId);
  const accessToken = opts.accessToken || config?.accessToken || "";
  const realmId = opts.realmId || config?.realmId || "";
  const sandbox = opts.sandbox ?? config?.sandbox;
  const customerId = await findOrCreateQboCustomer({
    organizationId,
    qboCustomerId: remote.CustomerRef?.value,
    name: remote.CustomerRef?.name,
    accessToken,
    realmId,
    sandbox,
  });
  if (!customerId && !existing) return null;

  const issueDate = remote.TxnDate || nowISO().slice(0, 10);
  const dueDate = remote.DueDate || issueDate;
  const notes = remote.PrivateNote?.trim() || remote.CustomerMemo?.value?.trim() || "";
  let invoice = existing;
  let created = false;

  if (!invoice) {
    const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
    const number = await uniqueImportedNumber(
      organizationId,
      org?.invoicePrefix || "INV-",
      remote.DocNumber || "",
      remote.Id,
    );
    const [row] = await db()
      .insert(invoices)
      .values({
        organizationId,
        customerId: customerId as number,
        number,
        status: "sent",
        issueDate,
        dueDate,
        notes,
        publicToken: token(),
        qboInvoiceId: remote.Id,
        sentAt: nowISO(),
        createdAt: nowISO(),
      })
      .returning();
    invoice = row;
    const lines = salesLines(remote);
    if (lines.length) {
      for (const [i, line] of lines.entries()) {
        const parsed = qboLineCents(line);
        await db().insert(invoiceLines).values({
          organizationId,
          invoiceId: invoice.id,
          position: i,
          description: line.Description?.trim() || `Line ${i + 1}`,
          quantity: parsed.qty,
          unitPriceCents: parsed.unit,
          amountCents: parsed.amount,
        });
      }
    } else {
      await db().insert(invoiceLines).values({
        organizationId,
        invoiceId: invoice.id,
        position: 0,
        description: remote.DocNumber ? `QuickBooks ${remote.DocNumber}` : "QuickBooks invoice",
        quantity: "1",
        unitPriceCents: totalCents,
        amountCents: totalCents,
      });
    }
    await addEvent(organizationId, invoice.id, "created", `${invoice.number} imported from QuickBooks`);
    created = true;
  } else {
    await db()
      .update(invoices)
      .set({
        qboInvoiceId: remote.Id,
        notes: notes || invoice.notes,
        dueDate: remote.DueDate || invoice.dueDate,
      })
      .where(eq(invoices.id, invoice.id));
  }

  await refreshInvoice(invoice.id, organizationId);

  const paidCents = Math.max(0, totalCents - qboDollarsToCents(remote.Balance));
  if (paidCents > 0) {
    const already = await qboCollectedCents(invoice.id);
    const delta = paidCents - already;
    if (delta > 0) {
      await recordExternalPayment({
        organizationId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        amountCents: delta,
        method: "other",
        reference: `qbo-invoice:${remote.Id}:paid:${paidCents}`,
        notes: "Paid in QuickBooks",
        paidOn: remote.TxnDate,
      });
    }
  }

  return { invoiceId: invoice.id, created };
}

export async function ingestQboPayment(
  organizationId: number,
  remote: QboPayment,
  opts: { accessToken?: string; realmId?: string; sandbox?: boolean } = {},
): Promise<{ payments: number }> {
  if (!remote.Id) return { payments: 0 };
  const totalCents = qboDollarsToCents(remote.TotalAmt);
  if (totalCents <= 0) return { payments: 0 };

  const config = await quickbooksConfig(organizationId);
  const accessToken = opts.accessToken || config?.accessToken || "";
  const realmId = opts.realmId || config?.realmId || "";
  const sandbox = opts.sandbox ?? config?.sandbox;
  const customerId = await findOrCreateQboCustomer({
    organizationId,
    qboCustomerId: remote.CustomerRef?.value,
    name: remote.CustomerRef?.name,
    accessToken,
    realmId,
    sandbox,
  });
  if (!customerId) return { payments: 0 };

  const linked = qboLinkedInvoiceIds(remote);
  let recorded = 0;
  if (linked.length) {
    for (const item of linked) {
      if (item.cents <= 0) continue;
      const [invoice] = await db()
        .select({ id: invoices.id, customerId: invoices.customerId })
        .from(invoices)
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.qboInvoiceId, item.id)));
      const result = await recordExternalPayment({
        organizationId,
        customerId: invoice?.customerId || customerId,
        invoiceId: invoice?.id || null,
        amountCents: item.cents,
        method: "other",
        reference: `qbo-payment:${remote.Id}:${item.id}`,
        notes: remote.PrivateNote?.trim() || "Paid in QuickBooks",
        paidOn: remote.TxnDate,
      });
      if (!result.alreadyRecorded && result.paymentId) recorded += 1;
    }
    return { payments: recorded };
  }

  const result = await recordExternalPayment({
    organizationId,
    customerId,
    amountCents: totalCents,
    method: "other",
    reference: `qbo-payment:${remote.Id}`,
    notes: remote.PrivateNote?.trim() || "Paid in QuickBooks",
    paidOn: remote.TxnDate,
  });
  return { payments: result.alreadyRecorded || !result.paymentId ? 0 : 1 };
}

export async function syncQuickbooksBook(
  organizationId: number,
  opts: { limit?: number } = {},
): Promise<BookSyncResult> {
  const config = await quickbooksConfig(organizationId);
  if (!config?.accessToken || !config.realmId) {
    return { ok: false, invoices: 0, payments: 0, error: "Connect QuickBooks first." };
  }
  const max = opts.limit && opts.limit > 0 ? opts.limit : 100;
  let invoicesIn = 0;
  let paymentsIn = 0;
  try {
    const qboInvoices = await listQboInvoices(config.accessToken, config.realmId, {
      sandbox: config.sandbox,
      limit: max,
    });
    for (const invoice of qboInvoices) {
      const saved = await ingestQboInvoice(organizationId, invoice, {
        accessToken: config.accessToken,
        realmId: config.realmId,
        sandbox: config.sandbox,
      });
      if (saved) invoicesIn += 1;
    }
    const qboPayments = await listQboPayments(config.accessToken, config.realmId, {
      sandbox: config.sandbox,
      limit: max,
    });
    for (const payment of qboPayments) {
      const ingested = await ingestQboPayment(organizationId, payment, {
        accessToken: config.accessToken,
        realmId: config.realmId,
        sandbox: config.sandbox,
      });
      paymentsIn += ingested.payments;
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
