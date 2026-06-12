/**
 * Centralised env validation. Imported once at boot from dev-server.ts.
 *
 * In production:
 *   - JWT_SECRET, DATABASE_URL, REDIS_URL, APP_URL, AUTH_CORS are REQUIRED.
 *   - The dev fallback JWT secret is rejected.
 *   - Missing values fail-fast with an actionable error (not silent fallback).
 *
 * In development:
 *   - Sensible defaults; warnings logged when something would have failed in prod.
 */

export type Env = "production" | "development" | "test";

export interface ValidatedEnv {
  env: Env;
  jwtSecret: string;
  databaseUrl: string;
  redisUrl: string;
  appUrl: string;
  authCors: string[];
  enableDemoSeed: boolean;
  retentionSweepEnabled: boolean;
  retentionSweepIntervalMs: number;
  /**
   * A rep only counts as "live" on the team map if their most recent ping is
   * newer than this many seconds. Mobile pings every ~20s (heartbeat ≤40s), so
   * 300s (5 min) tolerates a few dropped pings without showing a rep whose app
   * died minutes ago. This is the server-side guard against stale "active"
   * sessions rendering a fake live location.
   */
  trackingLiveWindowSeconds: number;
  /**
   * A work session left `active` with no ping for this long is treated as
   * abandoned (app killed / logged out without stopping) and auto-stopped by the
   * session-expiry scheduler. Longer than the live window so a rep with patchy
   * signal isn't kicked off their own session prematurely.
   */
  sessionStaleAfterSeconds: number;
  sessionExpiryEnabled: boolean;
  sessionExpiryIntervalMs: number;
  /** Outbound email transport: "log" (writes to stdout) | "smtp". */
  emailProvider: "log" | "smtp";
  emailFrom: string;
  /** Push transport for mobile notifications: "log" | "expo". */
  pushProvider: "log" | "expo";
  /** Binary object storage for uploads (visit photos etc.): "local" | "s3". */
  objectStorageProvider: "local" | "s3";
  localObjectStorageRoot: string;
  /** Max accepted upload size in bytes (base64 JSON uploads). */
  maxUploadBytes: number;
}

const DEV_JWT_FALLBACK = "field-sales-dev-secret-do-not-use-in-production";

