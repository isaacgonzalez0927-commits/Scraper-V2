import assert from "node:assert/strict";
import { test } from "node:test";
import {
  billingMonth,
  creditExhaustedMessage,
  DEFAULT_SHOP_BUDGET_MICROS,
  formatUsdFromMicros,
  ratesForModel,
  shopBudgetMicros,
  USD_MICROS,
  usageCostMicros,
} from "../lib/openai-budget";
import { openaiFromEnv } from "../lib/openai";
import { safeAppPath } from "../lib/auth";

test("billing months are UTC YYYY-MM", () => {
  assert.equal(billingMonth(new Date("2026-08-01T00:00:00.000Z")), "2026-08");
  assert.equal(billingMonth(new Date("2026-12-31T23:59:59.000Z")), "2026-12");
});

test("gpt-4o-mini costs match the published $0.15 / $0.60 per million", () => {
  assert.equal(usageCostMicros("gpt-4o-mini", 1_000_000, 0), 150_000);
  assert.equal(usageCostMicros("gpt-4o-mini", 0, 1_000_000), 600_000);
  assert.equal(usageCostMicros("gpt-4o-mini-2024-07-18", 2_000, 500), 600);
});

test("gpt-4o costs match the published $2.50 / $10 per million", () => {
  assert.equal(usageCostMicros("gpt-4o", 1_000_000, 0), 2_500_000);
  assert.equal(usageCostMicros("gpt-4o", 0, 1_000_000), 10_000_000);
  assert.deepEqual(ratesForModel("gpt-4o-2024-11-20"), ratesForModel("gpt-4o"));
});

test("unknown models are billed at gpt-4o rates so they cannot dodge the cap", () => {
  assert.deepEqual(ratesForModel("some-new-flagship"), ratesForModel("gpt-4o"));
});

test("the default shop credit is $3.00", () => {
  const previous = process.env.OPENAI_SHOP_BUDGET_DOLLARS;
  delete process.env.OPENAI_SHOP_BUDGET_DOLLARS;
  try {
    assert.equal(shopBudgetMicros(), DEFAULT_SHOP_BUDGET_MICROS);
    assert.equal(DEFAULT_SHOP_BUDGET_MICROS, 3 * USD_MICROS);
    assert.equal(formatUsdFromMicros(DEFAULT_SHOP_BUDGET_MICROS), "$3.00");
    assert.match(creditExhaustedMessage({
      month: "2026-08",
      spentMicros: DEFAULT_SHOP_BUDGET_MICROS,
      budgetMicros: DEFAULT_SHOP_BUDGET_MICROS,
      remainingMicros: 0,
      promptTokens: 0,
      completionTokens: 0,
      callCount: 1,
      exhausted: true,
    }), /\$3\.00/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_SHOP_BUDGET_DOLLARS;
    else process.env.OPENAI_SHOP_BUDGET_DOLLARS = previous;
  }
});

test("OPENAI_SHOP_BUDGET_DOLLARS overrides the default credit", () => {
  const previous = process.env.OPENAI_SHOP_BUDGET_DOLLARS;
  process.env.OPENAI_SHOP_BUDGET_DOLLARS = "5";
  try {
    assert.equal(shopBudgetMicros(), 5 * USD_MICROS);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_SHOP_BUDGET_DOLLARS;
    else process.env.OPENAI_SHOP_BUDGET_DOLLARS = previous;
  }
});

test("login next only accepts in-app paths", () => {
  assert.equal(safeAppPath("/jobs"), "/jobs");
  assert.equal(safeAppPath("/settings?tab=account"), "/settings?tab=account");
  assert.equal(safeAppPath("https://evil.test"), "/overview");
  assert.equal(safeAppPath("//evil.test"), "/overview");
  assert.equal(safeAppPath("/login?next=/overview"), "/overview");
  assert.equal(safeAppPath(""), "/overview");
});

test("the operator key can live in OPENAI_API_KEY or NOVA_OPENAI_API_KEY", () => {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NOVA_OPENAI_API_KEY: process.env.NOVA_OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  process.env.NOVA_OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuv";
  try {
    assert.deepEqual(openaiFromEnv(), {
      apiKey: "sk-proj-abcdefghijklmnopqrstuv",
      model: "gpt-4o-mini",
    });
  } finally {
    if (previous.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY;
    if (previous.NOVA_OPENAI_API_KEY === undefined) delete process.env.NOVA_OPENAI_API_KEY;
    else process.env.NOVA_OPENAI_API_KEY = previous.NOVA_OPENAI_API_KEY;
    if (previous.OPENAI_MODEL === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previous.OPENAI_MODEL;
  }
});
