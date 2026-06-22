import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Runtime "Server URL" for the field app.
 *
 * The build-time URL (EXPO_PUBLIC_MOBILE_API_BASE_URL inlined into the bundle)
 * is fine for dev (Metro auto-detection) but a STANDALONE APK that ships to a
 * customer can't predict which backend it'll talk to — a Cloudflare quick
 * tunnel URL changes every session, the demo laptop's IP changes per Wi-Fi,
 * and a hosted URL might come later. So we keep an override in AsyncStorage
 * that the user pastes once on the login screen, and from then on every API
 * call uses it. Persists across launches; cleared only on explicit reset.
 */

const STORAGE_KEY = "orbit.serverUrl";

/** The URL the bundle was built against. May still be a useful default. */
export function bakedServerUrl(): string {
  return (
    process.env.EXPO_PUBLIC_MOBILE_API_BASE_URL ??
    process.env.MOBILE_API_BASE_URL ??
    "http://localhost:9090"
  );
}

export async function loadStoredServerUrl(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function saveServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, url.trim());
}

export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Normalise what a human types — trim trailing slashes, default-protocol to
 * http://, accept "10.0.0.5:9090" / "10.0.0.5" / "https://x.trycloudflare.com".
 * Returns null if it can't be coerced into something URL-shaped.
 */
export function normaliseServerUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // strip whitespace inside (people paste with line breaks from tunnel logs)
  s = s.replace(/\s+/g, "");
  // accept a bare host[:port] by prepending http://
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  // drop trailing slash(es)
  s = s.replace(/\/+$/, "");
  try {
    // throws if it's not a valid URL
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

/** Derive the WebSocket URL from the HTTP server URL (same host, ws/wss). */
export function deriveWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http(s?):\/\//i, (_m, s) => `ws${s}://`);
}
