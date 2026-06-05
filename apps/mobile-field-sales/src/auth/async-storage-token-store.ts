import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileSession, TokenStorage } from "./token-storage";

// Legacy key from before v0.2 — held only the JWT string. We still read it once
// during loadSession() for migration so existing devs don't get instantly
// logged out on upgrade, but we never write to it after the first saveSession.
const LEGACY_TOKEN_KEY = "field_sales.jwt";
const SESSION_KEY = "field_sales.session";

function blankSession(token: string): MobileSession {
  return {
    token,
    userId: "",
    organisationId: "",
    name: "",
    email: "",
    role: "",
    permissions: []
  };
}

export const asyncStorageTokenStore: TokenStorage = {
  async load() {
    const session = await asyncStorageTokenStore.loadSession();
    return session?.token ?? null;
  },
  async save(token) {
    const existing = await asyncStorageTokenStore.loadSession();
    const next: MobileSession = existing ? { ...existing, token } : blankSession(token);
    await asyncStorageTokenStore.saveSession(next);
  },
  async clear() {
    await AsyncStorage.multiRemove([SESSION_KEY, LEGACY_TOKEN_KEY]);
  },
  async loadSession() {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MobileSession;
        if (parsed && typeof parsed.token === "string") {
          return parsed;
        }
      } catch {
        // Corrupted JSON — fall through to the legacy path.
      }
    }
    // Migration: an older build wrote only the token. Surface it as a degenerate
    // session so the upstream auth bootstrap can decide whether to force re-login.
    const legacyToken = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
    return legacyToken ? blankSession(legacyToken) : null;
  },
  async saveSession(session) {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    // Drop the legacy single-token entry the first time we write a real session,
    // so it can never shadow newer state.
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
  }
};
