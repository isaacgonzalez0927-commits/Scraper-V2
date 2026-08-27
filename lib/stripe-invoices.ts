/**
 * Two-way invoice sync with Stripe.
 *
 * Sere stays the shop book. When Stripe is connected with a restricted key that
 * can write Customers and Invoices:
 *
 *   Sere → Stripe  creating or sending a Sere invoice creates/updates a Stripe
 *                  Invoice for the same customer and line items. Send also
 *                  finalizes and calls Stripe Send Invoice.
 *   Stripe → Sere  a webhook for invoice.created / paid / voided, plus
 *                  payment_intent.succeeded and checkout.session.completed,
 *                  imports or updates the matching Sere invoice and records
 *                  the payment, without duplicating.
 *
 * Linked IDs (stripe_customer_id, stripe_invoice_id) are the only matching key.
 * Events that originated in Sere carry metadata.sere_invoice_id so they bounce
 * back as updates, not second copies.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db, nowISO, token } from "./db";
import { addEvent, refreshInvoice, recordOnlinePayment } from "./finance";
import { stripeConfig } from "./integrations";
import { ensureStripeCustomer, findOrCreateSereCustomer } from "./stripe-customers";
import {
  addStripeInvoiceItem,
  createStripeInvoice,
  finalizeStripeInvoice,
  payStripeInvoiceOutOfBand,
  retrieveStripeInvoice,
  sendStripeInvoice,
  voidStripeInvoice,
  type StripeInvoice,
  type StripeInvoiceLine,
  type StripePaymentIntent,
} from "./stripe";
import { invoiceLines, invoices, organizations, payments } from "./schema";

export type StripeSyncResult = {
  ok: boolean;
  skipped?: string;
  stripeInvoiceId?: string;
  hostedUrl?: string;
  sent?: boolean;
  error?: string;
};

/** Checkout, PaymentIntent, Charge, and Invoice ids Stripe puts on money events. */
export function isStripeMoneyReference(reference: string): boolean {
  const ref = (reference || "").trim();
  if (!ref) return false;
  return /^(in_|pi_|cs_|ch_|py_|seti_)/.test(ref) || ref.startsWith("stripe-");
}

export function stripeInvoiceIdOf(
  object: { invoice?: string | { id?: string } | null } | null | undefined,
): string {
  const invoice = object?.invoice;
  if (!invoice) return "";
  return typeof invoice === "string" ? invoice : invoice.id || "";
}

function stripeOpts(config: { stripeAccount?: string }) {
  return { stripeAccount: config.stripeAccount };
}

