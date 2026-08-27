import { boot } from "@/lib/boot";
import { connectedSquareShops, squareConfig } from "@/lib/integrations";
import {
  ingestSquareInvoiceId,
  ingestSquarePayment,
  parseSereSquareNote,
  squareInvoiceEventNames,
  squarePaymentEventNames,
} from "@/lib/square-invoices";
import { retrieveSquareOrder, verifySquareSignature } from "@/lib/square";
import { absoluteBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SquareEvent = {
  type?: string;
  data?: {
    id?: string;
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
        invoice_id?: string;
        customer_id?: string;
        amount_money?: { amount?: number };
        note?: string;
        created_at?: string;
      };
      invoice?: {
        id?: string;
      };
    };
  };
};

async function resolveSquareOrg(
  payload: string,
  signature: string | null,
  noteOrgId: number,
): Promise<number> {
  const base = await absoluteBaseUrl();
  const notificationUrl = `${base}/api/webhooks/square`;
  if (noteOrgId) {
    const config = await squareConfig(noteOrgId);
    if (!config) return 0;
    if (config.webhookSignatureKey) {
      const ok = verifySquareSignature({
        payload,
        signature,
        signatureKey: config.webhookSignatureKey,
        notificationUrl,
      });
      if (!ok) return 0;
    }
    return noteOrgId;
  }
  const shops = await connectedSquareShops();
  for (const shop of shops) {
    if (!shop.webhookSignatureKey) continue;
    const ok = verifySquareSignature({
      payload,
      signature,
      signatureKey: shop.webhookSignatureKey,
      notificationUrl,
    });
    if (ok) return shop.organizationId;
  }
  return 0;
}

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
  const invoiceId = event.data?.object?.invoice?.id || "";
  const tagged = parseSereSquareNote(payment?.note);
  const organizationId = await resolveSquareOrg(
    payload,
    request.headers.get("x-square-hmacsha256-signature"),
    tagged?.organizationId || 0,
  );
  if (!organizationId) {
    if (tagged?.organizationId) {
      return Response.json({ error: "Signature check failed." }, { status: 400 });
    }
    return Response.json({ received: true, ignored: "no Square shop matched this event" });
  }

  if (squareInvoiceEventNames().includes(event.type || "") && invoiceId) {
    const ingested = await ingestSquareInvoiceId(organizationId, invoiceId);
    return Response.json({
      received: true,
      invoiceId: ingested?.invoiceId || null,
      created: ingested?.created || false,
    });
  }

  if (!squarePaymentEventNames().includes(event.type || "")) {
    return Response.json({ received: true, ignored: event.type || "unknown" });
  }
  if ((payment?.status || "").toUpperCase() !== "COMPLETED") {
    return Response.json({ received: true, ignored: payment?.status || "not completed" });
  }

  const config = await squareConfig(organizationId);
  let amount = Number(payment?.amount_money?.amount || 0);
  if (!amount && payment?.order_id && config?.accessToken) {
    const order = await retrieveSquareOrder(
      config.accessToken,
      payment.order_id,
      config.sandbox,
    ).catch(() => null);
    amount = Number(order?.total_money?.amount || 0);
  }

  const ingested = await ingestSquarePayment(
    organizationId,
    {
      id: payment?.id,
      status: payment?.status,
      order_id: payment?.order_id,
      invoice_id: payment?.invoice_id,
      customer_id: payment?.customer_id,
      amount_money: amount ? { amount } : payment?.amount_money,
      note: payment?.note,
      created_at: payment?.created_at,
    },
    { accessToken: config?.accessToken, sandbox: config?.sandbox },
  );
  return Response.json({
    received: true,
    invoiceId: ingested?.invoiceId || null,
    recorded: ingested ? !ingested.alreadyRecorded : false,
  });
}
