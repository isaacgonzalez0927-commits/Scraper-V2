import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutRailOrder } from "../lib/checkout";
import { invoicePagePath, invoicePayPath, invoicePayUrl } from "../lib/phone";

test("the pay link goes to checkout, not the invoice sheet", () => {
  assert.equal(invoicePagePath("abc"), "/p/inv/abc");
  assert.equal(invoicePayPath("abc"), "/p/inv/abc/pay");
  assert.equal(invoicePayUrl("https://www.sere.cash/", "abc"), "https://www.sere.cash/p/inv/abc/pay");
});

test("checkout uses Stripe first, then Square, then PayPal", () => {
  assert.deepEqual(checkoutRailOrder({ stripe: true, square: true, paypal: true }), [
    "stripe",
    "square",
    "paypal",
  ]);
  assert.deepEqual(checkoutRailOrder({ stripe: false, square: true, paypal: false }), ["square"]);
  assert.deepEqual(checkoutRailOrder({ stripe: false, square: false, paypal: false }), []);
});

test("the public invoice says Pay, not a processor name", async () => {
  const { readFile } = await import("node:fs/promises");
  const sheet = await readFile(new URL("../components/InvoiceSheet.tsx", import.meta.url), "utf8");
  assert.match(sheet, />\s*Pay\s*</);
  assert.match(sheet, /invoicePayPath/);
  assert.equal(sheet.includes("Pay with Stripe"), false);
  assert.equal(sheet.includes("Pay with Square"), false);
  assert.equal(sheet.includes("Pay with PayPal"), false);
  assert.equal(sheet.includes("Pay with QuickBooks"), false);
});
