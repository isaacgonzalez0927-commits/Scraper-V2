import assert from "node:assert/strict";
import { test } from "node:test";
import { tradeCopy } from "../lib/business";
import {
  sereHowItWorks,
  sereSetupSteps,
  shopNeedsSetupGuide,
} from "../lib/sere-setup";

test("the Sere tutorial explains the book before asking for setup clicks", () => {
  const voice = tradeCopy("hvac");
  const ideas = sereHowItWorks(voice);
  assert.equal(ideas.length, 4);
  assert.match(ideas[0], /customer/i);
  assert.match(ideas[0], /job/i);
  assert.match(ideas[0], /invoice/i);
  assert.match(ideas[0], /payment/i);
  assert.match(ideas[1], /zero/);
  assert.match(ideas[2], /Overview/);
  assert.match(ideas[2], /Stripe/);
});

test("setup steps use the trade's words and land on real screens", () => {
  const hvac = sereSetupSteps(tradeCopy("hvac"));
  assert.equal(hvac[0].action, "New customer");
  assert.equal(hvac[0].href, "/customers/new");
  assert.match(hvac[0].body, /customer/i);
  assert.equal(hvac[1].action, "New job");
  assert.equal(hvac[1].href, "/jobs/new");
  assert.equal(hvac[4].href, "/settings?tab=integrations#stripe");

  const salon = sereSetupSteps(tradeCopy("salon"));
  assert.match(salon[0].body, /client/i);
});

test("an empty shop still needs the setup guide", () => {
  assert.equal(shopNeedsSetupGuide({ customers: 0, jobs: 0, invoices: 0 }), true);
  assert.equal(shopNeedsSetupGuide({ customers: 2, jobs: 0, invoices: 0 }), true);
  assert.equal(shopNeedsSetupGuide({ customers: 1, jobs: 1, invoices: 0 }), false);
  assert.equal(shopNeedsSetupGuide({ customers: 1, jobs: 0, invoices: 1 }), false);
});
