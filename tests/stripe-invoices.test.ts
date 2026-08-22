import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeParams } from "../lib/stripe";
import { looksLikeStripeRestrictedKey, SERE_STRIPE_PERMISSIONS } from "../lib/stripe-keys";
import { stripeInvoiceEventNames } from "../lib/stripe-invoices";

test("restricted keys are the only keys shops should paste", () => {
  assert.equal(looksLikeStripeRestrictedKey("rk_live_abc"), true);
  assert.equal(looksLikeStripeRestrictedKey("rk_test_abc"), true);
  assert.equal(looksLikeStripeRestrictedKey("sk_live_abc"), false);
});

test("invoice sync permissions include customers and invoices as write", () => {
  const writes = SERE_STRIPE_PERMISSIONS.optional.map((row) => row.resource);
  assert.ok(writes.includes("Customers"));
  assert.ok(writes.includes("Invoices"));
  assert.ok(writes.includes("Invoice Items"));
});

test("Stripe invoice webhooks cover create, pay, and void", () => {
  const names = stripeInvoiceEventNames();
  assert.ok(names.includes("invoice.created"));
  assert.ok(names.includes("invoice.paid"));
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
