import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { recordOnlinePayment } from "@/lib/finance";
import { squareConfig } from "@/lib/integrations";
import { retrieveSquareOrder, verifySquareSignature } from "@/lib/square";
import { invoices } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { absoluteBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SquareEvent = {
  type?: string;
  data?: {
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
        amount_money?: { amount?: number };
        note?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  await boot();
  const payload = await request.text();
  let event: SquareEvent;
  try {
    event = JSON.parse(payload) as SquareEvent;
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const payment = event.data?.object?.payment;
  const note = payment?.note || "";
  const parts = note.startsWith("sere:") ? note.slice(5).split(":") : [];
  const organizationId = Number(parts[0] || 0);
  const invoiceId = Number(parts[1] || 0);
  const customerId = Number(parts[2] || 0);
  if (!organizationId || !invoiceId) {
    return Response.json({ received: true, ignored: "no Sere note on this payment" });
  }

  const config = await squareConfig(organizationId);
  if (!config) return Response.json({ error: "Square is not connected." }, { status: 400 });
  if (config.webhookSignatureKey) {
    const base = await absoluteBaseUrl();
    const ok = verifySquareSignature({
      payload,
      signature: request.headers.get("x-square-hmacsha256-signature"),
      signatureKey: config.webhookSignatureKey,
      notificationUrl: `${base}/api/webhooks/square`,
    });
    if (!ok) return Response.json({ error: "Signature check failed." }, { status: 400 });
  }

  if (event.type !== "payment.updated" || payment?.status !== "COMPLETED") {
    return Response.json({ received: true, ignored: event.type || "unknown" });
  }

  const [invoice] = await db().select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice || invoice.organizationId !== organizationId) {
    return Response.json({ received: true, ignored: "invoice not found" });
  }

  let amount = Number(payment?.amount_money?.amount || 0);
  if (!amount && payment?.order_id) {
    const order = await retrieveSquareOrder(config.accessToken, payment.order_id, config.sandbox).catch(() => null);
    amount = Number(order?.total_money?.amount || 0);
  }

  const result = await recordOnlinePayment({
    organizationId,
    customerId: customerId || invoice.customerId,
    invoiceId,
    amountCents: amount,
    reference: String(payment?.id || payment?.order_id || ""),
    method: "card",
    notes: "Paid online through Square",
  });
  return Response.json({ received: true, recorded: !result.alreadyRecorded });
}
