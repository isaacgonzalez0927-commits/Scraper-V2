import { eq } from "drizzle-orm";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { recordOnlinePayment } from "@/lib/finance";
import { connectedStripeShops, stripeConfig } from "@/lib/integrations";
import { retrieveStripeInvoice, verifyWebhookSignature, type StripeInvoice } from "@/lib/stripe";
import { ingestStripeInvoice, stripeInvoiceEventNames } from "@/lib/stripe-invoices";
import { invoices } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      object?: string;
      amount_total?: number;
      amount_received?: number;
      amount_paid?: number;
      payment_status?: string;
      metadata?: Record<string, string>;
      customer?: string;
      status?: string;
      hosted_invoice_url?: string;
      number?: string;
      description?: string;
      due_date?: number;
      created?: number;
      total?: number;
      subtotal?: number;
      lines?: StripeInvoice["lines"];
    };
  };
};

const PAID_CHECKOUT = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];

function eventOrgId(object: NonNullable<StripeEvent["data"]>["object"]): number {
  const metadata = object?.metadata || {};
  return Number(metadata.organization_id || metadata.sere_organization_id || 0);
}

async function resolveOrganization(
  payload: string,
  header: string | null,
  object: NonNullable<StripeEvent["data"]>["object"],
): Promise<number> {
  const named = eventOrgId(object);
  if (named) {
    const config = await stripeConfig(named);
    const secrets = Array.from(
      new Set([config?.webhookSecret || "", process.env.STRIPE_WEBHOOK_SECRET || ""].filter(Boolean)),
    );
    if (secrets.some((secret) => verifyWebhookSignature({ payload, header, secret }))) {
      return named;
    }
  }

  if (object?.id) {
    const [linked] = await db()
      .select()
      .from(invoices)
      .where(eq(invoices.stripeInvoiceId, object.id));
    if (linked) {
      const config = await stripeConfig(linked.organizationId);
      const secrets = Array.from(
        new Set([config?.webhookSecret || "", process.env.STRIPE_WEBHOOK_SECRET || ""].filter(Boolean)),
      );
      if (secrets.some((secret) => verifyWebhookSignature({ payload, header, secret }))) {
        return linked.organizationId;
      }
    }
  }

  const shops = await connectedStripeShops();
  const platform = process.env.STRIPE_WEBHOOK_SECRET || "";
  for (const shop of shops) {
    const secrets = [shop.webhookSecret, platform].filter(Boolean);
    if (secrets.some((secret) => verifyWebhookSignature({ payload, header, secret }))) {
      return shop.organizationId;
    }
  }
  if (platform && verifyWebhookSignature({ payload, header, secret: platform })) {
    return named;
  }
  return 0;
}

/**
 * Stripe tells Sere about checkout payments and about invoices created in the
 * Stripe dashboard. Signature is checked against the shop's webhook secret.
 */
export async function POST(request: Request) {
  await boot();
  const payload = await request.text();
  const header = request.headers.get("stripe-signature");

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const object = event.data?.object || {};
  const organizationId = await resolveOrganization(payload, header, object);
  if (!organizationId) {
    return Response.json({ error: "Signature check failed." }, { status: 400 });
  }

  if (PAID_CHECKOUT.includes(event.type || "") && object.payment_status === "paid") {
    const invoiceId = Number(object.metadata?.invoice_id || 0);
    if (!invoiceId) {
      return Response.json({ received: true, ignored: "checkout without a Sere invoice" });
    }
    const [invoice] = await db().select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice || invoice.organizationId !== organizationId) {
      return Response.json({ received: true, ignored: "invoice not found" });
    }
    const result = await recordOnlinePayment({
      organizationId,
      customerId: invoice.customerId,
      invoiceId,
      amountCents: Number(object.amount_total || object.amount_received || 0),
      reference: String(object.id || ""),
      method: "card",
      notes: "Paid online through Stripe Checkout",
    });
    return Response.json({ received: true, recorded: !result.alreadyRecorded });
  }

  if (stripeInvoiceEventNames().includes(event.type || "") && object.id) {
    const config = await stripeConfig(organizationId);
    let remote = object as StripeInvoice;
    if (config?.secretKey) {
      try {
        remote = await retrieveStripeInvoice(config.secretKey, object.id, {
          stripeAccount: config.stripeAccount,
        });
      } catch {
        remote = { ...remote, id: object.id };
      }
    }
    const ingested = await ingestStripeInvoice(organizationId, remote);
    return Response.json({
      received: true,
      invoiceId: ingested?.invoiceId || null,
      created: ingested?.created || false,
    });
  }

  return Response.json({ received: true, ignored: event.type || "unknown event" });
}
