import { createContext, useContext, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveTheme, type Theme, type ThemeScheme } from "./theme";

/** User preference: follow the OS, or pin light/dark. */
export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "rp.theme.mode";

interface ThemeContextValue {
  /** The resolved palette to style with. */
  theme: Theme;
  /** The resolved scheme actually in effect (light | dark). */
  scheme: ThemeScheme;
  /** The user's stored preference (system | light | dark). */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Flip light⇄dark (pins an explicit choice). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Runtime theme provider. Defaults to following the OS appearance, with a
 * persisted manual override (light/dark) set from the in-app toggle. Because the
 * resolved `theme` object identity changes on every switch, screens that build
 * their styles with `useMemo(() => makeStyles(theme), [theme])` re-theme live.
 */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ThemeScheme>(
    Appearance.getColorScheme() === "dark" ? "dark" : "light"
  );

  // Restore the persisted preference once on mount.
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setModeState(v);
    });
  }, []);

  // Track OS light/dark changes (only takes effect while mode === "system").
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === "dark" ? "dark" : "light");
    });
    return () => sub.remove();
  }, []);

  const scheme: ThemeScheme = mode === "system" ? systemScheme : mode;
  const theme = useMemo(() => resolveTheme(scheme), [scheme]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(STORAGE_KEY, m);
  };
  const toggle = () => setMode(scheme === "dark" ? "light" : "dark");

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, scheme, mode, setMode, toggle }),
    [theme, scheme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