function isoFromUnix(seconds?: number | null): string {
  if (!seconds) return new Date().toISOString().slice(0, 10);
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function lineUnitCents(line: StripeInvoiceLine): number {
  const unit = line.unit_amount ?? line.price?.unit_amount ?? null;
  if (unit != null) return Number(unit);
  const qty = Math.max(1, Number(line.quantity || 1));
  return Math.round(Number(line.amount || 0) / qty);
}

function customerIdOf(invoice: StripeInvoice): string {
  if (!invoice.customer) return "";
  return typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
}

async function advanceStripeInvoice(
  secretKey: string,
  stripeInvoiceId: string,
  remote: StripeInvoice,
  opts: { finalize?: boolean; send?: boolean; stripeAccount?: string },
): Promise<{ remote: StripeInvoice; sent: boolean }> {
  let next = remote;
  let sent = false;
  const callOpts = { stripeAccount: opts.stripeAccount };
  if ((opts.finalize || opts.send) && next.status === "draft") {
    next = await finalizeStripeInvoice(secretKey, stripeInvoiceId, callOpts);
  }
  if (opts.send && next.status === "open") {
    try {
      next = await sendStripeInvoice(secretKey, stripeInvoiceId, callOpts);
      sent = true;
    } catch {
      // Finalize still counts. Sere can email the public pay link instead.
    }
  }
  return { remote: next, sent };
}

/**
 * Push a Sere invoice to Stripe. Drafts stay drafts. Sending finalizes the
 * Stripe invoice and calls Send Invoice so Stripe emails the customer.
 */
export async function pushInvoiceToStripe(
  organizationId: number,
  invoiceId: number,
  opts: { finalize?: boolean; send?: boolean } = {},
): Promise<StripeSyncResult> {
  const config = await stripeConfig(organizationId);
  if (!config?.secretKey) return { ok: false, skipped: "Stripe is not connected." };

  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
  if (!invoice) return { ok: false, skipped: "Invoice not found." };
  if (invoice.status === "void") {
    if (invoice.stripeInvoiceId) {
      try {
        await voidStripeInvoice(config.secretKey, invoice.stripeInvoiceId, stripeOpts(config));
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }
    return { ok: true, stripeInvoiceId: invoice.stripeInvoiceId || undefined };
  }

  const lines = await db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
  if (!lines.length) return { ok: false, skipped: "Invoice has no line items." };

  try {
    const stripeCustomerId = await ensureStripeCustomer(
      organizationId,
      invoice.customerId,
      config.secretKey,
      config.stripeAccount,
    );
    const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
    const daysUntilDue = Math.max(1, org?.paymentTermsDays || 14);
    let stripeInvoiceId = invoice.stripeInvoiceId;
    let remote: StripeInvoice | null = null;

    if (stripeInvoiceId) {
      try {
        remote = await retrieveStripeInvoice(config.secretKey, stripeInvoiceId, stripeOpts(config));
      } catch {
        stripeInvoiceId = "";
        remote = null;
      }
    }

    if (remote) {
      const shouldAdvance =
        opts.send ||
        opts.finalize ||
        invoice.status === "sent" ||
        invoice.status === "viewed" ||
        invoice.status === "overdue";
      if (shouldAdvance) {
        const advanced = await advanceStripeInvoice(
          config.secretKey,
          stripeInvoiceId,
          remote,
          {
            finalize: opts.finalize || shouldAdvance,
            send: opts.send,
            stripeAccount: config.stripeAccount,
          },
        );
        remote = advanced.remote;
        await db()
          .update(invoices)
          .set({ stripeHostedUrl: remote.hosted_invoice_url || invoice.stripeHostedUrl })
          .where(eq(invoices.id, invoice.id));
        if (invoice.status === "paid" && remote.status !== "paid" && remote.status !== "void") {
          const paid = await payStripeInvoiceOutOfBand(
            config.secretKey,
            stripeInvoiceId,
            stripeOpts(config),
          );
          await db()
            .update(invoices)
            .set({ stripeHostedUrl: paid.hosted_invoice_url || invoice.stripeHostedUrl })
            .where(eq(invoices.id, invoice.id));
          return { ok: true, stripeInvoiceId, hostedUrl: paid.hosted_invoice_url || undefined };
        }
        return {
          ok: true,
          stripeInvoiceId,
          sent: advanced.sent,
          hostedUrl: remote.hosted_invoice_url || invoice.stripeHostedUrl || undefined,
        };
      }
      if (invoice.status === "paid" && remote.status !== "paid" && remote.status !== "void") {
        const paid = await payStripeInvoiceOutOfBand(
          config.secretKey,
          stripeInvoiceId,
          stripeOpts(config),
        );
        await db()
          .update(invoices)
          .set({ stripeHostedUrl: paid.hosted_invoice_url || invoice.stripeHostedUrl })
          .where(eq(invoices.id, invoice.id));
        return { ok: true, stripeInvoiceId, hostedUrl: paid.hosted_invoice_url || undefined };
      }
      return {
        ok: true,
        stripeInvoiceId,
        hostedUrl: remote.hosted_invoice_url || invoice.stripeHostedUrl || undefined,
      };
    }

    if (!stripeInvoiceId) {
      const created = await createStripeInvoice(config.secretKey, {
        customer: stripeCustomerId,
        description: `Sere ${invoice.number}`,
        collectionMethod: "send_invoice",
        daysUntilDue,
        metadata: {
          sere_organization_id: organizationId,
          sere_invoice_id: invoice.id,
          sere_customer_id: invoice.customerId,
          sere_invoice_number: invoice.number,
        },
        stripeAccount: config.stripeAccount,
        idempotencyKey: `sere-inv-${organizationId}-${invoice.id}`,
      });
      stripeInvoiceId = created.id;
      remote = created;
    }

    for (const line of lines) {
      const qty = Math.max(1, Number(line.quantity || 1));
      await addStripeInvoiceItem(config.secretKey, {
        customer: stripeCustomerId,
        invoice: stripeInvoiceId,
        description: line.description,
        amountCents: line.unitPriceCents,
        quantity: qty,
        stripeAccount: config.stripeAccount,
      });
    }

    if (!remote || !stripeInvoiceId) {
      return { ok: false, error: "Stripe invoice was not created." };
    }

    const shouldAdvance =
      Boolean(opts.send) ||
      Boolean(opts.finalize) ||
      invoice.status === "sent" ||
      invoice.status === "viewed" ||
      invoice.status === "overdue";
    const advanced = await advanceStripeInvoice(
      config.secretKey,
      stripeInvoiceId,
      remote,
      {
        finalize: shouldAdvance,
        send: opts.send,
        stripeAccount: config.stripeAccount,
      },
    );
    remote = advanced.remote;

    await db()
      .update(invoices)
      .set({
        stripeInvoiceId,
        stripeHostedUrl: remote.hosted_invoice_url || "",
      })
      .where(eq(invoices.id, invoice.id));

    return {
      ok: true,
      stripeInvoiceId,
      sent: advanced.sent,
      hostedUrl: remote.hosted_invoice_url || undefined,
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function markStripePaidIfLinked(organizationId: number, invoiceId: number): Promise<void> {
  const config = await stripeConfig(organizationId);
  if (!config?.secretKey) return;
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
  if (!invoice?.stripeInvoiceId || invoice.status !== "paid") return;
  try {
    const remote = await retrieveStripeInvoice(
      config.secretKey,
      invoice.stripeInvoiceId,
      stripeOpts(config),
    );
    if (remote.status === "paid" || remote.status === "void") return;
    await payStripeInvoiceOutOfBand(config.secretKey, invoice.stripeInvoiceId, stripeOpts(config));
  } catch {
    // Best-effort. Cash was already recorded in Sere.
  }
}

export async function voidStripeIfLinked(organizationId: number, invoiceId: number): Promise<void> {
  const config = await stripeConfig(organizationId);
  if (!config?.secretKey) return;
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
  if (!invoice?.stripeInvoiceId) return;
  try {
    await voidStripeInvoice(config.secretKey, invoice.stripeInvoiceId, stripeOpts(config));
  } catch {
    // Already voided in Stripe, or the key cannot write invoices.
  }
}

function nextSereNumber(prefix: string, stripeNumber?: string | null, fallbackId?: string): string {
  if (stripeNumber && stripeNumber.trim()) return stripeNumber.trim();
  const short = (fallbackId || "").replace(/^in_/, "").slice(0, 8);
  return `${prefix}ST-${short || Date.now().toString(36)}`;
}

async function stripeCollectedCents(invoiceId: number): Promise<number> {
  const rows = await db()
    .select({
      amountCents: payments.amountCents,
      reference: payments.reference,
    })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)));
  return rows
    .filter((row) => isStripeMoneyReference(row.reference || ""))
    .reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
}

/**
 * Record money Stripe already collected against a Sere invoice, without
 * double-counting checkout, PaymentIntent, and invoice.paid for the same cash.
 */
export async function recordStripeCollectedPayment(opts: {
  organizationId: number;
  customerId: number;
  invoiceId: number;
  amountCents: number;
  reference: string;
  notes?: string;
}): Promise<{ paymentId: number | null; alreadyRecorded: boolean }> {
  const amountCents = Math.max(0, Math.round(Number(opts.amountCents || 0)));
  if (amountCents <= 0) return { paymentId: null, alreadyRecorded: true };
  const already = await stripeCollectedCents(opts.invoiceId);
  const delta = amountCents - already;
  if (delta <= 0) return { paymentId: null, alreadyRecorded: true };
  return recordOnlinePayment({
    organizationId: opts.organizationId,
    customerId: opts.customerId,
    invoiceId: opts.invoiceId,
    amountCents: delta,
    reference: opts.reference,
    method: "card",
    notes: opts.notes || "Paid in Stripe",
  });
}

/**
 * Import or update a Stripe Invoice into Sere. Used by the webhook.
 * Returns the Sere invoice id when something changed.
 */
export async function ingestStripeInvoice(
  organizationId: number,
  remote: StripeInvoice,
): Promise<{ invoiceId: number; created: boolean } | null> {
  if (!remote.id) return null;
  const metadataOrg = Number(remote.metadata?.sere_organization_id || 0);
  if (metadataOrg && metadataOrg !== organizationId) return null;

  const existingId = Number(remote.metadata?.sere_invoice_id || 0);
  let [invoice] = existingId
    ? await db()
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, existingId), eq(invoices.organizationId, organizationId)))
    : [];
  if (!invoice) {
    [invoice] = await db()
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.organizationId, organizationId), eq(invoices.stripeInvoiceId, remote.id)),
      );
  }

  const config = await stripeConfig(organizationId);
  const stripeCustomerId = customerIdOf(remote);
  if (!stripeCustomerId) return invoice ? { invoiceId: invoice.id, created: false } : null;

  const { id: customerId } = await findOrCreateSereCustomer({
    organizationId,
    stripeCustomerId,
    secretKey: config?.secretKey || "",
    stripeAccount: config?.stripeAccount,
    fallbackName: typeof remote.customer === "object" ? remote.customer?.name || "" : "",
    fallbackEmail: typeof remote.customer === "object" ? remote.customer?.email || "" : "",
  });

  const lines = (remote.lines?.data || []).filter((line) => Number(line.amount || 0) !== 0);
  const issueDate = isoFromUnix(remote.created);
  const dueDate = isoFromUnix(remote.due_date) || issueDate;
  const notes = remote.description || "";
  let created = false;

  if (!invoice) {
    const [org] = await db().select().from(organizations).where(eq(organizations.id, organizationId));
    const number = nextSereNumber(org?.invoicePrefix || "INV-", remote.number, remote.id);
    const [row] = await db()
      .insert(invoices)
      .values({
        organizationId,
        customerId,
        number,
        status: remote.status === "draft" ? "draft" : "sent",
        issueDate,
        dueDate,
        notes,
        publicToken: token(),
        stripeInvoiceId: remote.id,
        stripeHostedUrl: remote.hosted_invoice_url || "",
        createdAt: nowISO(),
      })
      .returning();
    invoice = row;
    for (const [i, line] of lines.entries()) {
      const quantity = String(Math.max(1, Number(line.quantity || 1)));
      const unitPriceCents = lineUnitCents(line);
      await db().insert(invoiceLines).values({
        organizationId,
        invoiceId: invoice.id,
        position: i,
        description: line.description || "Line item",
        quantity,
        unitPriceCents,
        amountCents: Number(line.amount || 0),
      });
    }
    await addEvent(organizationId, invoice.id, "created", `${invoice.number} imported from Stripe`);
    created = true;
  } else {
    await db()
      .update(invoices)
      .set({
        customerId,
        stripeInvoiceId: remote.id,
        stripeHostedUrl: remote.hosted_invoice_url || invoice.stripeHostedUrl,
        notes: notes || invoice.notes,
        dueDate: remote.due_date ? dueDate : invoice.dueDate,
      })
      .where(eq(invoices.id, invoice.id));
    // Don't rewrite lines on a Sere-originated invoice — Sere is the book.
  }

  await refreshInvoice(invoice.id, organizationId);

  if (remote.status === "void" && invoice.status !== "void") {
    await db()
      .update(invoices)
      .set({ status: "void", voidedAt: invoice.voidedAt || nowISO() })
      .where(eq(invoices.id, invoice.id));
    await addEvent(organizationId, invoice.id, "voided", `${invoice.number} voided in Stripe`);
  }

  const paidCents = Number(remote.amount_paid || 0);
  if (paidCents > 0 && (remote.status === "paid" || remote.status === "open")) {
    await recordStripeCollectedPayment({
      organizationId,
      customerId,
      invoiceId: invoice.id,
      amountCents: paidCents,
      reference: `stripe-${remote.id}:paid:${paidCents}`,
      notes: "Paid in Stripe",
    });
  }

  return { invoiceId: invoice.id, created };
}

