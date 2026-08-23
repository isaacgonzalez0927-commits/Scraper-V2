import assert from "node:assert/strict";
import { test } from "node:test";
import { NOVA_NAME, NOVA_PATH } from "../lib/nova/operator";
import { isSereIosUserAgent, SERENITY_NAME, SERENITY_PATH } from "../lib/serenity";

test("the shop intelligence is named Serenity", () => {
  assert.equal(SERENITY_NAME, "Serenity");
  assert.equal(SERENITY_PATH, "/serenity");
  assert.equal(NOVA_NAME, "Nova");
  assert.equal(NOVA_PATH, "/nova");
  assert.notEqual(SERENITY_PATH, NOVA_PATH);
});

test("the iOS app identifies itself in the user agent", () => {
  assert.equal(isSereIosUserAgent("Sere-iOS/1.0 (iPhone; iOS 18.0)"), true);
  assert.equal(isSereIosUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"), false);
});
