"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { boot } from "@/lib/boot";
import { db } from "@/lib/db";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import { paypalConfig, squareConfig, stripeConfig } from "@/lib/integrations";
import { createPayPalOrder } from "@/lib/paypal";
import { createSquarePaymentLink, listSquareLocations } from "@/lib/square";
import { createCheckoutSession } from "@/lib/stripe";
import { absoluteBaseUrl } from "@/lib/url";
import { customers, invoices, organizations } from "@/lib/schema";

async function dueInvoice(token: string) {
  await boot();
  const back = `/p/inv/${token}`;
  if (!token) redirect("/");
  const [invoice] = await db().select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice) redirect("/");
  if (invoice.status === "void") redirect(back);
  const paid = await amountPaidCents(invoice.id);
  const due = balanceCents(invoice.totalCents, paid, invoice.status);
  if (due <= 0) redirect(back);
  const [org] = await db().select().from(organizations).where(eq(organizations.id, invoice.organizationId));
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  return { invoice, org, customer, due, back };
}

export async function startInvoiceCheckoutAction(form: FormData) {
  const token = String(form.get("token") || "").trim();
  const { invoice, org, customer, due, back } = await dueInvoice(token);
  const config = await stripeConfig(invoice.organizationId);
  if (!config?.secretKey) {
    redirect(`${back}?error=${encodeURIComponent("Stripe is not connected for this business yet.")}`);
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

export async function startSquareCheckoutAction(form: FormData) {
  const token = String(form.get("token") || "").trim();
  const { invoice, org, due, back } = await dueInvoice(token);
  const config = await squareConfig(invoice.organizationId);
  if (!config?.accessToken) {
    redirect(`${back}?error=${encodeURIComponent("Square is not connected for this business yet.")}`);
  }
  const base = await absoluteBaseUrl();
  let url = "";
  let failure = "";
  try {
    let locationId = config.locationId;
    if (!locationId) {
      const locations = await listSquareLocations(config.accessToken, config.sandbox);
      locationId = locations[0]?.id || "";
    }
    const link = await createSquarePaymentLink(config.accessToken, {
      amountCents: due,
      locationId,
      name: `${org.name} invoice ${invoice.number}`,
      note: `sere:${invoice.organizationId}:${invoice.id}:${invoice.customerId}`,
      redirectUrl: `${base}${back}?square=1`,
      sandbox: config.sandbox,
      idempotencyKey: `inv-${invoice.id}-${due}`,
    });
    url = link.url || "";
  } catch (error) {
    failure = (error as Error).message;
  }
  if (!url) {
    redirect(`${back}?error=${encodeURIComponent(failure || "Square did not return a checkout page.")}`);
  }
  redirect(url);
}

export async function startPaypalCheckoutAction(form: FormData) {
  const token = String(form.get("token") || "").trim();
  const { invoice, org, due, back } = await dueInvoice(token);
  const config = await paypalConfig(invoice.organizationId);
  if (!config?.clientId) {
    redirect(`${back}?error=${encodeURIComponent("PayPal is not connected for this business yet.")}`);
  }
  const base = await absoluteBaseUrl();
  let url = "";
  let failure = "";
  try {
    const order = await createPayPalOrder(config.clientId, config.clientSecret, {
      amountCents: due,
      description: `${org.name} invoice ${invoice.number}`,
      customId: `${invoice.organizationId}:${invoice.id}:${invoice.customerId}`,
      returnUrl: `${base}${back}?paypal=1`,
      cancelUrl: `${base}${back}?cancelled=1`,
      brandName: org.name,
      sandbox: config.sandbox,
    });
    url = order.url;
  } catch (error) {
    failure = (error as Error).message;
  }
  if (!url) {
    redirect(`${back}?error=${encodeURIComponent(failure || "PayPal did not return a checkout page.")}`);
  }
  redirect(url);
}
