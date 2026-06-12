import { getEnv } from "../config/env.js";

/**
 * Pluggable push transport. `log` (default) prints — fine for dev / pilot — and
 * `expo` delivers via the Expo Push API (works with the Expo-built mobile app's
 * device tokens, no native FCM/APNs keys required and no extra dependency since
 * it's a plain fetch).
 */
export interface PushMessage {
  /** Expo push tokens (ExponentPushToken[...]). */
  to: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<{ ok: boolean; sent: number; error?: string }>;
}

export function createLogPushProvider(): PushProvider {
  return {
    name: "log",
    async send(message) {
      if (message.to.length === 0) return { ok: true, sent: 0 };
      process.stdout.write(
        `[push:log] to=${message.to.length} device(s) title=${JSON.stringify(message.title)} body=${JSON.stringify(message.body)}\n`
      );
      return { ok: true, sent: message.to.length };
    }
  };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function createExpoPushProvider(): PushProvider {
  return {
    name: "expo",
    async send(message) {
      const tokens = message.to.filter((t) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"));
      if (tokens.length === 0) return { ok: true, sent: 0 };
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(
            tokens.map((to) => ({ to, title: message.title, body: message.body, data: message.data ?? {} }))
          )
        });
        if (!res.ok) return { ok: false, sent: 0, error: `expo push HTTP ${res.status}` };
        return { ok: true, sent: tokens.length };
      } catch (error) {
        return { ok: false, sent: 0, error: error instanceof Error ? error.message : String(error) };
      }
    }
  };
}

/** Pure selector — exported for tests. */
export function selectPushProvider(provider: "log" | "expo"): PushProvider {
  return provider === "expo" ? createExpoPushProvider() : createLogPushProvider();
}

let cached: PushProvider | undefined;
export function getPushProvider(): PushProvider {
  if (!cached) cached = selectPushProvider(getEnv().pushProvider);
  return cached;
}

export function resetPushProviderCache(): void {
  cached = undefined;
}
