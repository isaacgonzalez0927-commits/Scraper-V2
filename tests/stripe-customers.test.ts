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

test("create-key URL preselects Sere permissions and names the key", () => {
  const live = stripeCreateRestrictedKeyUrl();
  const testMode = stripeCreateRestrictedKeyUrl({ test: true });
  assert.equal(live.startsWith("https://dashboard.stripe.com/apikeys/create?"), true);
  assert.equal(testMode.startsWith("https://dashboard.stripe.com/test/apikeys/create?"), true);
  assert.ok(live.includes("name=Sere"));
  assert.ok(live.includes("permissions%5B%5D="), "Stripe reads permissions[], not permissions[0]");
  assert.equal(live.includes("permissions%5B0%5D="), false);
  assert.ok(live.includes("rak_connected_account_read"));
  assert.ok(live.includes("rak_balance_read"));
  assert.ok(live.includes("rak_charge_read"));
  assert.ok(live.includes("rak_payout_read"));
  assert.ok(live.includes("rak_customer_write"));
  assert.ok(live.includes("rak_invoice_write"));
  for (const permission of SERE_STRIPE_RAK_PERMISSIONS) {
    assert.ok(live.includes(permission));
  }
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
  assert.match(hint, /Create the Sere key/);
});

test("a rejected key names the missing rows instead of dumping Stripe's error", () => {
  const message = stripeKeyDeniedMessage([
    "Balance (needs Read): Having the 'rak_balance_read' permission would allow this request to continue.",
    "Charges (needs Read): Having the 'rak_charge_read' permission would allow this request to continue.",
  ]);
  assert.match(message, /Balance \(needs Read\)/);
  assert.match(message, /Charges \(needs Read\)/);
  assert.match(message, /Create the Sere key/);
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
