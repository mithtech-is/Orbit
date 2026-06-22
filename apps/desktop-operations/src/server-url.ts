import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Runtime "Server URL" for the desktop app — the URL of the Orbit web
 * dashboard the BrowserWindow loads on startup.
 *
 * Resolution order (highest precedence first):
 *   1. ORBIT_WEB_URL / FIELD_SALES_WEB_URL / WEB_URL  (env override)
 *   2. ~/AppData/Roaming/Orbit/server-url.json       (saved via prompt)
 *   3. http://localhost:3001                          (dev fallback)
 *
 * Persistence is a single JSON file in Electron's userData dir so it survives
 * upgrades and is per-user without requiring admin rights.
 */

const DEFAULT_URL = "http://localhost:3001";

function configPath(): string {
  return path.join(app.getPath("userData"), "server-url.json");
}

function envOverride(): string | null {
  const v = process.env.ORBIT_WEB_URL ?? process.env.FIELD_SALES_WEB_URL ?? process.env.WEB_URL;
  return v && v.trim() ? v.trim() : null;
}

/** Trim, default-scheme, accept "10.0.0.5:3001" / "https://x.trycloudflare.com". */
export function normaliseUrl(raw: string): string | null {
  let s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/\/+$/, "");
  try { new URL(s); return s; } catch { return null; }
}

async function loadStored(): Promise<string | null> {
  try {
    const text = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(text) as { url?: unknown };
    return typeof parsed.url === "string" && parsed.url.trim() ? parsed.url.trim() : null;
  } catch {
    return null;
  }
}

export async function saveStored(url: string): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify({ url }, null, 2), "utf8");
}

export async function clearStored(): Promise<void> {
  try { await fs.unlink(configPath()); } catch { /* already gone */ }
}

/** Returns the URL the main window should load right now. */
export async function effectiveUrl(): Promise<string> {
  return envOverride() ?? (await loadStored()) ?? DEFAULT_URL;
}

/** True if neither the env var nor a saved URL exists — used to gate the prompt. */
export async function shouldPromptForUrl(): Promise<boolean> {
  if (envOverride() !== null) return false;
  return (await loadStored()) === null;
}

/** Exposed for the prompt window's defaultValue. */
export async function currentOrDefault(): Promise<string> {
  return (await loadStored()) ?? DEFAULT_URL;
}
