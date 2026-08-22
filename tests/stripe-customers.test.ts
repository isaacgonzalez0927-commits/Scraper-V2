import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SERE_STRIPE_RAK_PERMISSIONS,
  stripeCreateRestrictedKeyUrl,
  stripeKeyDeniedMessage,
} from "../lib/stripe-keys";
import {
  customerWriteHint,
  pickLinkedSereCustomer,
  sereFieldsFromStripeCustomer,
  stripeCustomerEventNames,
  stripeDashboardCustomerUrl,
} from "../lib/stripe-customers";

test("connect link opens Stripe sandbox Developers, not a named create-key wizard", () => {
  const sandbox = stripeCreateRestrictedKeyUrl();
  const live = stripeCreateRestrictedKeyUrl({ test: false });
  assert.equal(sandbox, "https://dashboard.stripe.com/test/apikeys");
  assert.equal(live, "https://dashboard.stripe.com/apikeys");
  assert.equal(sandbox.includes("create"), false);
  assert.equal(sandbox.includes("name="), false);
  assert.equal(sandbox.includes("permissions"), false);
  assert.ok(SERE_STRIPE_RAK_PERMISSIONS.includes("rak_customer_write"));
  assert.ok(SERE_STRIPE_RAK_PERMISSIONS.includes("rak_connected_account_read"));
});

test("customer webhooks cover create, update, and delete", () => {
  const names = stripeCustomerEventNames();
  assert.ok(names.includes("customer.created"));
  assert.ok(names.includes("customer.updated"));
  assert.ok(names.includes("customer.deleted"));
});

test("Sere matches a Stripe customer by id, then metadata, then email", () => {
  assert.equal(pickLinkedSereCustomer({ byStripeId: 1, byMetadataId: 2, byEmail: 3 }), 1);
  assert.equal(pickLinkedSereCustomer({ byMetadataId: 2, byEmail: 3 }), 2);
  assert.equal(pickLinkedSereCustomer({ byEmail: 3 }), 3);
  assert.equal(pickLinkedSereCustomer({}), undefined);
});

test("Stripe customer fields fill Sere name, email, phone, and billing address", () => {
  const fields = sereFieldsFromStripeCustomer({
    id: "cus_1",
    name: "Pat Rivera",
    email: "pat@shop.test",
    phone: "555-0100",
    address: {
      line1: "12 Dock Rd",
      city: "Harbor",
      state: "ME",
      postal_code: "04000",
    },
  });
  assert.equal(fields.name, "Pat Rivera");
  assert.equal(fields.email, "pat@shop.test");
  assert.equal(fields.billingLine1, "12 Dock Rd");
  assert.equal(fields.billingPostal, "04000");
});

test("Stripe customer fields keep existing Sere values when Stripe is blank", () => {
  const fields = sereFieldsFromStripeCustomer(
    { id: "cus_1", name: null, email: null },
    { name: "Existing", email: "keep@shop.test", billingCity: "Harbor" },
  );
  assert.equal(fields.name, "Existing");
  assert.equal(fields.email, "keep@shop.test");
  assert.equal(fields.billingCity, "Harbor");
});

test("missing Customers Write gets a create-key hint", () => {
  const hint = customerWriteHint(
    "The provided key does not have the required permissions. Having the 'rak_customer_write' permission would allow this request to continue.",
  );
  assert.match(hint, /Customize permissions/);
});

test("a rejected key names the missing rows instead of dumping Stripe's error", () => {
  const message = stripeKeyDeniedMessage([
    "Balance (needs Read): Having the 'rak_balance_read' permission would allow this request to continue.",
    "Charges (needs Read): Having the 'rak_charge_read' permission would allow this request to continue.",
  ]);
  assert.match(message, /Balance \(needs Read\)/);
  assert.match(message, /Charges \(needs Read\)/);
  assert.match(message, /Customize permissions/);
  assert.equal(message.includes("rk_live_"), false);
});

test("Stripe customer dashboard URL follows test vs live keys", () => {
  assert.equal(
    stripeDashboardCustomerUrl("cus_live", "rk_live_abc"),
    "https://dashboard.stripe.com/customers/cus_live",
  );
  assert.equal(
    stripeDashboardCustomerUrl("cus_test", "rk_test_abc"),
    "https://dashboard.stripe.com/test/customers/cus_test",
  );
});
