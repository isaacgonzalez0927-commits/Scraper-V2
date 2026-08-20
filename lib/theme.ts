export const THEME_KEY = "sere-theme";
export const THEME_DARK_COLOR = "#0e1218";
export const THEME_LIGHT_COLOR = "#ffffff";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function parseThemePref(value: string | null | undefined): ThemePref {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function resolvedTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/**
 * Runs before paint so the first frame is already the right theme.
 * Keep this a classic script: no imports, no JSX.
 */
export const THEME_BOOT = `(function(){
  var pref = "system";
  try { pref = localStorage.getItem("${THEME_KEY}") || "system"; } catch (e) {}
  var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var dark = pref === "dark" || (pref !== "light" && systemDark);
  var theme = dark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
})();`;
