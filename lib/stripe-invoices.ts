/**
 * Two-way invoice sync with Stripe.
 *
 * Sere stays the shop book. When Stripe is connected with a restricted key that
 * can write Customers and Invoices:
 *
 *   Sere → Stripe  creating or sending a Sere invoice creates/updates a Stripe
 *                  Invoice for the same customer and line items.
 *   Stripe → Sere  a webhook for invoice.created / paid / voided imports or
 *                  updates the matching Sere invoice, without duplicating.
 *
 * Linked IDs (stripe_customer_id, stripe_invoice_id) are the only matching key.
 * Events that originated in Sere carry metadata.sere_invoice_id so they bounce
 * back as updates, not second copies.
 */

import { and, eq } from "drizzle-orm";
import { displayName } from "./display";
import { db, nowISO, token } from "./db";
import { addEvent, applyPayment, refreshInvoice, recordOnlinePayment } from "./finance";
import { stripeConfig } from "./integrations";
import {
  addStripeInvoiceItem,
  createStripeCustomer,
  createStripeInvoice,
  finalizeStripeInvoice,
  payStripeInvoiceOutOfBand,
  retrieveStripeCustomer,
  retrieveStripeInvoice,
  StripeError,
  updateStripeCustomer,
  voidStripeInvoice,
  type StripeInvoice,
  type StripeInvoiceLine,
} from "./stripe";
import { customers, invoiceLines, invoices, organizations } from "./schema";

export type StripeSyncResult = {
  ok: boolean;
  skipped?: string;
  stripeInvoiceId?: string;
  hostedUrl?: string;
  error?: string;
};

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

async function ensureStripeCustomer(
  organizationId: number,
  customerId: number,
  secretKey: string,
  stripeAccount?: string,
): Promise<string> {
  const [customer] = await db()
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)));
  if (!customer) throw new StripeError("Customer not found.");
  if (customer.stripeCustomerId) {
    try {
      await retrieveStripeCustomer(secretKey, customer.stripeCustomerId, { stripeAccount });
      await updateStripeCustomer(secretKey, customer.stripeCustomerId, {
        name: displayName(customer),
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        metadata: { sere_customer_id: customer.id, sere_organization_id: organizationId },
        stripeAccount,
      });
      return customer.stripeCustomerId;
    } catch {
      // Stale id. Create a new one below.
    }
  }
  const created = await createStripeCustomer(secretKey, {
    name: displayName(customer),
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    metadata: { sere_customer_id: customer.id, sere_organization_id: organizationId },
    stripeAccount,
    idempotencyKey: `sere-cust-${organizationId}-${customer.id}`,
  });
  await db()
    .update(customers)
    .set({ stripeCustomerId: created.id })
    .where(eq(customers.id, customer.id));
  return created.id;
}

/**
 * Push a Sere invoice to Stripe. Drafts stay drafts. Sent invoices are
 * finalized so they appear as open in the Stripe dashboard.
 */
export async function pushInvoiceToStripe(
  organizationId: number,
  invoiceId: number,
  opts: { finalize?: boolean } = {},
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
      if (opts.finalize && remote.status === "draft") {
        remote = await finalizeStripeInvoice(config.secretKey, stripeInvoiceId, stripeOpts(config));
        await db()
          .update(invoices)
          .set({ stripeHostedUrl: remote.hosted_invoice_url || invoice.stripeHostedUrl })
          .where(eq(invoices.id, invoice.id));
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

    if (opts.finalize || invoice.status === "sent" || invoice.status === "viewed" || invoice.status === "overdue") {
      remote = await finalizeStripeInvoice(config.secretKey, stripeInvoiceId, stripeOpts(config));
    } else {
      remote = await retrieveStripeInvoice(config.secretKey, stripeInvoiceId, stripeOpts(config));
    }

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

async function findOrCreateSereCustomer(opts: {
  organizationId: number;
  stripeCustomerId: string;
  secretKey: string;
  stripeAccount?: string;
  fallbackName?: string;
  fallbackEmail?: string;
}): Promise<number> {
  const [existing] = await db()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, opts.organizationId),
        eq(customers.stripeCustomerId, opts.stripeCustomerId),
      ),
    );
  if (existing) return existing.id;

  let name = opts.fallbackName || "";
  let email = opts.fallbackEmail || "";
  let phone = "";
  try {
    const remote = await retrieveStripeCustomer(opts.secretKey, opts.stripeCustomerId, {
      stripeAccount: opts.stripeAccount,
    });
    name = remote.name || name;
    email = remote.email || email;
    phone = remote.phone || "";
    const sereId = Number(remote.metadata?.sere_customer_id || 0);
    if (sereId) {
      const [linked] = await db()
        .select()
        .from(customers)
        .where(and(eq(customers.id, sereId), eq(customers.organizationId, opts.organizationId)));
      if (linked) {
        await db().update(customers).set({ stripeCustomerId: opts.stripeCustomerId }).where(eq(customers.id, linked.id));
        return linked.id;
      }
    }
  } catch {
    // Use fallbacks.
  }

  if (email) {
    const [byEmail] = await db()
      .select()
      .from(customers)
      .where(and(eq(customers.organizationId, opts.organizationId), eq(customers.email, email)));
    if (byEmail) {
      await db()
        .update(customers)
        .set({ stripeCustomerId: opts.stripeCustomerId })
        .where(eq(customers.id, byEmail.id));
      return byEmail.id;
    }
  }

  const [created] = await db()
    .insert(customers)
    .values({
      organizationId: opts.organizationId,
      name: name || "Stripe customer",
      email,
      phone,
      stripeCustomerId: opts.stripeCustomerId,
      customerSince: nowISO().slice(0, 10),
      createdAt: nowISO(),
    })
    .returning({ id: customers.id });
  return created.id;
}

function nextSereNumber(prefix: string, stripeNumber?: string | null, fallbackId?: string): string {
  if (stripeNumber && stripeNumber.trim()) return stripeNumber.trim();
  const short = (fallbackId || "").replace(/^in_/, "").slice(0, 8);
  return `${prefix}ST-${short || Date.now().toString(36)}`;
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

  const customerId = await findOrCreateSereCustomer({
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
    // Don't rewrite lines on a Sere-originated invoice. Sere is the book.
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
    await recordOnlinePayment({
      organizationId,
      customerId,
      invoiceId: invoice.id,
      amountCents: paidCents,
      reference: remote.id,
      method: "card",
      notes: "Paid in Stripe",
    });
  }

  return { invoiceId: invoice.id, created };
}

export function stripeInvoiceEventNames(): string[] {
  return [
    "invoice.created",
    "invoice.finalized",
    "invoice.updated",
    "invoice.paid",
    "invoice.voided",
    "invoice.marked_uncollectible",
  ];
}
