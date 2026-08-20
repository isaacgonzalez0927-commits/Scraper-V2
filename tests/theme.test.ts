import assert from "node:assert/strict";
import { test } from "node:test";
import { parseThemePref, resolvedTheme, THEME_BOOT, THEME_KEY } from "../lib/theme";

test("theme preference falls back to the device", () => {
  assert.equal(parseThemePref("dark"), "dark");
  assert.equal(parseThemePref("light"), "light");
  assert.equal(parseThemePref("system"), "system");
  assert.equal(parseThemePref("nope"), "system");
  assert.equal(parseThemePref(null), "system");
});

test("system follows the OS, explicit choices do not", () => {
  assert.equal(resolvedTheme("system", true), "dark");
  assert.equal(resolvedTheme("system", false), "light");
  assert.equal(resolvedTheme("light", true), "light");
  assert.equal(resolvedTheme("dark", false), "dark");
});

test("the boot script reads the stored preference before paint", () => {
  assert.equal(THEME_BOOT.includes(THEME_KEY), true);
  assert.equal(THEME_BOOT.includes("data-theme"), true);
  assert.equal(THEME_BOOT.includes("colorScheme"), true);
});
