import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { InvoiceSheet } from "@/components/InvoiceSheet";
import { boot } from "@/lib/boot";
import { db, nowISO } from "@/lib/db";
import {
  addEvent,
  amountPaidCents,
  balanceCents,
  notify,
  recordOnlinePayment,
  refreshInvoice,
} from "@/lib/finance";
import { onlinePayMethods, paypalConfig, squareConfig, stripeConfig } from "@/lib/integrations";
import { capturePayPalOrder, paypalOrderAmountCents, paypalOrderPaid, retrievePayPalOrder } from "@/lib/paypal";
import { retrieveSquareOrder, retrieveSquarePayment } from "@/lib/square";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { customers, invoiceLines, invoices, organizations } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    session_id?: string;
    cancelled?: string;
    error?: string;
    square?: string;
    transactionId?: string;
    orderId?: string;
    paypal?: string;
    token?: string;
  }>;
}) {
  await boot();
  const { token } = await params;
  const q = await searchParams;
  const [invoice] = await db().select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice) notFound();
  const [org] = await db().select().from(organizations).where(eq(organizations.id, invoice.organizationId));
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  const lines = await db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));

  if (!invoice.viewedAt && invoice.status !== "void") {
    await db().update(invoices).set({ viewedAt: nowISO() }).where(eq(invoices.id, invoice.id));
    await addEvent(org.id, invoice.id, "viewed", "Customer viewed the invoice");
    await notify(org.id, "invoice_viewed", `${invoice.number} was viewed`, "", `/invoices/${invoice.id}`);
    await refreshInvoice(invoice.id, org.id);
  }

  let paidJustNow = false;
  let error = q.error || "";

  if (q.session_id) {
    const config = await stripeConfig(invoice.organizationId);
    if (config?.secretKey) {
      try {
        const session = await retrieveCheckoutSession(config.secretKey, q.session_id, {
          stripeAccount: config.stripeAccount,
        });
        if (session.payment_status === "paid") {
          await recordOnlinePayment({
            organizationId: invoice.organizationId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amountCents: Number(session.amount_total || 0),
            reference: session.id,
            method: "card",
            notes: "Paid online through Stripe Checkout",
          });
          paidJustNow = true;
        }
      } catch (caught) {
        error = `We could not confirm that payment with Stripe. ${(caught as Error).message}`;
      }
    }
  }

  if (q.square) {
    const config = await squareConfig(invoice.organizationId);
    const paymentId = q.transactionId || "";
    const orderId = q.orderId || "";
    if (config?.accessToken && (paymentId || orderId)) {
      try {
        let amount = 0;
        let reference = paymentId || orderId;
        let completed = false;
        if (paymentId) {
          const payment = await retrieveSquarePayment(config.accessToken, paymentId, config.sandbox);
          completed = payment.status === "COMPLETED";
          amount = Number(payment.amount_money?.amount || 0);
          reference = payment.id || reference;
        } else if (orderId) {
          const order = await retrieveSquareOrder(config.accessToken, orderId, config.sandbox);
          completed = order.state === "COMPLETED";
          amount = Number(order.total_money?.amount || 0);
          reference = order.id || reference;
        }
        if (completed) {
          await recordOnlinePayment({
            organizationId: invoice.organizationId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amountCents: amount,
            reference,
            method: "card",
            notes: "Paid online through Square",
          });
          paidJustNow = true;
        }
      } catch (caught) {
        error = `We could not confirm that payment with Square. ${(caught as Error).message}`;
      }
    }
  }

  if (q.paypal) {
    const config = await paypalConfig(invoice.organizationId);
    const orderId = q.token || "";
    if (config && orderId) {
      try {
        let order = await retrievePayPalOrder(config.clientId, config.clientSecret, orderId, config.sandbox);
        if (order.status === "APPROVED") {
          order = await capturePayPalOrder(config.clientId, config.clientSecret, orderId, config.sandbox);
        }
        if (paypalOrderPaid(order)) {
          await recordOnlinePayment({
            organizationId: invoice.organizationId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            amountCents: paypalOrderAmountCents(order) || invoice.totalCents,
            reference: order.id || orderId,
            method: "card",
            notes: "Paid online through PayPal",
          });
          paidJustNow = true;
        }
      } catch (caught) {
        error = `We could not confirm that payment with PayPal. ${(caught as Error).message}`;
      }
    }
  }

  const [fresh] = await db().select().from(invoices).where(eq(invoices.id, invoice.id));
  const paid = await amountPaidCents(invoice.id);
  const methods = await onlinePayMethods(invoice.organizationId);

  return (
    <InvoiceSheet
      org={org}
      invoice={fresh}
      customer={customer}
      lines={lines}
      paid={paid}
      balance={balanceCents(fresh.totalCents, paid, fresh.status)}
      publicView
      publicToken={token}
      payMethods={methods}
      paidJustNow={paidJustNow}
      cancelled={Boolean(q.cancelled)}
      error={error}
    />
  );
}
