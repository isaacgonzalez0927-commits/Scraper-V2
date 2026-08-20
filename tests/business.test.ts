import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUSINESS_TYPE_KEYS,
  collectDetails,
  filledDetails,
  mergeDetails,
  parseBusinessType,
  parseDetails,
  serializeDetails,
  tradeCopy,
  tradeFieldsFor,
  TRADES,
} from "../lib/business";

test("empty or unknown trade falls back to general", () => {
  assert.equal(parseBusinessType(""), "general");
  assert.equal(parseBusinessType("not-a-trade"), "general");
  assert.equal(parseBusinessType("HVAC"), "hvac");
});

test("each trade has its own words, services, and fields", () => {
  const names = new Set<string>();
  const hints = new Set<string>();
  for (const key of BUSINESS_TYPE_KEYS) {
    const trade = TRADES[key];
    assert.ok(trade.signupHint.length > 12, key);
    assert.ok(trade.services.length >= 6, `${key} services`);
    assert.ok(trade.fields.length >= 5, `${key} fields`);
    assert.ok(trade.suggestions.length >= 3, `${key} suggestions`);
    assert.ok(trade.costCategories.length >= 3, `${key} costs`);
    names.add(trade.name);
    hints.add(trade.signupHint);
    const keys = trade.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${key} duplicate field keys`);
  }
  assert.equal(names.size, BUSINESS_TYPE_KEYS.length);
  assert.equal(hints.size, BUSINESS_TYPE_KEYS.length);
});

test("a salon is not a relabeled HVAC shop", () => {
  const hvac = tradeCopy("hvac");
  const salon = tradeCopy("salon");
  assert.equal(hvac.worker, "Technician");
  assert.equal(salon.worker, "Stylist");
  assert.equal(salon.job, "Appointment");
  assert.equal(salon.customer, "Client");
  assert.ok(hvac.fields.some((f) => f.key === "filter_size"));
  assert.ok(hvac.fields.some((f) => f.key === "outdoor_serial"));
  assert.ok(salon.fields.some((f) => f.key === "formula"));
  assert.ok(!salon.fields.some((f) => f.key === "filter_size"));
  assert.notEqual(hvac.jobPlaceholder, salon.jobPlaceholder);
});

test("auto work orders keep VIN on the customer and mileage on the RO", () => {
  const auto = tradeCopy("auto");
  assert.equal(auto.job, "Work order");
  const customer = tradeFieldsFor("auto", "customer").map((f) => f.key);
  const job = tradeFieldsFor("auto", "job").map((f) => f.key);
  assert.ok(customer.includes("vin"));
  assert.ok(customer.includes("make_model"));
  assert.ok(job.includes("mileage"));
  assert.ok(job.includes("auth"));
});

test("parseDetails keeps string maps and ignores junk", () => {
  assert.deepEqual(parseDetails(""), {});
  assert.deepEqual(parseDetails("not-json"), {});
  assert.deepEqual(parseDetails("[]"), {});
  assert.deepEqual(parseDetails('{"vin":" ABC ","year":2018}'), { vin: "ABC", year: "2018" });
  assert.equal(serializeDetails({ vin: " ABC ", empty: "  " }), '{"vin":"ABC"}');
});

test("collectDetails reads detail_ keys and merge keeps other trades", () => {
  const fields = tradeFieldsFor("hvac", "customer");
  const form = new FormData();
  form.set("detail_filter_size", "16x25x1");
  form.set("detail_outdoor_serial", "  ");
  const incoming = collectDetails(form, fields);
  assert.deepEqual(incoming, { filter_size: "16x25x1" });
  const merged = mergeDetails(
    { vin: "1HGCM82633A004352", filter_size: "20x25x1" },
    fields,
    incoming,
  );
  assert.equal(merged.filter_size, "16x25x1");
  assert.equal(merged.vin, "1HGCM82633A004352");
  assert.equal("outdoor_serial" in merged, false);
});

test("filledDetails only returns what the shop typed", () => {
  const rows = filledDetails(
    { filter_size: "16x25x1" },
    tradeFieldsFor("hvac", "customer"),
  );
  assert.deepEqual(rows, [["Filter size", "16x25x1"]]);
});
