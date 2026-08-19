import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/crypto";
import { encodeParams, readConnectState, signConnectState, stripeConnectAuthorizeUrl, stripeConnectEnabled, verifyWebhookSignature } from "../lib/stripe";
import { paypalAmount } from "../lib/paypal";
import { verifySquareSignature } from "../lib/square";

test("stored secrets survive a round trip and never appear in the ciphertext", () => {
  const secret = "sk_live_51NotARealKeyAtAll0000";
  const cipher = encryptSecret(secret);
  assert.notEqual(cipher, secret);
  assert.equal(cipher.includes(secret), false);
  assert.equal(decryptSecret(cipher), secret);
});

test("a tampered or foreign ciphertext decrypts to nothing", () => {
  const cipher = encryptSecret("re_test_key");
  const [format, iv, tag, body] = cipher.split(".");
  assert.equal(decryptSecret(`${format}.${iv}.${tag}.${body.slice(0, -2)}xx`), "");
  assert.equal(decryptSecret("not-a-cipher"), "");
  assert.equal(decryptSecret(""), "");
});

test("masking shows enough to recognise a key and no more", () => {
  assert.equal(maskSecret("sk_live_abcdefghij1234"), "sk_live••••1234");
  assert.equal(maskSecret("short"), "••••");
  assert.equal(maskSecret(""), "");
});

test("Stripe form encoding flattens nested params", () => {
  const encoded = encodeParams({
    mode: "payment",
    metadata: { invoice_id: 7 },
    line_items: [{ quantity: 1, price_data: { unit_amount: 12900 } }],
    skipped: "",
  });
  const parts = encoded.split("&");
  assert.ok(parts.includes("mode=payment"));
  assert.ok(parts.includes(`${encodeURIComponent("metadata[invoice_id]")}=7`));
  assert.ok(parts.includes(`${encodeURIComponent("line_items[0][quantity]")}=1`));
  assert.ok(parts.includes(`${encodeURIComponent("line_items[0][price_data][unit_amount]")}=12900`));
  assert.equal(encoded.includes("skipped"), false);
});

test("Connect Stripe state is tied to the shop and expires", () => {
  const state = signConnectState(12, 34, 1_800_000_000_000);
  const parsed = readConnectState(state, 1_800_000_000_000);
  assert.deepEqual(parsed, { organizationId: 12, userId: 34, exp: 1_800_000_900_000 });
  assert.equal(readConnectState(state, 1_800_001_000_000), null, "expired after 15 minutes");
  assert.equal(readConnectState(`${state}x`, 1_800_000_000_000), null, "tampered");
  assert.equal(readConnectState(null), null);
});

test("Connect Stripe authorize URL carries the shop state", () => {
  process.env.STRIPE_CONNECT_CLIENT_ID = "ca_test_sere";
  process.env.STRIPE_SECRET_KEY = "sk_test_platform";
  assert.equal(stripeConnectEnabled(), true);
  const url = stripeConnectAuthorizeUrl({
    state: "abc.def",
    redirectUri: "https://www.sere.cash/api/integrations/stripe/callback",
  });
  assert.equal(url.startsWith("https://connect.stripe.com/oauth/authorize?"), true);
  assert.equal(url.includes("client_id=ca_test_sere"), true);
  assert.equal(url.includes("scope=read_write"), true);
  assert.equal(url.includes("state=abc.def"), true);
  assert.equal(
    url.includes(encodeURIComponent("https://www.sere.cash/api/integrations/stripe/callback")),
    true,
  );
  delete process.env.STRIPE_CONNECT_CLIENT_ID;
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(stripeConnectEnabled(), false);
});

test("webhook signatures are accepted only when they match and are recent", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = 1_800_000_000;
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(verifyWebhookSignature({ payload, header, secret, nowSeconds: timestamp }), true);
  assert.equal(
    verifyWebhookSignature({ payload, header, secret, nowSeconds: timestamp + 60 }),
    true,
    "inside the five minute window",
  );
  assert.equal(
    verifyWebhookSignature({ payload, header, secret, nowSeconds: timestamp + 3600 }),
    false,
    "a replay from an hour ago is rejected",
  );
  assert.equal(
    verifyWebhookSignature({ payload: `${payload} `, header, secret, nowSeconds: timestamp }),
    false,
    "a changed body is rejected",
  );
  assert.equal(
    verifyWebhookSignature({ payload, header, secret: "whsec_other", nowSeconds: timestamp }),
    false,
    "another shop's secret is rejected",
  );
  assert.equal(verifyWebhookSignature({ payload, header: null, secret }), false);
  assert.equal(verifyWebhookSignature({ payload, header, secret: "" }), false);
});

test("Square webhook signatures match HMAC of notification URL plus body", () => {
  const payload = JSON.stringify({ type: "payment.updated" });
  const notificationUrl = "https://www.sere.cash/api/webhooks/square";
  const signatureKey = "sq_sig_test";
  const signature = createHmac("sha256", signatureKey)
    .update(notificationUrl + payload, "utf8")
    .digest("base64");
  assert.equal(verifySquareSignature({ payload, signature, signatureKey, notificationUrl }), true);
  assert.equal(
    verifySquareSignature({ payload: `${payload} `, signature, signatureKey, notificationUrl }),
    false,
  );
  assert.equal(
    verifySquareSignature({ payload, signature, signatureKey: "other", notificationUrl }),
    false,
  );
  assert.equal(verifySquareSignature({ payload, signature: null, signatureKey, notificationUrl }), false);
});

test("PayPal amounts are two-decimal dollars from integer cents", () => {
  assert.equal(paypalAmount(12900), "129.00");
  assert.equal(paypalAmount(1), "0.01");
  assert.equal(paypalAmount(0), "0.00");
});