class EnvError extends Error {
  constructor(messages: string[]) {
    super(
      "Orbit backend refused to start. Fix the following environment problems:\n" +
        messages.map((m) => `  - ${m}`).join("\n")
    );
  }
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): ValidatedEnv {
  const env = (source.NODE_ENV ?? "development").toLowerCase() as Env;
  const isProd = env === "production";
  const errors: string[] = [];

  const jwtSecret = source.JWT_SECRET ?? (isProd ? "" : DEV_JWT_FALLBACK);
  if (isProd) {
    if (!source.JWT_SECRET) errors.push("JWT_SECRET must be set in production.");
    if (source.JWT_SECRET === DEV_JWT_FALLBACK)
      errors.push("JWT_SECRET cannot use the development fallback value in production.");
    if (source.JWT_SECRET && source.JWT_SECRET.length < 32)
      errors.push("JWT_SECRET must be at least 32 characters in production.");
  }

  const databaseUrl =
    source.DATABASE_URL ?? (isProd ? "" : "postgres://fieldsales:fieldsales@localhost:15432/fieldsales");
  if (isProd && !source.DATABASE_URL) errors.push("DATABASE_URL must be set in production.");

  const redisUrl = source.REDIS_URL ?? (isProd ? "" : "redis://localhost:6379");
  if (isProd && !source.REDIS_URL) errors.push("REDIS_URL must be set in production.");

  const appUrl = source.APP_URL ?? (isProd ? "" : "http://localhost:3000");
  if (isProd && !source.APP_URL) errors.push("APP_URL must be set in production.");

  const authCorsRaw = source.AUTH_CORS ?? (isProd ? "" : "http://localhost:3000,http://localhost:5173");
  if (isProd && !source.AUTH_CORS) errors.push("AUTH_CORS must be set in production.");
  const authCors = authCorsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const enableDemoSeed = source.ENABLE_DEMO_SEED === "true";
  if (isProd && enableDemoSeed) {
    errors.push("ENABLE_DEMO_SEED must NOT be true in production — it would create a default admin account.");
  }

  // Maps provider: the `mock` provider returns deterministic, FABRICATED
  // distances/geocodes. Allowing it in production would silently serve fake
  // route data to real reps, so require a real provider + its credential.
  const mapProvider = (source.MAP_PROVIDER ?? "mock").toLowerCase();
  if (isProd) {
    if (mapProvider === "mock" || !["mapbox", "google", "osrm"].includes(mapProvider)) {
      errors.push(
        "MAP_PROVIDER must be one of mapbox|google|osrm in production — the mock provider returns fabricated routes/distances."
      );
    } else if (mapProvider === "mapbox" && !source.MAPBOX_TOKEN) {
      errors.push("MAPBOX_TOKEN must be set when MAP_PROVIDER=mapbox.");
    } else if (mapProvider === "google" && !source.GOOGLE_MAPS_API_KEY) {
      errors.push("GOOGLE_MAPS_API_KEY must be set when MAP_PROVIDER=google.");
    } else if (mapProvider === "osrm" && !(source.OSRM_USER_AGENT || source.NOMINATIM_USER_AGENT)) {
      errors.push("OSRM_USER_AGENT must be set when MAP_PROVIDER=osrm (Nominatim usage policy).");
    }
  }

  const retentionSweepEnabled = isProd ? source.RETENTION_SWEEP_ENABLED !== "false" : source.RETENTION_SWEEP_ENABLED === "true";
  const retentionSweepIntervalMs = Number(source.RETENTION_SWEEP_INTERVAL_MS ?? 24 * 60 * 60 * 1000);

  const positive = (raw: string | undefined, fallback: number): number => {
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const trackingLiveWindowSeconds = positive(source.TRACKING_LIVE_WINDOW_SECONDS, 300);
  const sessionStaleAfterSeconds = positive(source.SESSION_STALE_AFTER_SECONDS, 900);
  if (sessionStaleAfterSeconds < trackingLiveWindowSeconds) {
    errors.push(
      "SESSION_STALE_AFTER_SECONDS must be >= TRACKING_LIVE_WINDOW_SECONDS, otherwise sessions are expired while still shown as live."
    );
  }
  // Auto-expiry of abandoned sessions: on by default in production (the live map
  // is only trustworthy if dead sessions get cleaned up), opt-in in dev.
  const sessionExpiryEnabled = isProd
    ? source.SESSION_EXPIRY_ENABLED !== "false"
    : source.SESSION_EXPIRY_ENABLED === "true";
  const sessionExpiryIntervalMs = positive(source.SESSION_EXPIRY_INTERVAL_MS, 60 * 1000);

  const emailProvider = (source.EMAIL_PROVIDER ?? "log").toLowerCase() === "smtp" ? "smtp" : "log";
  const emailFrom = source.EMAIL_FROM ?? "Orbit <no-reply@routepilot.local>";
  if (isProd && emailProvider === "smtp") {
    if (!source.SMTP_URL && !(source.SMTP_HOST && source.SMTP_PORT)) {
      errors.push("EMAIL_PROVIDER=smtp requires SMTP_URL (or SMTP_HOST + SMTP_PORT).");
    }
  }
  const pushProvider = (source.PUSH_PROVIDER ?? "log").toLowerCase() === "expo" ? "expo" : "log";
  const objectStorageProvider = (source.OBJECT_STORAGE_PROVIDER ?? "local").toLowerCase() === "s3" ? "s3" : "local";
  if (isProd && objectStorageProvider === "s3" && !source.S3_BUCKET) {
    errors.push("OBJECT_STORAGE_PROVIDER=s3 requires S3_BUCKET.");
  }
  const localObjectStorageRoot = source.LOCAL_OBJECT_STORAGE_ROOT ?? ".local/object-storage";
  const maxUploadBytes = positive(source.MAX_UPLOAD_BYTES, 8 * 1024 * 1024);

  if (errors.length > 0) throw new EnvError(errors);

  return {
    env,
    jwtSecret,
    databaseUrl,
    redisUrl,
    appUrl,
    authCors,
    enableDemoSeed,
    retentionSweepEnabled,
    retentionSweepIntervalMs,
    trackingLiveWindowSeconds,
    sessionStaleAfterSeconds,
    sessionExpiryEnabled,
    sessionExpiryIntervalMs,
    emailProvider,
    emailFrom,
    pushProvider,
    objectStorageProvider,
    localObjectStorageRoot,
    maxUploadBytes
  };
}

let cached: ValidatedEnv | undefined;
export function getEnv(): ValidatedEnv {
  if (!cached) cached = validateEnv();
  return cached;
}

/** Test helper — resets the cache so tests can drive validateEnv with synthetic inputs. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const DEV_JWT_FALLBACK_VALUE = DEV_JWT_FALLBACK;
