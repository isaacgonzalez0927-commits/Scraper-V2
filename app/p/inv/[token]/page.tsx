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
import { stripeConfig } from "@/lib/integrations";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { customers, invoiceLines, invoices, organizations } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string; cancelled?: string; error?: string }>;
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

  /*
   * The customer is back from Stripe Checkout. Confirm the session with Stripe
   * and record the payment here as well as in the webhook: whichever arrives
   * first wins, and the session id keeps it to a single ledger entry.
   */
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

  const [fresh] = await db().select().from(invoices).where(eq(invoices.id, invoice.id));
  const paid = await amountPaidCents(invoice.id);
  const config = await stripeConfig(invoice.organizationId);

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
      canPayOnline={Boolean(config?.secretKey)}
      paidJustNow={paidJustNow}
      cancelled={Boolean(q.cancelled)}
      error={error}
    />
  );
}
