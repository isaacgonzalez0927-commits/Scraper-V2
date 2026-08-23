import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { novaSystemPrompt, serenitySystemPrompt } from "../lib/nova/chat";
import { getNovaClock, novaClockBlock, NOVA_TZ } from "../lib/nova/clock";
import { dossierHeadline, type Dossier } from "../lib/nova/dossier";
import { memoryBlock } from "../lib/nova/memory";
import { isNovaOperator, NOVA_NAME, NOVA_PATH } from "../lib/nova/operator";
import { NOVA_TOOLS, SERENITY_TOOLS, runNovaTool, toolNames } from "../lib/nova/tools";

const WORDS = {
  trade: "Plumbing",
  job: "Call",
  jobs: "Calls",
  customer: "Customer",
  customers: "Customers",
  worker: "Plumber",
};

function dossier(over: Partial<Dossier> = {}): Dossier {
  return {
    shop: "Harbor Air",
    trade: "HVAC",
    today: "2026-08-20",
    plan: "trial",
    trialDaysLeft: 9,
    money: {
      collectedThisMonth: "$18,420.00",
      invoicedThisMonth: "$22,300.00",
      collectedThisWeek: "$4,180.00",
      outstanding: "$4,810.00",
      overdue: "$1,240.00",
      profitThisMonth: "$6,900.00",
      costsThisMonth: "$11,520.00",
    },
    processors: { stripe: "not connected", square: "not connected", note: "" },
    board: { today: [], tomorrow: [], unscheduled: [], finishedNotInvoiced: [] },
    invoices: { overdue: [], dueSoon: [], drafts: 0 },
    followUps: [],
    ...over,
  };
}

function job(title: string) {
  return { id: 1, title, customer: "Maria", when: "today", status: "scheduled", quoted: "$300.00" };
}

