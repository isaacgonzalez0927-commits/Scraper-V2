import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectAction,
  collectGroup,
  collectHref,
  describeCollect,
  jobIsUnbilled,
  rankCollectRows,
  collectTotals,
  groupCollectRows,
} from "../lib/collect";
import { invoicePaySmsBody, invoicePayUrl, smsHref, telHref } from "../lib/phone";

test("unbilled means completed work with no live invoice", () => {
  const invoiced = new Set([2]);
  assert.equal(jobIsUnbilled({ id: 1, status: "completed" }, invoiced), true);
  assert.equal(jobIsUnbilled({ id: 2, status: "completed" }, invoiced), false);
  assert.equal(jobIsUnbilled({ id: 3, status: "scheduled" }, invoiced), false);
});

test("Collect ranks past due first, then the biggest amount", () => {
  const ranked = rankCollectRows([
    {
      kind: "draft",
      id: 1,
      customerId: 1,
      customerName: "A",
      phone: "",
      title: "INV-1",
      amountCents: 90000,
      sortAt: "2026-08-01",
    },
    {
      kind: "open",
      id: 2,
      customerId: 2,
      customerName: "B",
      phone: "",
      title: "INV-2",
      amountCents: 5000,
      sortAt: "2026-08-01",
      overdue: true,
    },
    {
      kind: "unbilled",
      id: 3,
      customerId: 3,
      customerName: "C",
      phone: "",
      title: "Coil",
      amountCents: 40000,
      sortAt: "2026-08-02",
    },
  ]);
  assert.equal(ranked[0].kind, "open");
  assert.equal(ranked[0].overdue, true);
  assert.equal(ranked[1].kind, "unbilled");
  assert.equal(ranked[2].kind, "draft");
  assert.equal(collectHref(ranked[1]), "/jobs/3/finish");
  assert.equal(collectAction(ranked[1]), "Bill now");
  assert.equal(collectGroup(ranked[0]), "Past due");
  const groups = groupCollectRows(ranked);
  assert.equal(groups[0].group, "Past due");
});

test("Collect copy names the money sitting outside the bank", () => {
  const totals = collectTotals([
    {
      kind: "unbilled",
      id: 1,
      customerId: 1,
      customerName: "A",
      phone: "",
      title: "Job",
      amountCents: 10000,
      sortAt: "a",
    },
    {
      kind: "open",
      id: 2,
      customerId: 2,
      customerName: "B",
      phone: "",
      title: "INV",
      amountCents: 20000,
      sortAt: "b",
    },
  ]);
  assert.equal(totals.amountCents, 30000);
  assert.equal(totals.unbilled, 1);
  assert.equal(totals.unpaid, 1);
  assert.match(describeCollect(totals), /\$300\.00/);
  assert.match(describeCollect(totals), /1 job never billed/);
  assert.match(describeCollect({ amountCents: 0, unbilled: 0, unpaid: 0, count: 0 }), /Nothing sitting out/);
});

test("pay links use the phone's SMS composer, not a carrier", () => {
  assert.equal(telHref("(239) 555-0100"), "tel:2395550100");
  assert.equal(smsHref("+1 (239) 555-0100", "Pay here"), "sms:+12395550100?body=Pay%20here");
  assert.equal(smsHref("", "x"), "");
  assert.equal(
    invoicePaySmsBody({
      shopName: "Harbor Air",
      number: "INV-1001",
      payUrl: "https://www.sere.cash/p/inv/abc/pay",
    }),
    "Invoice INV-1001 from Harbor Air. Pay here: https://www.sere.cash/p/inv/abc/pay",
  );
  assert.equal(invoicePayUrl("https://www.sere.cash/", "abc"), "https://www.sere.cash/p/inv/abc/pay");
});
