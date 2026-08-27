import assert from "node:assert/strict";
import { test } from "node:test";
import { qboDollarsToCents, qboLinkedInvoiceIds } from "../lib/quickbooks";
import { qboInvoiceIsPaid } from "../lib/quickbooks-invoices";
import { parseSereSquareNote, squareInvoiceStatus } from "../lib/square-invoices";
import { describeBookSync } from "../lib/stripe-invoices";
import { encodeParams } from "../lib/stripe";

test("Square invoice statuses map onto the Sere book", () => {
  assert.equal(squareInvoiceStatus("PAID"), "sent");
  assert.equal(squareInvoiceStatus("PARTIALLY_PAID"), "sent");
  assert.equal(squareInvoiceStatus("UNPAID"), "sent");
  assert.equal(squareInvoiceStatus("PUBLISHED"), "sent");
  assert.equal(squareInvoiceStatus("CANCELED"), "void");
  assert.equal(squareInvoiceStatus("DRAFT"), "draft");
  assert.equal(squareInvoiceStatus(""), "draft");
});

test("Square payment notes name the Sere shop, invoice, and customer", () => {
  assert.deepEqual(parseSereSquareNote("sere:12:44:7"), {
    organizationId: 12,
    invoiceId: 44,
    customerId: 7,
  });
  assert.equal(parseSereSquareNote("sere:bad"), null);
  assert.equal(parseSereSquareNote("tip jar"), null);
  assert.equal(parseSereSquareNote(""), null);
});

test("QuickBooks dollars become integer cents", () => {
  assert.equal(qboDollarsToCents(19.99), 1999);
  assert.equal(qboDollarsToCents("10.50"), 1050);
  assert.equal(qboDollarsToCents(0), 0);
  assert.equal(qboDollarsToCents(null), 0);
});

test("QuickBooks payments name the invoices they settled", () => {
  const linked = qboLinkedInvoiceIds({
    Id: "pay-1",
    TotalAmt: 150,
    Line: [
      { Amount: 100, LinkedTxn: [{ TxnId: "inv-9", TxnType: "Invoice" }] },
      { Amount: 50, LinkedTxn: [{ TxnId: "inv-10", TxnType: "Invoice" }] },
      { Amount: 5, LinkedTxn: [{ TxnId: "bill-1", TxnType: "Bill" }] },
    ],
  });
  assert.deepEqual(linked, [
    { id: "inv-9", cents: 10000 },
    { id: "inv-10", cents: 5000 },
  ]);
});

test("a QuickBooks invoice with no remaining balance is paid", () => {
  assert.equal(qboInvoiceIsPaid({ TotalAmt: 200, Balance: 0 }), true);
  assert.equal(qboInvoiceIsPaid({ TotalAmt: 200, Balance: 50 }), false);
  assert.equal(qboInvoiceIsPaid({ TotalAmt: 0, Balance: 0 }), false);
});

test("book sync copy names invoice and payment counts", () => {
  assert.equal(
    describeBookSync("Stripe", { ok: true, invoices: 1, payments: 2 }),
    "Pulled 1 invoice and 2 payments from Stripe into Sere.",
  );
  assert.equal(
    describeBookSync("Square", { ok: true, invoices: 0, payments: 0 }),
    "Pulled 0 invoices and 0 payments from Square into Sere.",
  );
  assert.match(
    describeBookSync("QuickBooks", { ok: false, invoices: 0, payments: 0, error: "token expired" }),
    /token expired/,
  );
});

test("listing Stripe invoices expands line items", () => {
  const encoded = encodeParams({
    limit: 100,
    expand: ["data.lines.data"],
  });
  assert.ok(encoded.includes("limit=100"));
  assert.ok(encoded.includes(`${encodeURIComponent("expand[0]")}=${encodeURIComponent("data.lines.data")}`));
});

test("Integrations offers pull sync from Stripe, Square, and QuickBooks", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/(app)/settings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Sync from Stripe/);
  assert.match(page, /Sync from Square/);
  assert.match(page, /Sync from QuickBooks/);
  assert.match(page, /charge\.succeeded/);
  assert.match(page, /payment_intent\.succeeded/);
  assert.equal(page.includes("Books link only"), false);
});