test("the clock is generated per request and names its timezone", () => {
  const at = new Date("2026-08-20T18:30:00.000Z");
  const clock = getNovaClock(at);
  assert.equal(clock.timeZone, NOVA_TZ);
  assert.equal(clock.isoUtc, "2026-08-20T18:30:00.000Z");
  assert.match(clock.isoLocal, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.equal(clock.weekday, "Thursday");

  const block = novaClockBlock(at);
  assert.match(block, /authoritative/i);
  assert.ok(block.includes(NOVA_TZ));
  assert.ok(block.includes(clock.isoUtc));
  assert.ok(block.includes("Thursday"));
});

test("Serenity's prompt is the shop and refuses outreach", () => {
  const prompt = serenitySystemPrompt(WORDS, "Isaac", "Gulf Plumbing");
  assert.ok(prompt.includes("Serenity"));
  assert.match(prompt, /you are not nova/i);
  assert.ok(prompt.includes("Gulf Plumbing"));
  assert.ok(prompt.includes("Isaac"));
  assert.ok(prompt.includes("calls"));
  assert.ok(prompt.includes("plumber"));
  assert.match(prompt, /never invent a figure/i);
  assert.match(prompt, /push back/i);
  assert.match(prompt, /completing one is not billing it/i);
  assert.match(prompt, /do not email/i);
  assert.match(prompt, /never sycophantic/i);
  assert.equal(prompt.includes("find_leads"), false);
  assert.equal(/call outreach/i.test(prompt), false);
  assert.equal(prompt.includes("your other job"), false);
  assert.match(prompt, /do not find leads/i);
});

test("Nova's prompt is outreach and refuses the shop book", () => {
  const prompt = novaSystemPrompt("Isaac");
  assert.match(prompt, /you are Nova/i);
  assert.match(prompt, /you are not Serenity/i);
  assert.match(prompt, /cold outreach/i);
  assert.match(prompt, /find_leads/i);
  assert.match(prompt, /never invent those numbers/i);
  assert.match(prompt, /do not run a shop book/i);
  assert.equal(prompt.includes("Gulf Plumbing"), false);
  assert.equal(/finished but never invoiced/i.test(prompt), false);
  assert.equal(prompt.includes("complete_job"), false);
});

test("Serenity and Nova share only the remember tool", () => {
  const shop = new Set(toolNames(SERENITY_TOOLS));
  const outreach = new Set(toolNames(NOVA_TOOLS));
  assert.deepEqual(
    [...shop].filter((name) => outreach.has(name)),
    ["remember"],
  );
  assert.equal(shop.has("shop"), true);
  assert.equal(shop.has("find_job"), true);
  assert.equal(shop.has("find_leads"), false);
  assert.equal(shop.has("outreach"), false);
  assert.equal(outreach.has("find_leads"), true);
  assert.equal(outreach.has("work"), true);
  assert.equal(outreach.has("outcome"), true);
  assert.equal(outreach.has("shop"), false);
  assert.equal(outreach.has("find_job"), false);
});

test("Nova is operator-only and /nova is not redirected", () => {
  assert.equal(NOVA_NAME, "Nova");
  assert.equal(NOVA_PATH, "/nova");

  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.equal(config.includes('source: "/nova"'), false);
  assert.equal(config.includes("/serenity"), false);

  const prev = {
    VERCEL: process.env.VERCEL,
    NOVA_OPERATOR_EMAIL: process.env.NOVA_OPERATOR_EMAIL,
    SERE_OPERATOR_EMAIL: process.env.SERE_OPERATOR_EMAIL,
    NEXUS_REPLY_TO: process.env.NEXUS_REPLY_TO,
    NEXUS_EMAIL_FROM: process.env.NEXUS_EMAIL_FROM,
  };
  try {
    delete process.env.VERCEL;
    delete process.env.NOVA_OPERATOR_EMAIL;
    delete process.env.SERE_OPERATOR_EMAIL;
    delete process.env.NEXUS_REPLY_TO;
    delete process.env.NEXUS_EMAIL_FROM;
    assert.equal(process.env.NODE_ENV === "production", false);
    assert.equal(isNovaOperator("anyone@shop.com"), true);

    process.env.VERCEL = "1";
    assert.equal(isNovaOperator("anyone@shop.com"), false);

    process.env.NOVA_OPERATOR_EMAIL = "isaac@getsere.com, other@getsere.com";
    assert.equal(isNovaOperator("isaac@getsere.com"), true);
    assert.equal(isNovaOperator("owner@shop.com"), false);

    delete process.env.NOVA_OPERATOR_EMAIL;
    process.env.NEXUS_REPLY_TO = "isaac@getsere.com";
    assert.equal(isNovaOperator("isaac@getsere.com"), true);
    assert.equal(isNovaOperator("owner@shop.com"), false);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("each persona is refused the other person's tools", async () => {
  const shop = await runNovaTool(
    {
      organizationId: 1,
      isDemo: true,
      writable: false,
      now: new Date(),
      persona: "serenity",
    },
    "find_leads",
    "{}",
  );
  assert.match(shop, /Serenity does not run outreach/);

  const outreach = await runNovaTool(
    {
      organizationId: 0,
      isDemo: false,
      writable: true,
      now: new Date(),
      persona: "nova",
    },
    "shop",
    "{}",
  );
  assert.match(outreach, /Nova does not run a shop book/);
});

test("memory renders as a readable block and survives being empty", () => {
  assert.equal(memoryBlock([]), "(nothing yet)");
  const block = memoryBlock([
    {
      id: 1,
      kind: "preference",
      key: "followups.timing",
      content: "Owner calls overdue accounts on Friday mornings.",
      updatedAt: "2026-08-19T10:00:00.000Z",
    },
    {
      id: 2,
      kind: "lesson",
      key: "",
      content: "Coastal Dental always pays late but always pays.",
      updatedAt: "2026-08-18T10:00:00.000Z",
    },
  ]);
  assert.ok(block.includes("[preference] followups.timing: Owner calls"));
  assert.ok(block.includes("[lesson] Coastal Dental"));
});

test("the headline leads with money already earned but never billed", () => {
  const quiet = dossierHeadline(dossier());
  assert.match(quiet, /nothing on the board today/i);
  assert.ok(quiet.includes("$4,180.00"));

  const busy = dossierHeadline(
    dossier({
      board: {
        today: [job("AC swap"), job("Leak")],
        tomorrow: [],
        unscheduled: [],
        finishedNotInvoiced: [job("Coil clean")],
      },
      invoices: {
        overdue: [{ number: "INV-1", customer: "M", amount: "$1", due: "x", status: "overdue" }],
        dueSoon: [],
        drafts: 0,
      },
    }),
  );
  assert.match(busy, /2 jobs today/);
  assert.ok(busy.includes("$1,240.00"), "overdue total is surfaced");
  assert.match(busy, /1 finished but never invoiced/);

  const tomorrowOnly = dossierHeadline(
    dossier({
      board: { today: [], tomorrow: [job("Tune-up")], unscheduled: [], finishedNotInvoiced: [] },
    }),
  );
  assert.match(tomorrowOnly, /nothing today, 1 tomorrow/);
});
