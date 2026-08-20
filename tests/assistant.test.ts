import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAssistant, parseWhen, stampAt } from "../lib/assistant";
import { parseBusinessType, tradeCopy } from "../lib/business";

test("unknown trades fall back to general contractor", () => {
  assert.equal(parseBusinessType("plumbing"), "plumbing");
  assert.equal(parseBusinessType("nope"), "general");
  assert.equal(parseBusinessType(""), "general");
  assert.equal(parseBusinessType(undefined), "general");
  assert.equal(tradeCopy("salon").worker, "Stylist");
  assert.equal(tradeCopy("hvac").services.length > 0, true);
});

test("date phrases resolve to a 9am stamp unless a time is given", () => {
  const now = new Date(2026, 7, 19, 15, 0, 0); // Wednesday
  assert.equal(parseWhen("tomorrow", now), stampAt(new Date(2026, 7, 20), 9, 0));
  assert.equal(parseWhen("friday", now), stampAt(new Date(2026, 7, 21), 9, 0));
  assert.equal(parseWhen("friday at 2pm", now), stampAt(new Date(2026, 7, 21), 14, 0));
  assert.equal(parseWhen("2026-08-25", now), stampAt(new Date(2026, 7, 25), 9, 0));
  assert.equal(parseWhen("aug 21", now), stampAt(new Date(2026, 7, 21), 9, 0));
  assert.equal(parseWhen("not a date", now), null);
});

test("assistant intents cover brief, cash, overdue, and reschedule", () => {
  const now = new Date(2026, 7, 19, 15, 0, 0);
  assert.equal(parseAssistant("catch me up", now).kind, "brief");
  assert.equal(parseAssistant("show overdue invoices", now).kind, "invoices");
  assert.equal(parseAssistant("jobs today", now).kind, "jobs");
  assert.equal(parseAssistant("how much cash came in", now).kind, "cash");
  const moved = parseAssistant("move the Johnson AC job to Friday", now);
  assert.equal(moved.kind, "reschedule");
  if (moved.kind === "reschedule") {
    assert.equal(moved.query.includes("johnson"), true);
    assert.equal(moved.when.startsWith("2026-08-21"), true);
  }
  const done = parseAssistant("mark the leak repair complete", now);
  assert.equal(done.kind, "complete");
  if (done.kind === "complete") assert.equal(done.query.includes("leak"), true);
});
