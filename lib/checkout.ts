/**
 * Start card checkout for a public invoice. The pay link hits this and
 * redirects to Stripe, Square, or PayPal. The customer never picks a brand.
 */

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { amountPaidCents, balanceCents } from "@/lib/finance";
import {
  onlinePayMethods,
  paypalConfig,
  squareConfig,
  stripeConfig,
  type OnlinePayMethods,
} from "@/lib/integrations";
import { createPayPalOrder } from "@/lib/paypal";
import { createSquarePaymentLink, listSquareLocations } from "@/lib/square";
import { createCheckoutSession } from "@/lib/stripe";
import { absoluteBaseUrl } from "@/lib/url";
import { invoicePagePath } from "@/lib/phone";
import { customers, invoices, organizations } from "@/lib/schema";

export type CheckoutRail = "stripe" | "square" | "paypal";

export function checkoutRailOrder(methods: OnlinePayMethods): CheckoutRail[] {
  const order: CheckoutRail[] = [];
  if (methods.stripe) order.push("stripe");
  if (methods.square) order.push("square");
  if (methods.paypal) order.push("paypal");
  return order;
}

async function loadPayableInvoice(token: string) {
  const back = invoicePagePath(token);
  if (!token) redirect("/");
  const [invoice] = await db().select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice) redirect("/");
  if (invoice.status === "void") redirect(back);
  const paid = await amountPaidCents(invoice.id);
  const due = balanceCents(invoice.totalCents, paid, invoice.status);
  if (due <= 0) redirect(back);
  const [org] = await db()
    .select()
    .from(organizations)
    .where(eq(organizations.id, invoice.organizationId));
  const [customer] = await db().select().from(customers).where(eq(customers.id, invoice.customerId));
  return { invoice, org, customer, due, back };
}

async function stripeCheckoutUrl(
  token: string,
  invoice: typeof invoices.$inferSelect,
  org: typeof organizations.$inferSelect,
  customer: typeof customers.$inferSelect | undefined,
  due: number,
): Promise<string> {
  const config = await stripeConfig(invoice.organizationId);
  if (!config?.secretKey) throw new Error("Stripe is not connected.");
  const base = await absoluteBaseUrl();
  const back = invoicePagePath(token);
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
  if (!session.url) throw new Error("Stripe did not return a checkout page.");
  return session.url;
}

async function squareCheckoutUrl(
  token: string,
  invoice: typeof invoices.$inferSelect,
  org: typeof organizations.$inferSelect,
  due: number,
): Promise<string> {
  const config = await squareConfig(invoice.organizationId);
  if (!config?.accessToken) throw new Error("Square is not connected.");
  const base = await absoluteBaseUrl();
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
    redirectUrl: `${base}${invoicePagePath(token)}?square=1`,
    sandbox: config.sandbox,
    idempotencyKey: `inv-${invoice.id}-${due}`,
  });
  if (!link.url) throw new Error("Square did not return a checkout page.");
  return link.url;
}

async function paypalCheckoutUrl(
  token: string,
  invoice: typeof invoices.$inferSelect,
  org: typeof organizations.$inferSelect,
  due: number,
): Promise<string> {
  const config = await paypalConfig(invoice.organizationId);
  if (!config?.clientId) throw new Error("PayPal is not connected.");
  const base = await absoluteBaseUrl();
  const back = invoicePagePath(token);
  const order = await createPayPalOrder(config.clientId, config.clientSecret, {
    amountCents: due,
    description: `${org.name} invoice ${invoice.number}`,
    customId: `${invoice.organizationId}:${invoice.id}:${invoice.customerId}`,
    returnUrl: `${base}${back}?paypal=1`,
    cancelUrl: `${base}${back}?cancelled=1`,
    brandName: org.name,
    sandbox: config.sandbox,
  });
  if (!order.url) throw new Error("PayPal did not return a checkout page.");
  return order.url;
}

/**
 * Open the first connected card rail. Stripe first, then Square, then PayPal.
 * QuickBooks is not a card rail.
 */
export async function startPrimaryCheckout(token: string): Promise<never> {
  const { invoice, org, customer, due, back } = await loadPayableInvoice(token);
  const methods = await onlinePayMethods(invoice.organizationId);
  const errors: string[] = [];
  for (const rail of checkoutRailOrder(methods)) {
    try {
      if (rail === "stripe") {
        redirect(await stripeCheckoutUrl(token, invoice, org, customer, due));
      }
      if (rail === "square") {
        redirect(await squareCheckoutUrl(token, invoice, org, due));
      }
      if (rail === "paypal") {
        redirect(await paypalCheckoutUrl(token, invoice, org, due));
      }
    } catch (error) {
      if (isRedirectError(error)) throw error;
      errors.push((error as Error).message);
    }
  }
  redirect(
    `${back}?error=${encodeURIComponent(errors[0] || "Online pay is not set up for this invoice.")}`,
  );
}

function isRedirectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest || "").startsWith("NEXT_REDIRECT"),
  );
}
