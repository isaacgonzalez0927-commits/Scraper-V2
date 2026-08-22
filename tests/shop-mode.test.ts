import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESK_MODE_NAME,
  leftSandbox,
  modeAfterProcessor,
  parseModeChoice,
  parseShopMode,
  shopModeBanner,
  shopModeLabel,
  stripeKeyEnv,
} from "../lib/shop-mode";

test("blank or unknown modes stay live so existing shops are not sandboxed", () => {
  assert.equal(parseShopMode(undefined), "live");
  assert.equal(parseShopMode(""), "live");
  assert.equal(parseShopMode("other"), "live");
  assert.equal(parseShopMode("sandbox"), "sandbox");
  assert.equal(parseShopMode("desk"), "desk");
});

test("new setup treats a missing mode as sandbox", () => {
  assert.equal(parseShopMode(undefined, "sandbox"), "sandbox");
});

test("Desk mode is the named live-no-integrations path", () => {
  assert.equal(shopModeLabel("desk"), DESK_MODE_NAME);
  assert.match(DESK_MODE_NAME, /desk/i);
  const banner = shopModeBanner("desk");
  assert.match(banner?.body || "", /less useful/i);
  assert.match(banner?.body || "", /will not show cash/i);
});

test("Sandbox banner points at the mode screen", () => {
  const banner = shopModeBanner("sandbox");
  assert.equal(banner?.href, "/mode");
  assert.equal(shopModeBanner("live"), null);
  assert.equal(leftSandbox("sandbox"), false);
  assert.equal(leftSandbox("desk"), true);
  assert.equal(leftSandbox("live"), true);
});

test("a live processor leaves Sandbox and Desk; a test key does not", () => {
  assert.equal(modeAfterProcessor("sandbox", "test"), "sandbox");
  assert.equal(modeAfterProcessor("sandbox", "live"), "live");
  assert.equal(modeAfterProcessor("desk", "live"), "live");
  assert.equal(modeAfterProcessor("desk", "test"), "desk");
  assert.equal(stripeKeyEnv("rk_test_abc"), "test");
  assert.equal(stripeKeyEnv("rk_live_abc"), "live");
  assert.equal(stripeKeyEnv("sk_live_abc"), null);
});

test("the end-of-setup choice is only live or desk", () => {
  assert.equal(parseModeChoice("live"), "live");
  assert.equal(parseModeChoice("desk"), "desk");
  assert.equal(parseModeChoice("sandbox"), null);
});
