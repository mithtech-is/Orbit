import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiClient } from "../api-service";
import { createOfflineSync, type FlushResult, type OfflineSync } from "./offline-queue";

const DEVICE_ID_KEY = "field_sales.device_id";

function getOrCreateDeviceId(): string {
  // In a native build, AsyncStorage would persist this. In environments without
  // (vitest, etc.) we fall back to a per-process id; tests don't rely on it.
  const bag = globalThis as unknown as Record<string, string | undefined>;
  if (bag[DEVICE_ID_KEY]) return bag[DEVICE_ID_KEY] as string;
  const id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  bag[DEVICE_ID_KEY] = id;
  return id;
}

export interface UseOfflineSyncResult {
  sync: OfflineSync;
  lastFlush: FlushResult | null;
  flushing: boolean;
  flushNow: () => Promise<void>;
}

/**
 * App-wide offline sync hook. Owns a single `OfflineSync` instance bound to
 * `apiClient.syncPush`, auto-flushes when the app moves to the foreground, and
 * exposes a manual `flushNow` for pull-to-refresh / explicit retry.
 */
export function useOfflineSync(): UseOfflineSyncResult {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const sync = useMemo(
    () =>
      createOfflineSync({
        deviceId,
        push: (input) => apiClient.syncPush({ ...input, platform: "expo" })
      }),
    [deviceId]
  );

  const [lastFlush, setLastFlush] = useState<FlushResult | null>(null);
  const [flushing, setFlushing] = useState(false);

  const flushNow = useCallback(async () => {
    if (flushing) return;
    setFlushing(true);
    try {
      const result = await sync.flush();
      setLastFlush(result);
    } finally {
      setFlushing(false);
    }
  }, [sync, flushing]);

  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (next === "active") {
        void flushNow();
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => {
      sub.remove();
    };
  }, [flushNow]);

  return { sync, lastFlush, flushing, flushNow };
}
