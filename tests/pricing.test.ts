import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPlanPrice,
  parsePlanKey,
  PLANS,
  planByKey,
  signupHref,
} from "../lib/pricing";

test("plans get more expensive and more seats as you go up", () => {
  const [shop, crew] = PLANS;
  assert.equal(PLANS.length, 2);
  assert.equal(shop.key, "shop");
  assert.equal(shop.price, 39);
  assert.equal(crew.price, 79);
  assert.ok(shop.seats < crew.seats);
  assert.equal(shop.featured, true);
  assert.equal(formatPlanPrice(shop), "$39");
  assert.ok(shop.cta.toLowerCase().includes("14-day"));
});

test("Shop is the office book; Crew is what $79 should buy", () => {
  const shop = planByKey("shop");
  const crew = planByKey("crew");
  assert.ok(shop?.features.some((f) => /14 days/i.test(f.text)));
  assert.ok(shop?.features.some((f) => /stripe or square/i.test(f.text)));
  assert.ok(shop?.features.some((f) => /does not take a cut/i.test(f.text)));
  assert.ok(!shop?.features.some((f) => f.soon));
  assert.ok(crew?.features.some((f) => f.soon && /on-my-way/i.test(f.text)));
  assert.ok(crew?.features.some((f) => f.soon && /tech's phone/i.test(f.text)));
});

test("unknown plan keys do not invent a product", () => {
  assert.equal(parsePlanKey(""), null);
  assert.equal(parsePlanKey("free"), null);
  assert.equal(parsePlanKey("enterprise"), null);
  assert.equal(planByKey("shop")?.name, "Shop");
  assert.equal(signupHref(PLANS[0]), "/signup?plan=shop");
  assert.equal(signupHref(PLANS[1]), "/signup?plan=crew");
});
