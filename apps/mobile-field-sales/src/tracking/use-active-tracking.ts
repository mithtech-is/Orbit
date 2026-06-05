import { useEffect, useRef } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { apiClient } from "../api-service";
import { probeForegroundLocationPermission } from "./location-probes";

interface Options {
  enabled: boolean;
  userId?: string;
  /** Minimum seconds between pings. */
  intervalSeconds?: number;
  /** Minimum metres of movement to fire a new ping (filter). */
  distanceMeters?: number;
}

const DEFAULT_INTERVAL_SEC = 20;
const DEFAULT_DISTANCE_M = 15;

/**
 * Foreground GPS streamer: while a work session is active for the signed-in
 * rep and the app is in the foreground, this hook subscribes to
 * `Location.watchPositionAsync` and POSTs each position to the backend as a
 * single-ping batch (`POST /api/v1/tracking action=record_pings`). The backend
 * then broadcasts via WebSocket to the manager's live map.
 *
 * Background tracking is NOT handled here — it requires a foreground service
 * which is unavailable in Expo Go. A future EAS dev-client build can register
 * a TaskManager task that keeps emitting while the app is backgrounded.
 *
 * Polls /api/v1/tracking every 30s to detect remote start/stop events (the
 * Home screen's Start button is one source; another tab could be another).
 */
export function useActiveTracking({
  enabled,
  userId,
  intervalSeconds = DEFAULT_INTERVAL_SEC,
  distanceMeters = DEFAULT_DISTANCE_M
}: Options): void {
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const sessionActiveRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const inFlightRef = useRef(false);
  const lastEmitMsRef = useRef(0);

  // Watch app foreground/background so we don't hammer the location API when
  // the user is on another app. Expo Go can't keep us alive in background
  // anyway, so this is correctness for foreground-only mode.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // Poll session state. When we see ours is active, start the watcher. When
  // it goes inactive, stop it.
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      try {
        const sessions = await apiClient.listSessions();
        const mine = sessions.items.find((s) => s.userId === userId && s.status === "active");
        const nowActive = Boolean(mine);
        if (nowActive !== sessionActiveRef.current) {
          sessionActiveRef.current = nowActive;
          if (nowActive) await startWatcher();
          else await stopWatcher();
        }
      } catch {
        // Network errors during polling don't matter — next tick retries.
      }
    }

    async function startWatcher() {
      if (watcherRef.current) return;
      const perm = await probeForegroundLocationPermission();
      if (perm !== "granted") {
        // Permission denied → can't watch. The Home screen / More tab still
        // owns the request UI; we don't re-prompt here to avoid loop spam.
        return;
      }
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: intervalSeconds * 1000,
            distanceInterval: distanceMeters
          },
          (position) => {
            if (appStateRef.current !== "active") return;
            void emitPing(position);
          }
        );
        watcherRef.current = sub;
      } catch {
        watcherRef.current = null;
      }
    }

    // Heartbeat: when the rep is standing still, `distanceInterval` filters
    // out every watcher fire, so the live map would age them to "stale" after
    // 5 min. Force a fresh `getCurrentPositionAsync` every 2x the interval if
    // no ping has gone out — keeps the marker visibly fresh without spamming.
    async function heartbeat() {
      if (appStateRef.current !== "active" || !sessionActiveRef.current) return;
      const sinceMs = Date.now() - lastEmitMsRef.current;
      if (sinceMs < intervalSeconds * 1000 * 2) return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await emitPing(pos);
      } catch {
        // ignore — next heartbeat retries
      }
    }

    async function stopWatcher() {
      const sub = watcherRef.current;
      watcherRef.current = null;
      if (sub) sub.remove();
    }

    // Mid-shift guard: if the rep turns OFF location permission or device GPS
    // while a session is active, end the session — otherwise the app would keep
    // claiming "Location sharing on" while nothing reaches the manager.
    async function enforceLocationOrStop() {
      if (!sessionActiveRef.current) return;
      const perm = await probeForegroundLocationPermission();
      const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
      if (perm === "granted" && servicesOn) return;
      sessionActiveRef.current = false;
      await stopWatcher();
      try {
        await apiClient.stopSession();
      } catch {
        // already stopped / network — the next session poll reconciles state.
      }
      Alert.alert(
        "Work session stopped",
        "Location was turned off, so your work session was ended (location sharing can't continue). Turn location back on to start a new session."
      );
    }

    async function emitPing(position: Location.LocationObject) {
      // Skip if a previous send is still in flight — backend's mutation_record
      // PK would otherwise reject racing duplicates with the same nominal id
      // when the watcher fires faster than the network round-trip.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await apiClient.recordPings([{
          id: `ping_${userId}_${Date.now()}`,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
          recordedAt: new Date(position.timestamp).toISOString()
        }]);
        lastEmitMsRef.current = Date.now();
      } catch {
        // Single failed ping is fine — next watcher fire retries. We don't
        // queue here because the WS-broadcasted map cares about latest, not
        // every historical point.
      } finally {
        inFlightRef.current = false;
      }
    }

    // First tick immediately + then every 30s.
    void tick();
    const sessionPollId = setInterval(() => { void tick(); }, 30_000);
    // Heartbeat fires at the same cadence as the watcher; emitPing's own
    // dedupe via lastEmitMsRef means a moving rep won't double-up.
    const heartbeatId = setInterval(() => { void heartbeat(); }, intervalSeconds * 1000);
    // Check location availability on the same cadence and auto-stop if it's gone.
    const enforceId = setInterval(() => { void enforceLocationOrStop(); }, intervalSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(sessionPollId);
      clearInterval(heartbeatId);
      clearInterval(enforceId);
      void stopWatcher();
    };
  }, [enabled, userId, intervalSeconds, distanceMeters]);
}
