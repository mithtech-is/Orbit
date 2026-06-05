import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role, WorkSessionState } from "@orbit/shared-types";
import {
  decideTracking,
  type BackgroundPermission,
  type ForegroundPermission,
  type TrackingDecision
} from "./consent-policy";

export interface UseTrackingConsentInput {
  role: Role;
  /** Read-through to the backend consent ledger; supply on session refresh. */
  loadConsent: () => Promise<boolean>;
  /** Read-through to `apiClient.listSessions()` filtered to "is the current rep's session active?". */
  loadSessionState: () => Promise<WorkSessionState>;
  /** Platform-level foreground permission probe (e.g., expo-location's `getForegroundPermissionsAsync`). */
  probeForegroundPermission: () => Promise<ForegroundPermission>;
  /** Platform-level background permission probe. Must NEVER request — only probe. */
  probeBackgroundPermission: () => Promise<BackgroundPermission>;
}

export interface UseTrackingConsentResult {
  decision: TrackingDecision;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * React hook that composes consent + session state + permission status into a
 * single TrackingDecision. Pure side effects only — does not request permissions
 * itself; the UI is responsible for prompting based on `decision.nextRequest`.
 */
export function useTrackingConsent(input: UseTrackingConsentInput): UseTrackingConsentResult {
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<WorkSessionState>("not_started");
  const [fg, setFg] = useState<ForegroundPermission>("unknown");
  const [bg, setBg] = useState<BackgroundPermission>("not_requested");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, f, b] = await Promise.all([
        input.loadConsent(),
        input.loadSessionState(),
        input.probeForegroundPermission(),
        input.probeBackgroundPermission()
      ]);
      setConsent(c);
      setSession(s);
      setFg(f);
      setBg(b);
    } finally {
      setLoading(false);
    }
  }, [input]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decision = useMemo(
    () =>
      decideTracking({
        role: input.role,
        consentAccepted: consent,
        workSessionState: session,
        foregroundPermission: fg,
        backgroundPermission: bg
      }),
    [input.role, consent, session, fg, bg]
  );

  return { decision, loading, refresh };
}
