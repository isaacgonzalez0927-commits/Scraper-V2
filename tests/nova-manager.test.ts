import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseManagerPlan, managerDay, managerCities, managerTrades,
  novaManagerEnabled, type ManagerPlan,
} from "../lib/nova/manager";
import type { OutreachState } from "../lib/nexus/state";
import { filterLead } from "../lib/nexus/lead-filter";
import { humanApprovalMissing } from "../lib/nexus/hands/send";

function state(
  ready = 0,
  queuedByType: Record<string, number> = {},
  byTrade: Array<{ trade: string; sent: number; replies: number }> = [],
): Pick<OutreachState, "pipeline" | "queue" | "learning"> {
  return {
    pipeline: {
      total: 0, byStage: {},
      runway: { ready, researching: 0, needsResearch: 0, contacted: 0, disqualified: 0, cities: [] },
    },
    queue: { queued: Object.values(queuedByType).reduce((a, b) => a + b, 0),
      running: 0, failed: 0, byType: queuedByType },
    learning: { sent: 0, replies: 0, signups: 0, replyRate: "n/a",
      byTrade, winners: [], note: "" },
  };
}

function plan(
  s: Pick<OutreachState, "pipeline" | "queue" | "learning">,
  options: { cities?: string[]; trades?: string[]; previousCities?: string[] } = {},
): ManagerPlan {
  return chooseManagerPlan({
    state: s, cities: options.cities ?? ["Stuart, FL", "Fort Pierce, FL"],
    trades: options.trades ?? ["hvac", "plumbing"],
    previousCities: options.previousCities ?? [],
    objective: "Acquire real paying customers, responsibly.",
  });
}

test("manager day follows New York business day, not the UTC calendar", () => {
  assert.equal(managerDay(new Date("2026-10-26T00:30:00.000Z")), "2026-10-25");
});

test("manager defaults to no paid Places search without explicitly approved cities", () => {
  const chosen = plan(state(), { cities: [] });
  assert.equal(chosen.action, "observe");
  assert.equal(chosen.city, "");
});

test("manager finishes research and drafting backlog before new discovery", () => {
  assert.equal(plan(state(0, { "research.company": 2 })).action, "work_queue");
  assert.equal(plan(state(3)).action, "work_queue");
});

test("manager rotates markets instead of rescraping the same city", () => {
  const chosen = plan(state(), { previousCities: ["Stuart, FL"] });
  assert.equal(chosen.action, "search_leads");
  assert.equal(chosen.city, "Fort Pierce, FL");
});

test("manager favors observed response performance only after adequate samples", () => {
  const chosen = plan(state(0, {}, [
    { trade: "hvac", sent: 25, replies: 1 },
    { trade: "plumbing", sent: 25, replies: 6 },
  ]));
  assert.equal(chosen.trade, "plumbing");
});

test("the manager feature gate is off by default", () => {
  const previous = process.env.NOVA_MANAGER_ENABLED;
  try {
    delete process.env.NOVA_MANAGER_ENABLED;
    assert.equal(novaManagerEnabled(), false);
    process.env.NOVA_MANAGER_ENABLED = "true";
    assert.equal(novaManagerEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.NOVA_MANAGER_ENABLED;
    else process.env.NOVA_MANAGER_ENABLED = previous;
  }
});

test("cities are opt-in and semicolon-delimited to preserve commas", () => {
  const previous = process.env.NOVA_MANAGER_CITIES;
  try {
    delete process.env.NOVA_MANAGER_CITIES;
    assert.deepEqual(managerCities(), []);
    process.env.NOVA_MANAGER_CITIES = "Stuart, FL;Fort Pierce, FL;Stuart, FL";
    assert.deepEqual(managerCities(), ["Stuart, FL", "Fort Pierce, FL"]);
  } finally {
    if (previous === undefined) delete process.env.NOVA_MANAGER_CITIES;
    else process.env.NOVA_MANAGER_CITIES = previous;
  }
});

test("unsupported trades are rejected", () => {
  const previous = process.env.NOVA_MANAGER_TRADES;
  try {
    process.env.NOVA_MANAGER_TRADES = "hvac,unknown,plumbing";
    assert.deepEqual(managerTrades(), ["hvac", "plumbing"]);
  } finally {
    if (previous === undefined) delete process.env.NOVA_MANAGER_TRADES;
    else process.env.NOVA_MANAGER_TRADES = previous;
  }
});

test("Google Places city filter recognizes searches with state abbreviations", () => {
  assert.equal(filterLead({ name: "Air Shop", reviewCount: 10, city: "Fort Myers" }, "Fort Myers FL").ok, true);
  assert.equal(filterLead({ name: "Air Shop", reviewCount: 10, city: "Port St. Lucie" }, "Port Saint Lucie, FL").ok, true);
  assert.equal(filterLead({ name: "Air Shop", reviewCount: 10, city: "Tampa" }, "Fort Myers FL").ok, false);
});

test("AI review alone is not permission to email a stranger", () => {
  assert.equal(humanApprovalMissing(null, true), true);
  assert.equal(humanApprovalMissing("", true), true);
  assert.equal(humanApprovalMissing("2026-10-26T12:00:00Z", true), false);
  assert.equal(humanApprovalMissing(null, false), false);
});
