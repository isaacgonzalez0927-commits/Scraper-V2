import { eq } from "drizzle-orm";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { recordOnlinePayment } from "@/lib/finance";
import { paypalConfig } from "@/lib/integrations";
import { capturePayPalOrder, paypalOrderAmountCents, paypalOrderPaid, retrievePayPalOrder } from "@/lib/paypal";
import { invoices } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: { value?: string };
    purchase_units?: { custom_id?: string; amount?: { value?: string } }[];
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

export async function POST(request: Request) {
  await boot();
  let event: PayPalEvent;
  try {
    event = (await request.json()) as PayPalEvent;
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const custom =
    event.resource?.custom_id || event.resource?.purchase_units?.[0]?.custom_id || "";
  const parts = custom.split(":");
  const organizationId = Number(parts[0] || 0);
  const invoiceId = Number(parts[1] || 0);
  const customerId = Number(parts[2] || 0);
  if (!organizationId || !invoiceId) {
    return Response.json({ received: true, ignored: "no Sere custom_id" });
  }

  const config = await paypalConfig(organizationId);
  if (!config) return Response.json({ error: "PayPal is not connected." }, { status: 400 });

  const type = event.event_type || "";
  if (!["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"].includes(type)) {
    return Response.json({ received: true, ignored: type });
  }

  const orderId = event.resource?.supplementary_data?.related_ids?.order_id || event.resource?.id || "";
  if (!orderId) return Response.json({ received: true, ignored: "no order id" });

  let amount = 0;
  try {
    let order = await retrievePayPalOrder(config.clientId, config.clientSecret, orderId, config.sandbox);
    if (order.status === "APPROVED") {
      order = await capturePayPalOrder(config.clientId, config.clientSecret, orderId, config.sandbox);
    }
    if (paypalOrderPaid(order)) amount = paypalOrderAmountCents(order);
  } catch {
    if (type === "PAYMENT.CAPTURE.COMPLETED" || type === "CHECKOUT.ORDER.COMPLETED") {
      amount = Math.round(
        Number(event.resource?.amount?.value || event.resource?.purchase_units?.[0]?.amount?.value || 0) * 100,
      );
    }
  }
  if (!amount) {
    return Response.json({ received: true, ignored: "order not captured yet" });
  }

  const [invoice] = await db().select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice || invoice.organizationId !== organizationId) {
    return Response.json({ received: true, ignored: "invoice not found" });
  }

  const result = await recordOnlinePayment({
    organizationId,
    customerId: customerId || invoice.customerId,
    invoiceId,
    amountCents: amount,
    reference: orderId,
    method: "card",
    notes: "Paid online through PayPal",
  });
  return Response.json({ received: true, recorded: !result.alreadyRecorded });
}