export function stripeInvoiceEventNames(): string[] {
  return [
    "invoice.created",
    "invoice.finalized",
    "invoice.sent",
    "invoice.updated",
    "invoice.paid",
    "invoice.payment_succeeded",
    "invoice.voided",
    "invoice.marked_uncollectible",
  ];
}

export function stripePaymentEventNames(): string[] {
  return ["payment_intent.succeeded", "charge.succeeded"];
}

export async function ingestStripePaymentIntent(
  organizationId: number,
  remote: StripePaymentIntent,
): Promise<{ invoiceId: number; alreadyRecorded: boolean } | null> {
  if (!remote.id || remote.status !== "succeeded") return null;
  const amountCents = Number(remote.amount_received || remote.amount || 0);
  if (amountCents <= 0) return null;

  const sereInvoiceId = Number(
    remote.metadata?.sere_invoice_id || remote.metadata?.invoice_id || 0,
  );
  const stripeInvoice = stripeInvoiceIdOf(remote);
  if (stripeInvoice) {
    const config = await stripeConfig(organizationId);
    if (config?.secretKey) {
      try {
        const invoice = await retrieveStripeInvoice(
          config.secretKey,
          stripeInvoice,
          stripeOpts(config),
        );
        const ingested = await ingestStripeInvoice(organizationId, invoice);
        if (ingested) return { invoiceId: ingested.invoiceId, alreadyRecorded: true };
      } catch {
        // Fall through to the Sere invoice id on the PaymentIntent.
      }
    }
  }

  if (!sereInvoiceId) return null;
  const [invoice] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, sereInvoiceId), eq(invoices.organizationId, organizationId)));
  if (!invoice) return null;
  const result = await recordOnlinePayment({
    organizationId,
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    amountCents,
    reference: remote.id,
    method: "card",
    notes: "Paid in Stripe",
  });
  if (!result.alreadyRecorded) {
    await markStripePaidIfLinked(organizationId, invoice.id);
  }
  return { invoiceId: invoice.id, alreadyRecorded: result.alreadyRecorded };
}
