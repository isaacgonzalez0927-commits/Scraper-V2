import assert from "node:assert/strict";
import { test } from "node:test";
import { tradeCopy } from "../lib/business";
import {
  buildSetupGuide,
  isSafeAppPath,
  shopNeedsSetupGuide,
  validateSetupAmount,
  validateSetupEmail,
  validateSetupKey,
  validateSetupName,
  withQuery,
} from "../lib/sere-setup";

const empty = {
  shopName: "Harbor Air",
  shopPhone: "",
  shopEmail: "shop@example.com",
  trade: "hvac",
  customers: 0,
  jobs: 0,
  invoices: 0,
  stripe: false,
};

test("the setup guide is a live checklist of missing shop requirements", () => {
  const voice = tradeCopy("hvac");
  const guide = buildSetupGuide(empty, voice);
  assert.equal(guide.complete, false);
  assert.equal(guide.total, 5);
  assert.equal(guide.done, 1);
  assert.equal(guide.nextId, "customer");
  assert.match(guide.nextLabel || "", /customer/i);
  assert.equal(guide.milestones[0].state, "done");
  assert.equal(guide.milestones[1].state, "open");
  assert.equal(guide.milestones[2].state, "locked");
  assert.equal(guide.milestones[3].state, "locked");
  assert.equal(guide.milestones[4].state, "open");
});

test("later milestones unlock only after the work they depend on exists", () => {
  const voice = tradeCopy("salon");
  const afterClient = buildSetupGuide({ ...empty, trade: "salon", customers: 1 }, voice);
  assert.equal(afterClient.milestones[2].state, "open");
  assert.match(afterClient.milestones[1].title, /client/i);
  assert.equal(afterClient.milestones[3].state, "locked");

  const afterJob = buildSetupGuide({ ...empty, trade: "salon", customers: 1, jobs: 1 }, voice);
  assert.equal(afterJob.milestones[3].state, "open");
  assert.equal(afterJob.nextId, "invoice");
});

test("finishing the book and connecting Stripe completes the guide", () => {
  const voice = tradeCopy("hvac");
  const done = buildSetupGuide(
    { ...empty, customers: 1, jobs: 1, invoices: 1, stripe: true },
    voice,
  );
  assert.equal(done.complete, true);
  assert.equal(done.percent, 100);
  assert.equal(done.nextId, null);
  assert.equal(shopNeedsSetupGuide({ customers: 1, jobs: 1, invoices: 1, stripe: true }), false);
  assert.equal(shopNeedsSetupGuide({ customers: 0, jobs: 0, invoices: 0, stripe: false }), true);
});

test("cash stays available even when the book is empty", () => {
  const guide = buildSetupGuide(empty, tradeCopy("hvac"));
  const cash = guide.milestones.find((item) => item.id === "cash");
  assert.equal(cash?.state, "open");
});

test("instant field checks catch empty names, bad emails, and secret keys", () => {
  assert.equal(validateSetupName(""), "A name is required.");
  assert.equal(validateSetupName("Ada"), "");
  assert.equal(validateSetupEmail(""), "");
  assert.match(validateSetupEmail("not-an-email"), /email/);
  assert.equal(validateSetupEmail("ada@shop.com"), "");
  assert.match(validateSetupAmount("0"), /amount/);
  assert.equal(validateSetupAmount("180"), "");
  assert.match(validateSetupKey("sk_test_123"), /secret/);
  assert.equal(validateSetupKey("rk_test_123"), "");
});

test("setup actions only bounce back to a path inside the shop", () => {
  assert.equal(isSafeAppPath("/overview"), true);
  assert.equal(isSafeAppPath("/jobs?guide=open"), true);
  assert.equal(isSafeAppPath("//evil.example"), false);
  assert.equal(isSafeAppPath("https://evil.example"), false);
  assert.equal(isSafeAppPath("/api/webhooks/stripe"), false);
  assert.equal(withQuery("/overview", "error", "Nope"), "/overview?error=Nope");
});
