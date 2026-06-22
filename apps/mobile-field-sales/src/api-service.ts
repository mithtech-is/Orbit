import { createApiClient } from "@orbit/api-client";
import type { MobileSession, TokenStorage } from "./auth/token-storage";

import { NativeModules } from "react-native";
import { loadStoredServerUrl, saveServerUrl, bakedServerUrl } from "./config/server-config";

// Expo Metro only inlines env vars prefixed with EXPO_PUBLIC_ at bundle time.
// `process.env` doesn't exist at runtime in React Native, so the var must be
// substituted by the bundler. Set `EXPO_PUBLIC_MOBILE_API_BASE_URL` in the
// shell before `expo start` (or via .env / app.config.ts `extra` field).
function getFallbackApiUrl() {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
    if (match) {
      return `http://${match[1]}:9090`;
    }
  }
  return "http://localhost:9090";
}

// Initial value at module load. AsyncStorage is async, so we can't read it
// synchronously here — `hydrateServerUrl()` is called from App startup and
// overrides this before any API call goes out. The order of preference:
//   1. AsyncStorage override (hydrated on startup; set by the login screen)
//   2. EXPO_PUBLIC_* baked into the bundle at build time
//   3. Metro scriptURL auto-detection (dev only)
//   4. localhost
const INITIAL_BASE_URL =
  process.env.EXPO_PUBLIC_MOBILE_API_BASE_URL ??
  process.env.MOBILE_API_BASE_URL ??
  getFallbackApiUrl();

export const apiClient = createApiClient({ baseUrl: INITIAL_BASE_URL });

/**
 * Read the persisted server URL and apply it to the client. Call ONCE at app
 * startup BEFORE any screen mounts that issues API calls. Safe to call again
 * after the user changes the URL (idempotent re-read).
 */
export async function hydrateServerUrl(): Promise<string> {
  const stored = await loadStoredServerUrl();
  const effective = stored ?? INITIAL_BASE_URL;
  apiClient.setBaseUrl(effective);
  return effective;
}

/** Persist a new server URL and switch the live client to it. */
export async function applyServerUrl(url: string): Promise<void> {
  await saveServerUrl(url);
  apiClient.setBaseUrl(url);
}

/** What the user sees as the current effective URL (for prefill in UI). */
export function currentServerUrl(): string {
  return apiClient.getBaseUrl();
}

/** Exposed for screens that build their own URLs (web dashboard link, WS). */
export function defaultServerUrl(): string {
  return bakedServerUrl();
}

/** Mirrors backend auth/areas.ts — only field reps belong in the field app. */
function areaForRole(role: string | undefined): "admin" | "field" {
  return role === "field_sales_representative" ? "field" : "admin";
}

/** Decode JWT payload without a library — returns null on parse failure. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/** Thrown when a non-field (admin/manager/ops) user tries to use the field app. */
export class WrongAreaError extends Error {
  constructor() {
    super("This is the Orbit field app for sales reps. Managers and admins sign in to the web dashboard.");
    this.name = "WrongAreaError";
  }
}

/**
 * Restore the persisted session (token + identity + permissions) and attach
 * the JWT to the API client. Returns null when no session exists, OR when the
 * stored session is from a pre-RBAC build (no role/permissions). In the latter
 * case we proactively clear storage so the user is forced to re-login and
 * populate the missing claims — otherwise the nav would render unguarded.
 */
export async function rehydrateAuth(storage: TokenStorage): Promise<MobileSession | null> {
  const session = await storage.loadSession();
  if (!session || !session.token) {
    return null;
  }

  // Legacy session: a JWT was persisted but no role/permissions ever made it
  // into storage. Treat as logged-out — never render the app with empty perms.
  if (!session.role || session.permissions.length === 0) {
    await storage.clear();
    apiClient.setToken("");
    return null;
  }

  // Area guard: the field app only runs field-area sessions. If a non-field
  // session was somehow persisted, force re-login.
  if ((session.area ?? areaForRole(session.role)) !== "field") {
    await storage.clear();
    apiClient.setToken("");
    return null;
  }

  // Expired JWT: check the exp claim before mounting the app. If stale, clear
  // the session and force re-login instead of letting every API call 403.
  const payload = decodeJwtPayload(session.token);
  if (payload) {
    const exp = payload.exp as number | undefined;
    if (exp && Date.now() >= exp * 1000) {
      await storage.clear();
      apiClient.setToken("");
      return null;
    }
  }

  apiClient.setToken(session.token);
  return session;
}

export async function loginAndPersist(
  storage: TokenStorage,
  input: { email: string; password: string; organisationId: string }
): Promise<MobileSession> {
  const result = await apiClient.login(input);
  const area = result.area ?? areaForRole(result.role);
  // Strict area separation: admins/managers/ops cannot use the field app. Reject
  // BEFORE persisting so no admin token is ever stored on a rep's device.
  if (area !== "field") {
    apiClient.setToken("");
    throw new WrongAreaError();
  }
  const session: MobileSession = {
    token: result.token,
    userId: result.userId,
    organisationId: result.organisationId,
    name: result.name,
    email: result.email,
    role: result.role,
    area,
    permissions: result.permissions
  };
  await storage.saveSession(session);
  return session;
}

export async function logoutAndClear(storage: TokenStorage): Promise<void> {
  // Best-effort server-side revocation before we drop the local token.
  try {
    await apiClient.logout();
  } catch {
    /* offline / already invalid — local clear below still signs out */
  }
  await storage.clear();
  apiClient.setToken("");
}

export type { MobileSession } from "./auth/token-storage";
