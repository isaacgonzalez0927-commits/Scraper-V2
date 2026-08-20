import assert from "node:assert/strict";
import { test } from "node:test";
import { getNovaClock, novaClockBlock, NOVA_TZ } from "../lib/nova/clock";
import { memoryBlock } from "../lib/nova/memory";
import { novaSystemPrompt } from "../lib/nova/chat";
import { dossierHeadline, type Dossier } from "../lib/nova/dossier";

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

test("the prompt speaks the shop's trade and forbids invented numbers", () => {
  const prompt = novaSystemPrompt(WORDS, "Isaac", "Gulf Plumbing");
  assert.ok(prompt.includes("Gulf Plumbing"));
  assert.ok(prompt.includes("Isaac"));
  // A plumber has calls, not jobs.
  assert.ok(prompt.includes("calls"));
  assert.ok(prompt.includes("plumber"));
  assert.match(prompt, /never invent a figure/i);
  assert.match(prompt, /push back/i);
  assert.match(prompt, /completing one is not billing it/i);
  assert.match(prompt, /do not email/i);
  // Tone rails carried over from RideBy's Nova.
  assert.match(prompt, /never sycophantic/i);
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
      invoices: { overdue: [{ number: "INV-1", customer: "M", amount: "$1", due: "x", status: "overdue" }], dueSoon: [], drafts: 0 },
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
