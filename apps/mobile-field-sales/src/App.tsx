import type { JSX } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "./theme-context";
import { AppNavigator } from "./navigation/AppNavigator";
import { asyncStorageTokenStore } from "./auth/async-storage-token-store";
import { apiClient } from "./api-service";
import {
  probeForegroundLocationPermission,
  probeBackgroundLocationPermission,
  getCurrentPosition
} from "./tracking/location-probes";

/**
 * Default platform probes wired to expo-location (foreground/background
 * permission state + GPS read) and the backend session API.
 *
 * Permission REQUESTS — as opposed to probes — must be initiated by the UI via
 * `requestForegroundLocationPermission` / `requestBackgroundLocationPermission`
 * (in tracking/location-probes.ts), driven by the `nextRequest` field of the
 * TrackingDecision returned by `useTrackingConsent`.
 */
const defaultProbes = {
  async loadConsent(): Promise<boolean> {
    try {
      const sessions = await apiClient.listSessions();
      return sessions.items.some((s) => s.status === "active");
    } catch {
      return false;
    }
  },
  async loadSessionState() {
    try {
      const sessions = await apiClient.listSessions();
      return sessions.items.some((s) => s.status === "active") ? "active" as const : "not_started" as const;
    } catch {
      return "not_started" as const;
    }
  },
  foreground: probeForegroundLocationPermission,
  background: probeBackgroundLocationPermission,
  getCurrentPosition
};

export function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Inside the provider so the status bar follows the active scheme. */
function ThemedRoot(): JSX.Element {
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AppNavigator storage={asyncStorageTokenStore} probes={defaultProbes} />
    </>
  );
}
