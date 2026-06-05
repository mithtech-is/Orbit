/**
 * Orbit mobile theme — clean & simple, white default, blue accent.
 *
 * Non-breaking contract: every key screens already read (`theme.color.*`,
 * `theme.radius.*`, `theme.spacing.*`, `theme.font.*`) keeps the same name and
 * shape. The extra additive helpers (`gradient`, `glass`, `elevation`,
 * `lightTheme`/`darkTheme`/`resolveTheme`) are optional infrastructure for a
 * future dark toggle and are not required by any current screen.
 */

const lightColor = {
  primary: "#00aaff",
  primaryHover: "#0096e6",
  primaryDeep: "#0082cc",
  primarySoft: "rgba(0, 170, 255, 0.10)",
  primaryBorder: "rgba(0, 170, 255, 0.28)",

  background: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f7f9fb",
  surfaceSunk: "#eef2f6",

  // Kept for the additive helpers; plain surfaces in the simple theme.
  glassBg: "#ffffff",
  glassBorder: "#e5e7eb",

  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  divider: "#f1f3f5",

  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  textOnPrimary: "#ffffff",

  success: "#1ba06f",
  successSoft: "rgba(27, 160, 111, 0.10)",
  warning: "#c2620f",
  warningSoft: "rgba(194, 98, 15, 0.10)",
  danger: "#d32f2f",
  dangerSoft: "rgba(211, 47, 47, 0.08)"
};

const darkColor: typeof lightColor = {
  // Refined near-black with a subtle cool tint + layered elevation (mirrors the
  // web dashboard dark theme), keeping the #00aaff brand accent.
  primary: "#1ab2ff",
  primaryHover: "#45c2ff",
  primaryDeep: "#0a9ae8",
  primarySoft: "rgba(26, 178, 255, 0.16)",
  primaryBorder: "rgba(26, 178, 255, 0.34)",

  background: "#0a0c10",
  surface: "#14171d",
  surfaceMuted: "#10131a",
  surfaceSunk: "#0c0e13",

  glassBg: "#14171d",
  glassBorder: "#222732",

  border: "#222732",
  borderStrong: "#2e3440",
  divider: "#1a1e27",

  textPrimary: "#f1f4f8",
  textSecondary: "#a4adbb",
  textMuted: "#6b7484",
  textOnPrimary: "#04121f",

  success: "#33cc99",
  successSoft: "rgba(51, 204, 153, 0.16)",
  warning: "#ec9a4f",
  warningSoft: "rgba(236, 154, 79, 0.16)",
  danger: "#f06b6b",
  dangerSoft: "rgba(240, 107, 107, 0.14)"
};

const gradient = {
  primary: ["#38d6ff", "#00aaff", "#0082cc"] as const,
  primarySoft: ["rgba(56,214,255,0.12)", "rgba(0,130,204,0.12)"] as const,
  sky: ["#5cdcff", "#00aaff"] as const
};

const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

const elevation = {
  sm: { shadowColor: "#111827", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#111827", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  glow: { shadowColor: "#00aaff", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }
};

function makeFont(c: typeof lightColor) {
  return {
    title: { fontSize: 22, fontWeight: "600" as const, color: c.textPrimary },
    heading: { fontSize: 17, fontWeight: "600" as const, color: c.textPrimary },
    body: { fontSize: 15, fontWeight: "400" as const, color: c.textPrimary },
    bodyStrong: { fontSize: 15, fontWeight: "600" as const, color: c.textPrimary },
    label: { fontSize: 12, fontWeight: "600" as const, color: c.textSecondary, letterSpacing: 0.4 },
    caption: { fontSize: 12, fontWeight: "400" as const, color: c.textSecondary }
  };
}

export type ThemeScheme = "light" | "dark";

function buildTheme(c: typeof lightColor) {
  return {
    color: c,
    gradient,
    glass: { bg: c.glassBg, border: c.glassBorder, blur: 0 },
    radius,
    spacing,
    elevation,
    font: makeFont(c)
  };
}

export const lightTheme = buildTheme(lightColor);
export const darkTheme = buildTheme(darkColor);

/** The shape every screen consumes via `useTheme()` (or the static fallback). */
export type Theme = typeof lightTheme;

/** Pick a palette by scheme. */
export function resolveTheme(scheme: ThemeScheme): Theme {
  return scheme === "dark" ? darkTheme : lightTheme;
}

/**
 * Static fallback — the clean LIGHT theme. Screens that haven't yet been
 * migrated to `useTheme()` keep importing this and stay functional (in light).
 * Prefer `useTheme()` in new/edited screens so the runtime toggle re-themes them.
 */
export const theme = lightTheme;
