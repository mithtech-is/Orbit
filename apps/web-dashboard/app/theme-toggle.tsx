"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "orbit_theme";

/**
 * Resolves the theme. Default is always LIGHT (white) — dark mode is opt-in only
 * via the toggle, so the OS preference is intentionally NOT consulted.
 */
function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Dark/light theme toggle. Flips `data-theme` on <html> (the whole glassmorphism
 * palette is driven by CSS variables scoped to [data-theme="dark"]), persists the
 * choice, and respects the OS preference on first load. Pure presentation — no
 * app data or logic is touched.
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>("light");

  // Apply the resolved theme as early as possible on mount.
  useEffect(() => {
    const initial = resolveInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }

  const isDark = theme === "dark";
  return (
    <button
      className="themeToggle"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <span aria-hidden>{isDark ? "☀️" : "🌙"}</span>
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
