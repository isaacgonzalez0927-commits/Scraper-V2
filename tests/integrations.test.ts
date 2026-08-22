import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/crypto";
import { csvCell, csvFileName, csvTable } from "../lib/csv";
import { DEFAULT_OPENAI_MODEL, looksLikeOpenAIKey, openaiFromEnv } from "../lib/openai";
import { encodeParams, looksLikeStripeSecret, readConnectState, signConnectState, stripeConnectAuthorizeUrl, stripeConnectEnabled, verifyWebhookSignature, usdCents, chargeNetCents } from "../lib/stripe";
import { paypalAmount } from "../lib/paypal";
import { squarePaymentNetCents, verifySquareSignature } from "../lib/square";

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

test("Stripe cash sums the USD balance and net charges", () => {
  assert.equal(usdCents([{ amount: 18420, currency: "usd" }]), 18420);
  assert.equal(
    usdCents([
      { amount: 500, currency: "eur" },
      { amount: 2200, currency: "usd" },
    ]),
    2200,
  );
  assert.equal(chargeNetCents({ amount: 10000, amount_refunded: 1500, status: "succeeded" }), 8500);
  assert.equal(chargeNetCents({ amount: 10000, status: "failed" }), 0);
});

test("Stripe restricted keys are recognised; full secret keys are not accepted for connect", () => {
  assert.equal(looksLikeStripeSecret("rk_live_abc"), true);
  assert.equal(looksLikeStripeSecret("rk_test_abc"), true);
  assert.equal(looksLikeStripeSecret("sk_live_abc"), true);
  assert.equal(looksLikeStripeSecret(" pk_live_abc"), false);
  assert.equal(looksLikeStripeSecret(""), false);
});

test("Sere connect flow requires restricted keys, not secret keys", async () => {
  const { looksLikeStripeRestrictedKey, isStripeFullSecretKey, restrictedKeyRequiredMessage } =
    await import("../lib/stripe-keys");
  assert.equal(looksLikeStripeRestrictedKey("rk_live_abc"), true);
  assert.equal(looksLikeStripeRestrictedKey("sk_live_abc"), false);
  assert.equal(isStripeFullSecretKey("sk_test_abc"), true);
  assert.match(restrictedKeyRequiredMessage(), /restricted keys/i);

  const rejected = await (
    await import("../lib/stripe-keys")
  ).validateStripeKeyForSere("sk_live_51NotARealKeyAtAll0000");
  assert.equal(rejected.ok, false);
  assert.match(rejected.problems[0], /restricted keys/i);
});

test("Square cash nets completed payments minus refunds", () => {
  assert.equal(
    squarePaymentNetCents({
      status: "COMPLETED",
      amount_money: { amount: 10000 },
      refunded_money: { amount: 1500 },
    }),
    8500,
  );
  assert.equal(squarePaymentNetCents({ status: "FAILED", amount_money: { amount: 10000 } }), 0);
  assert.equal(squarePaymentNetCents({ status: "COMPLETED", amount_money: { amount: 4200 } }), 4200);
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

test("OpenAI keys are recognised and Stripe secrets are rejected", () => {
  assert.equal(looksLikeOpenAIKey("sk-proj-abcdefghijklmnopqrstuv"), true);
  assert.equal(looksLikeOpenAIKey("sk-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(looksLikeOpenAIKey("sk_live_abc"), false);
  assert.equal(looksLikeOpenAIKey("sk-short"), false);
  assert.equal(looksLikeOpenAIKey(""), false);
});

test("a deployment OPENAI_API_KEY turns the assistant on without a shop paste", () => {
  const previous = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuv";
  delete process.env.OPENAI_MODEL;
  assert.deepEqual(openaiFromEnv(), {
    apiKey: "sk-proj-abcdefghijklmnopqrstuv",
    model: DEFAULT_OPENAI_MODEL,
  });
  process.env.OPENAI_API_KEY = "sk_live_not_openai";
  assert.equal(openaiFromEnv(), null);
  if (previous === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
  if (previousModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousModel;
});

test("CSV cells quote commas and quotes", () => {
  assert.equal(csvCell("Harbor Air"), "Harbor Air");
  assert.equal(csvCell("AC, leak"), '"AC, leak"');
  assert.equal(csvCell('He said "ok"'), '"He said ""ok"""');
  assert.equal(csvFileName("payments", "2026-08-20"), "sere-payments-2026-08-20.csv");
  const table = csvTable(["Name", "Amount"], [["Riverside, LLC", "120.00"]]);
  assert.equal(table.startsWith("\uFEFF"), true);
  assert.equal(table.includes('"Riverside, LLC"'), true);
});
