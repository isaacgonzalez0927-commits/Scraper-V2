"use client";

import { useEffect, useState } from "react";
import {
  parseThemePref,
  resolvedTheme,
  THEME_DARK_COLOR,
  THEME_KEY,
  THEME_LIGHT_COLOR,
  type ResolvedTheme,
  type ThemePref,
} from "@/lib/theme";

function applyTheme(pref: ThemePref): ResolvedTheme {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolvedTheme(pref, systemDark);
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Private mode. Theme still applies for this tab.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? THEME_DARK_COLOR : THEME_LIGHT_COLOR);
  window.dispatchEvent(new Event("sere-theme"));
  return theme;
}

function readTheme(): { pref: ThemePref; resolved: ResolvedTheme } {
  const pref = parseThemePref(localStorage.getItem(THEME_KEY));
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return { pref, resolved: resolvedTheme(pref, systemDark) };
}

function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = parseThemePref(localStorage.getItem(THEME_KEY));
    setPref(stored);
    setResolved(applyTheme(stored));
    function sync() {
      const next = readTheme();
      setPref(next.pref);
      setResolved(next.resolved);
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystem() {
      const current = parseThemePref(localStorage.getItem(THEME_KEY));
      if (current === "system") applyTheme("system");
    }
    window.addEventListener("sere-theme", sync);
    media.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener("sere-theme", sync);
      media.removeEventListener("change", onSystem);
    };
  }, []);

  function setTheme(next: ThemePref) {
    setPref(next);
    setResolved(applyTheme(next));
  }

  return { pref, resolved, setTheme };
}

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next: ThemePref = resolved === "dark" ? "light" : "dark";
  return (
    <button
      className="icon-btn"
      type="button"
      aria-label={resolved === "dark" ? "Use light mode" : "Use dark mode"}
      title={resolved === "dark" ? "Light mode" : "Dark mode"}
      onClick={() => setTheme(next)}
    >
      {resolved === "dark" ? <SunMark /> : <MoonMark />}
    </button>
  );
}

export function ThemeChooser() {
  const { pref, setTheme } = useTheme();
  return (
    <div className="theme-chooser" role="radiogroup" aria-label="Appearance">
      {([
        ["system", "Match device"],
        ["light", "Light"],
        ["dark", "Dark"],
      ] as const).map(([value, label]) => (
        <label key={value} className={`theme-choice${pref === value ? " on" : ""}`}>
          <input
            type="radio"
            name="sere-theme"
            value={value}
            checked={pref === value}
            onChange={() => setTheme(value)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function MoonMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M15.5 3.5A8.2 8.2 0 1 0 20.5 14.2 6.6 6.6 0 0 1 15.5 3.5z" />
    </svg>
  );
}

function SunMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.5v1.6M12 18.9v1.6M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3.5 12h1.6M18.9 12h1.6M4.9 19.1 6 18M18 6l1.1-1.1" />
    </svg>
  );
}
