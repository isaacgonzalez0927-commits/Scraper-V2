import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addTrialDays,
  daysLeft,
  shopAccess,
  TRIAL_DAYS,
  trialEndsISO,
} from "../lib/trial";

const now = new Date("2026-08-20T15:00:00.000Z");

test("a trial runs fourteen days and then freezes", () => {
  const ends = addTrialDays(now, TRIAL_DAYS);
  assert.equal(ends.toISOString(), "2026-09-03T15:00:00.000Z");
  assert.equal(trialEndsISO(now), ends.toISOString());
  const open = shopAccess({ plan: "trial", trialEndsAt: ends.toISOString() }, false, now);
  assert.equal(open.frozen, false);
  assert.equal(open.status, "trial");
  assert.equal(open.daysLeft, 14);
  assert.equal(open.banner, "14 days left in your trial.");
  const last = shopAccess(
    { plan: "trial", trialEndsAt: ends.toISOString() },
    false,
    new Date("2026-09-02T16:00:00.000Z"),
  );
  assert.equal(last.frozen, false);
  assert.equal(last.daysLeft, 1);
  assert.equal(last.banner, "Last day of your trial.");
  const frozen = shopAccess(
    { plan: "trial", trialEndsAt: ends.toISOString() },
    false,
    new Date("2026-09-03T15:00:00.000Z"),
  );
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.status, "expired");
  assert.equal(frozen.daysLeft, 0);
  assert.match(frozen.block, /look, not add/i);
});

test("Harbor Air and paid shops are never on a trial clock", () => {
  const ends = trialEndsISO(now);
  const demo = shopAccess({ plan: "trial", trialEndsAt: ends }, true, now);
  assert.equal(demo.frozen, false);
  assert.equal(demo.status, "demo");
  assert.equal(demo.banner, "");
  const shop = shopAccess({ plan: "shop", trialEndsAt: "" }, false, now);
  assert.equal(shop.frozen, false);
  assert.equal(shop.status, "paid");
  const crew = shopAccess({ plan: "crew", trialEndsAt: ends }, false, addTrialDays(now, 30));
  assert.equal(crew.frozen, false);
  assert.equal(crew.status, "paid");
});

test("days left rounds up to a whole day", () => {
  const ends = new Date("2026-08-21T15:00:00.000Z");
  assert.equal(daysLeft(ends, now), 1);
  assert.equal(daysLeft(ends, ends), 0);
  assert.equal(daysLeft(now, ends), 0);
});
