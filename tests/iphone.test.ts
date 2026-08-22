import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IPHONE_DEMO_HREF,
  IPHONE_OPEN_HREF,
  IPHONE_PATH,
  IPHONE_START_URL,
  IPHONE_STORE_URL,
  iphoneCopy,
  iphoneHomeScreenSteps,
} from "../lib/iphone";

test("iPhone is a web link until the App Store listing exists", () => {
  assert.equal(IPHONE_PATH, "/iphone");
  assert.equal(IPHONE_OPEN_HREF, "/login");
  assert.equal(IPHONE_DEMO_HREF, "/demo");
  assert.equal(IPHONE_START_URL, "https://www.sere.cash");
  assert.equal(IPHONE_STORE_URL, "");
});

test("the iPhone page tells people to add Sere from Safari", () => {
  const text = [...iphoneCopy(), ...iphoneHomeScreenSteps()].join("\n");
  assert.match(text, /Open Sere/);
  assert.match(text, /Safari/);
  assert.match(text, /Add to Home Screen/);
  assert.match(text, /wrapper/i);
  assert.match(text, /do not need Xcode/i);
  assert.equal(text.includes("—"), false);
});
