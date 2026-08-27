import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canCustomerRespond,
  canEditEstimate,
  estimateStatus,
  estimateTotals,
} from "../lib/estimates";

test("estimate totals use integer cents and cap the discount", () => {
  const total = estimateTotals(
    [
      { quantity: "2.5", unitPriceCents: 1099 },
      { quantity: "1", unitPriceCents: 5000 },
    ],
    500,
    825,
  );
  assert.deepEqual(total, {
    subtotalCents: 7748,
    discountCents: 500,
    taxCents: 598,
    totalCents: 7846,
  });
  assert.deepEqual(estimateTotals([{ quantity: 1, unitPriceCents: 1000 }], 2000, 0), {
    subtotalCents: 1000,
    discountCents: 1000,
    taxCents: 0,
    totalCents: 0,
  });
});

test("estimate lifecycle has stable terminal status precedence", () => {
  assert.equal(estimateStatus({ status: "draft" }), "draft");
  assert.equal(estimateStatus({ status: "draft", sentAt: "2026-01-01" }), "sent");
  assert.equal(estimateStatus({ status: "sent", viewedAt: "2026-01-02" }), "viewed");
  assert.equal(estimateStatus({ status: "viewed", approvedAt: "2026-01-03" }), "approved");
  assert.equal(
    estimateStatus({ status: "approved", approvedAt: "2026-01-03", convertedAt: "2026-01-04" }),
    "converted",
  );
  assert.equal(
    estimateStatus({ status: "converted", convertedAt: "2026-01-04", voidedAt: "2026-01-05" }),
    "void",
  );
});

test("only open customer estimates accept a response", () => {
  assert.equal(canCustomerRespond("sent"), true);
  assert.equal(canCustomerRespond("viewed"), true);
  assert.equal(canCustomerRespond("draft"), false);
  assert.equal(canCustomerRespond("approved"), false);
  assert.equal(canCustomerRespond("declined"), false);
  assert.equal(canCustomerRespond("converted"), false);
  assert.equal(canCustomerRespond("void"), false);
});

test("terminal estimates cannot be edited", () => {
  assert.equal(canEditEstimate("draft"), true);
  assert.equal(canEditEstimate("sent"), true);
  assert.equal(canEditEstimate("viewed"), true);
  assert.equal(canEditEstimate("approved"), false);
  assert.equal(canEditEstimate("declined"), false);
  assert.equal(canEditEstimate("converted"), false);
  assert.equal(canEditEstimate("void"), false);
});
