import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceCents, deriveStatus, totalsFromLines } from "../lib/finance";

test("invoice totals use integer cents and cap discount", () => {
  const calc = totalsFromLines(
    [
      { quantity: "1", unitPriceCents: 780000 },
      { quantity: "1", unitPriceCents: 34900 },
    ],
    500,
    650,
  );
  assert.equal(calc.subtotalCents, 814900);
  assert.equal(calc.discountCents, 500);
  assert.equal(calc.taxCents, 52936);
  assert.equal(calc.totalCents, 867336);
  const capped = totalsFromLines([{ quantity: "1", unitPriceCents: 1000 }], 5000, 0);
  assert.equal(capped.discountCents, 1000);
  assert.equal(capped.totalCents, 0);
});

test("paid is only when remaining is zero", () => {
  const base = {
    status: "sent",
    voidedAt: null,
    sentAt: "2026-01-01",
    viewedAt: null,
    dueDate: "2026-12-31",
    totalCents: 10000,
    today: "2026-06-01",
  };
  assert.equal(deriveStatus({ ...base, paidCents: 0 }), "sent");
  assert.equal(deriveStatus({ ...base, paidCents: 4000 }), "partial");
  assert.equal(deriveStatus({ ...base, paidCents: 10000 }), "paid");
  assert.equal(deriveStatus({ ...base, paidCents: 9999 }), "partial");
  assert.equal(balanceCents(10000, 4000, "partial"), 6000);
  assert.equal(balanceCents(10000, 10000, "paid"), 0);
});

test("overdue and void win over other statuses", () => {
  assert.equal(
    deriveStatus({
      status: "sent",
      voidedAt: null,
      sentAt: "2026-01-01",
      viewedAt: null,
      dueDate: "2026-01-02",
      totalCents: 5000,
      paidCents: 0,
      today: "2026-01-03",
    }),
    "overdue",
  );
  assert.equal(
    deriveStatus({
      status: "partial",
      voidedAt: null,
      sentAt: "2026-01-01",
      viewedAt: "2026-01-02",
      dueDate: "2026-01-02",
      totalCents: 5000,
      paidCents: 1000,
      today: "2026-01-03",
    }),
    "overdue",
  );
  assert.equal(
    deriveStatus({
      status: "sent",
      voidedAt: "2026-01-04",
      sentAt: "2026-01-01",
      viewedAt: null,
      dueDate: "2026-01-02",
      totalCents: 5000,
      paidCents: 0,
      today: "2026-01-05",
    }),
    "void",
  );
  assert.equal(balanceCents(5000, 0, "void"), 0);
});

test("draft stays draft until sent or paid", () => {
  assert.equal(
    deriveStatus({
      status: "draft",
      voidedAt: null,
      sentAt: null,
      viewedAt: null,
      dueDate: "2026-01-01",
      totalCents: 1000,
      paidCents: 0,
      today: "2026-06-01",
    }),
    "draft",
  );
});
