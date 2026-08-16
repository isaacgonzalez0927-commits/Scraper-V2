import { eq } from "drizzle-orm";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { recordOnlinePayment } from "@/lib/finance";
import { stripeConfig } from "@/lib/integrations";
import { verifyWebhookSignature } from "@/lib/stripe";
import { invoices } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      amount_total?: number;
      amount_received?: number;
      payment_status?: string;
      metadata?: Record<string, string>;
    };
  };
};

const PAID_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];

/**
 * Stripe tells us a customer paid. The event names the shop in its metadata,
 * so the signature is checked against that shop's own webhook secret before
 * anything touches the ledger.
 */
export async function POST(request: Request) {
  await boot();
  const payload = await request.text();

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const organizationId = Number(metadata.organization_id || 0);
  const invoiceId = Number(metadata.invoice_id || 0);
  if (!organizationId || !invoiceId) {
    return Response.json({ received: true, ignored: "no Sere metadata on this event" });
  }

  const config = await stripeConfig(organizationId);
  if (!config?.webhookSecret) {
    return Response.json({ error: "No webhook secret is saved for this business." }, { status: 400 });
  }
  const verified = verifyWebhookSignature({
    payload,
    header: request.headers.get("stripe-signature"),
    secret: config.webhookSecret,
  });
  if (!verified) {
    return Response.json({ error: "Signature check failed." }, { status: 400 });
  }

  if (!PAID_EVENTS.includes(event.type || "") || object.payment_status !== "paid") {
    return Response.json({ received: true, ignored: event.type || "unknown event" });
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
