import assert from "node:assert/strict";
import { test } from "node:test";
import { tradeCopy } from "../lib/business";
import {
  inferSetupStep,
  isSetupConnectReturn,
  nextSetupStep,
  prevSetupStep,
  resolveSetupStep,
  setupHref,
  setupPath,
  setupPurposeChoices,
  setupResume,
  shopNeedsSetupGuide,
} from "../lib/sere-setup";

test("setup stays on /setup and never sends you to another page to continue", () => {
  assert.equal(setupHref("customer"), "/setup?step=customer");
  assert.equal(setupHref("cash", "cash"), "/setup?step=cash&intent=cash");
  assert.equal(setupHref("done", "book"), "/setup?step=done&intent=book");
  assert.match(setupHref("job", "both"), /^\/setup\?/);
});

test("the first question shortens the remaining screens the way Stripe does", () => {
  assert.deepEqual(setupPath("cash"), ["purpose", "cash", "done"]);
  assert.deepEqual(setupPath("book"), ["purpose", "customer", "job", "done"]);
  assert.equal(nextSetupStep("purpose", "cash"), "cash");
  assert.equal(nextSetupStep("purpose", "both"), "customer");
  assert.equal(nextSetupStep("job", "book"), "done");
  assert.equal(prevSetupStep("cash", "cash"), "purpose");
  assert.equal(prevSetupStep("cash", "both"), "job");
});

test("purpose choices use the trade's words", () => {
  const salon = setupPurposeChoices(tradeCopy("salon"));
  assert.equal(salon.length, 3);
  assert.match(salon[0].body, /client/i);
  const hvac = setupPurposeChoices(tradeCopy("hvac"));
  assert.match(hvac[0].body, /customer/i);
  assert.match(hvac[0].body, /job/i);
});

test("the wizard will not ask for a job before a customer exists", () => {
  assert.equal(resolveSetupStep("job", { customers: 0, jobs: 0, stripe: false }), "customer");
  assert.equal(resolveSetupStep("cash", { customers: 0, jobs: 0, stripe: false }), "cash");
  assert.equal(inferSetupStep({ customers: 0, jobs: 0, stripe: false }), "purpose");
  assert.equal(inferSetupStep({ customers: 1, jobs: 0, stripe: false }), "job");
  assert.equal(inferSetupStep({ customers: 1, jobs: 1, stripe: false }), "cash");
  assert.equal(inferSetupStep({ customers: 1, jobs: 1, stripe: true }), "done");
});

test("an empty shop still needs the setup guide", () => {
  assert.equal(shopNeedsSetupGuide({ customers: 0, jobs: 0, invoices: 0 }), true);
  assert.equal(shopNeedsSetupGuide({ customers: 2, jobs: 0, invoices: 0 }), true);
  assert.equal(shopNeedsSetupGuide({ customers: 1, jobs: 1, invoices: 0 }), false);
  assert.equal(shopNeedsSetupGuide({ customers: 1, jobs: 0, invoices: 1 }), false);
});

test("overview resume points back into the wizard, not a list of app links", () => {
  const empty = setupResume({ customers: 0, jobs: 0, invoices: 0, stripe: false });
  assert.ok(empty);
  assert.equal(empty.href, "/setup?step=purpose");
  const cash = setupResume({ customers: 1, jobs: 1, invoices: 1, stripe: false });
  assert.ok(cash);
  assert.equal(cash.href, "/setup?step=cash");
  assert.equal(setupResume({ customers: 1, jobs: 1, invoices: 1, stripe: true }), null);
});

test("setup is an allowed Stripe connect return and open redirects are not", () => {
  assert.equal(isSetupConnectReturn("/setup?step=done"), true);
  assert.equal(isSetupConnectReturn("/setup?step=cash&intent=cash"), true);
  assert.equal(isSetupConnectReturn("/setup?step=done&next=https://evil.example"), false);
  assert.equal(isSetupConnectReturn("/settings?tab=integrations"), false);
  assert.equal(isSetupConnectReturn("https://sere.cash/setup?step=done"), false);
});
