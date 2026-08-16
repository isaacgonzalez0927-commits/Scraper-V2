import assert from "node:assert/strict";
import { test } from "node:test";
import {
  centsToInput,
  dollarsToCents,
  formatMoney,
  formatPercent,
  lineAmountCents,
  marginBps,
  taxCents,
} from "../lib/money";

test("dollarsToCents rounds half-up and rejects junk", () => {
  assert.equal(dollarsToCents("10"), 1000);
  assert.equal(dollarsToCents("10.00"), 1000);
  assert.equal(dollarsToCents("$1,234.56"), 123456);
  assert.equal(dollarsToCents("0.1"), 10);
  assert.equal(dollarsToCents("0.105"), 11);
  assert.equal(dollarsToCents(""), 0);
  assert.throws(() => dollarsToCents("nope"));
});

test("formatMoney never uses floats", () => {
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(1), "$0.01");
  assert.equal(formatMoney(840000), "$8,400.00");
  assert.equal(formatMoney(-250), "-$2.50");
  assert.equal(formatMoney(250, true), "+$2.50");
  assert.equal(centsToInput(12900), "129.00");
});

test("line amounts and tax stay in integer cents", () => {
  assert.equal(lineAmountCents("7", 18500), 129500);
  assert.equal(lineAmountCents("1.5", 10000), 15000);
  assert.equal(taxCents(10000, 650), 650);
  assert.equal(taxCents(0, 650), 0);
  assert.equal(marginBps(840000, 565200), 3271);
  assert.equal(formatPercent(3271), "32.71%");
  assert.equal(marginBps(0, 100), null);
});
