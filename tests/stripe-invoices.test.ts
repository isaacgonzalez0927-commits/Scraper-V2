import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeParams } from "../lib/stripe";
import { looksLikeStripeRestrictedKey, SERE_STRIPE_PERMISSIONS, stripeCreateRestrictedKeyUrl } from "../lib/stripe-keys";
import { stripeInvoiceEventNames, stripePaymentEventNames, isStripeMoneyReference, stripeInvoiceIdOf } from "../lib/stripe-invoices";

test("restricted keys are the only keys shops should paste", () => {
  assert.equal(looksLikeStripeRestrictedKey("rk_live_abc"), true);
  assert.equal(looksLikeStripeRestrictedKey("rk_test_abc"), true);
  assert.equal(looksLikeStripeRestrictedKey("sk_live_abc"), false);
});

test("invoice sync permissions include customers, invoices, send, and card payments", () => {
  const writes = SERE_STRIPE_PERMISSIONS.optional.map((row) => row.resource);
  assert.ok(writes.includes("Customers"));
  assert.ok(writes.includes("Invoices"));
  assert.ok(writes.includes("Invoice Items"));
  assert.ok(writes.includes("Checkout Sessions"));
  assert.ok(writes.includes("Payment Intents"));
  const invoicesWrite = SERE_STRIPE_PERMISSIONS.optional.find((row) => row.resource === "Invoices");
  assert.match(invoicesWrite?.for || "", /send/i);
  const url = stripeCreateRestrictedKeyUrl();
  assert.match(url, /apikeys\/create/);
  assert.match(url, /rak_customer_write/);
  assert.match(url, /rak_invoice_write/);
  assert.match(url, /rak_checkout_session_write/);
  assert.match(url, /rak_payment_intent_write/);
});

test("Stripe invoice webhooks cover create, send, pay, and void", () => {
  const names = stripeInvoiceEventNames();
  assert.ok(names.includes("invoice.created"));
  assert.ok(names.includes("invoice.sent"));
  assert.ok(names.includes("invoice.paid"));
  assert.ok(names.includes("invoice.payment_succeeded"));
  assert.ok(names.includes("invoice.voided"));
});

test("invoice item params flatten the way Stripe expects", () => {
  const encoded = encodeParams({
    customer: "cus_1",
    invoice: "in_1",
    description: "Filter change",
    amount: 12900,
    quantity: 1,
    currency: "usd",
  });
  assert.ok(encoded.includes("customer=cus_1"));
  assert.ok(encoded.includes("invoice=in_1"));
  assert.ok(encoded.includes("amount=12900"));
  assert.ok(encoded.includes("currency=usd"));
});

test("Stripe payment webhooks cover PaymentIntents and charges", () => {
  const names = stripePaymentEventNames();
  assert.ok(names.includes("payment_intent.succeeded"));
  assert.ok(names.includes("charge.succeeded"));
});

test("Stripe money references are the ones that already landed in Stripe", () => {
  assert.equal(isStripeMoneyReference("in_123"), true);
  assert.equal(isStripeMoneyReference("pi_123"), true);
  assert.equal(isStripeMoneyReference("cs_123"), true);
  assert.equal(isStripeMoneyReference("stripe-in_123:paid:100"), true);
  assert.equal(isStripeMoneyReference("check 1042"), false);
  assert.equal(isStripeMoneyReference(""), false);
  assert.equal(stripeInvoiceIdOf({ invoice: "in_99" }), "in_99");
  assert.equal(stripeInvoiceIdOf({ invoice: { id: "in_88" } }), "in_88");
  assert.equal(stripeInvoiceIdOf({}), "");
});

test("Sere metadata on a Stripe invoice names the shop and the invoice", () => {
  const encoded = encodeParams({
    metadata: {
      sere_organization_id: 12,
      sere_invoice_id: 44,
      sere_customer_id: 7,
    },
  });
  assert.ok(encoded.includes(`${encodeURIComponent("metadata[sere_organization_id]")}=12`));
  assert.ok(encoded.includes(`${encodeURIComponent("metadata[sere_invoice_id]")}=44`));
});
