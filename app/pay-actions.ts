"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { stripeConfig } from "@/lib/integrations";
import { createCheckoutSession } from "@/lib/stripe";
import { absoluteBaseUrl } from "@/lib/url";
import { customers, invoices, organizations } from "@/lib/schema";

/**
 * Starts Stripe Checkout for a customer holding an invoice link. No session is
 * required: the unguessable public token is the credential, and the amount is
 * always recomputed on the server from the invoice balance.
 */
export async function startInvoiceCheckoutAction(form: FormData) {
  await boot();
  const token = String(form.get("token") || "").trim();
  if (!token) redirect("/");
  const back = `/p/inv/${token}`;

  const [invoice] = await db().select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice) redirect("/");
  if (invoice.status === "void") redirect(back);

  const paid = await amountPaidCents(invoice.id);
  const due = balanceCents(invoice.totalCents, paid, invoice.status);
  if (due <= 0) redirect(back);

  const [org] = await db().select().from(organizations).where(eq(organizations.id, invoice.organizationId));
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  const config = await stripeConfig(invoice.organizationId);
  if (!config?.secretKey) {
    redirect(`${back}?error=${encodeURIComponent("Online payment is not set up for this business yet.")}`);
  }

  const base = await absoluteBaseUrl();
  let url = "";
  let failure = "";
  try {
    const session = await createCheckoutSession(config.secretKey, {
      amountCents: due,
      productName: `Invoice ${invoice.number}`,
      description: `${org.name} invoice ${invoice.number}`,
      successUrl: `${base}${back}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}${back}?cancelled=1`,
      customerEmail: customer?.email || undefined,
      stripeAccount: config.stripeAccount,
      metadata: {
        organization_id: String(invoice.organizationId),
        invoice_id: String(invoice.id),
        customer_id: String(invoice.customerId),
        invoice_number: invoice.number,
      },
    });
    url = session.url || "";
  } catch (error) {
    failure = (error as Error).message;
  }

  if (!url) {
    redirect(`${back}?error=${encodeURIComponent(failure || "Stripe did not return a checkout page.")}`);
  }
  redirect(url);
}
