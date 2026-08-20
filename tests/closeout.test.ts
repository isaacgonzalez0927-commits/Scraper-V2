import assert from "node:assert/strict";
import { test } from "node:test";
import { closeoutDueDate, parseCloseout } from "../lib/closeout";

test("closeout requires a completed-work record and a final amount", () => {
  assert.deepEqual(
    parseCloseout({
      workCompleted: " ",
      finalAmount: "420",
      fallbackAmountCents: 0,
    }),
    { ok: false, error: "Say what was completed before closing the job." },
  );
  assert.deepEqual(
    parseCloseout({
      workCompleted: "Changed capacitor",
      finalAmount: "",
      fallbackAmountCents: 0,
    }),
    { ok: false, error: "Enter the final amount to bill." },
  );
});

test("closeout uses the quote when the final field is blank", () => {
  const result = parseCloseout({
    workCompleted: " Replaced failed capacitor and tested cooling. ",
    finalAmount: "",
    fallbackAmountCents: 28500,
    extraCost: "42.17",
    costDescription: "45/5 capacitor",
    costCategory: "materials",
  });
  assert.deepEqual(result, {
    ok: true,
    workCompleted: "Replaced failed capacitor and tested cooling.",
    finalAmountCents: 28500,
    extraCostCents: 4217,
    costDescription: "45/5 capacitor",
    costCategory: "materials",
  });
});

test("an extra cost must say what was bought", () => {
  assert.deepEqual(
    parseCloseout({
      workCompleted: "Cleared drain",
      finalAmount: "225",
      fallbackAmountCents: 0,
      extraCost: "19",
    }),
    { ok: false, error: "Name the part or cost you are adding." },
  );
});

test("invoice terms use calendar days and never go backward", () => {
  assert.equal(closeoutDueDate("2026-08-20", 14), "2026-09-03");
  assert.equal(closeoutDueDate("2026-08-20", -10), "2026-08-20");
});
