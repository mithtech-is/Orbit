import { describe, expect, it } from "vitest";
import { validateEnv, DEV_JWT_FALLBACK_VALUE } from "./env.js";

const prodBase: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  JWT_SECRET: "a".repeat(48),
  DATABASE_URL: "postgres://user:pw@host:5432/db",
  REDIS_URL: "redis://host:6379",
  APP_URL: "https://app.example.com",
  AUTH_CORS: "https://app.example.com",
  // A real maps provider is required in production; tests that exercise other
  // rules start from a valid maps config so they fail for the reason under test.
  MAP_PROVIDER: "mapbox",
  MAPBOX_TOKEN: "pk.test-token"
};

describe("validateEnv (production)", () => {
  it("accepts a valid production env", () => {
    const env = validateEnv(prodBase);
    expect(env.env).toBe("production");
    expect(env.jwtSecret).toHaveLength(48);
    expect(env.authCors).toEqual(["https://app.example.com"]);
    expect(env.enableDemoSeed).toBe(false);
  });

  it("refuses to start when JWT_SECRET is missing in production", () => {
    expect(() => validateEnv({ ...prodBase, JWT_SECRET: undefined })).toThrow(/JWT_SECRET must be set in production/);
  });

  it("refuses to start when JWT_SECRET is the dev fallback in production", () => {
    expect(() => validateEnv({ ...prodBase, JWT_SECRET: DEV_JWT_FALLBACK_VALUE })).toThrow(/cannot use the development fallback/);
  });

  it("refuses to start when JWT_SECRET is too short in production", () => {
    expect(() => validateEnv({ ...prodBase, JWT_SECRET: "shortsecret" })).toThrow(/at least 32 characters/);
  });

  it("refuses to start when DATABASE_URL is missing in production", () => {
    expect(() => validateEnv({ ...prodBase, DATABASE_URL: undefined })).toThrow(/DATABASE_URL must be set in production/);
  });

  it("refuses to start when ENABLE_DEMO_SEED=true in production", () => {
    expect(() => validateEnv({ ...prodBase, ENABLE_DEMO_SEED: "true" })).toThrow(/ENABLE_DEMO_SEED must NOT be true in production/);
  });

  it("refuses to start when MAP_PROVIDER is mock (or unset) in production", () => {
    expect(() => validateEnv({ ...prodBase, MAP_PROVIDER: "mock", MAPBOX_TOKEN: undefined })).toThrow(/MAP_PROVIDER must be one of/);
    expect(() => validateEnv({ ...prodBase, MAP_PROVIDER: undefined, MAPBOX_TOKEN: undefined })).toThrow(/MAP_PROVIDER must be one of/);
  });

  it("refuses to start when MAP_PROVIDER credential is missing in production", () => {
    expect(() => validateEnv({ ...prodBase, MAP_PROVIDER: "mapbox", MAPBOX_TOKEN: undefined })).toThrow(/MAPBOX_TOKEN must be set/);
    expect(() => validateEnv({ ...prodBase, MAP_PROVIDER: "google", MAPBOX_TOKEN: undefined })).toThrow(/GOOGLE_MAPS_API_KEY must be set/);
  });

  it("accepts osrm with a user agent in production", () => {
    const env = validateEnv({ ...prodBase, MAP_PROVIDER: "osrm", MAPBOX_TOKEN: undefined, OSRM_USER_AGENT: "Orbit/1.0 (ops@example.com)" });
    expect(env.env).toBe("production");
  });

  it("aggregates multiple missing values into one error message", () => {
    expect(() => validateEnv({ NODE_ENV: "production" })).toThrow(/JWT_SECRET.*\n.*DATABASE_URL/s);
  });
});

describe("validateEnv (development)", () => {
  it("returns sensible defaults when nothing is set", () => {
    const env = validateEnv({ NODE_ENV: "development" });
    expect(env.env).toBe("development");
    expect(env.jwtSecret).toBe(DEV_JWT_FALLBACK_VALUE);
    expect(env.databaseUrl).toContain("localhost:15432");
    expect(env.redisUrl).toBe("redis://localhost:6379");
    expect(env.appUrl).toBe("http://localhost:3000");
    expect(env.authCors).toContain("http://localhost:3000");
  });

  it("retention sweep defaults to off in development", () => {
    const env = validateEnv({ NODE_ENV: "development" });
    expect(env.retentionSweepEnabled).toBe(false);
  });

  it("retention sweep defaults to on in production unless explicitly disabled", () => {
    const env = validateEnv(prodBase);
    expect(env.retentionSweepEnabled).toBe(true);
    const off = validateEnv({ ...prodBase, RETENTION_SWEEP_ENABLED: "false" });
    expect(off.retentionSweepEnabled).toBe(false);
  });
});

describe("validateEnv (tracking freshness / session expiry)", () => {
  it("defaults the live window and stale window", () => {
    const env = validateEnv({ NODE_ENV: "development" });
    expect(env.trackingLiveWindowSeconds).toBe(300);
    expect(env.sessionStaleAfterSeconds).toBe(900);
  });

  it("falls back to defaults on non-positive / non-numeric overrides", () => {
    const env = validateEnv({ NODE_ENV: "development", TRACKING_LIVE_WINDOW_SECONDS: "-5", SESSION_STALE_AFTER_SECONDS: "abc" });
    expect(env.trackingLiveWindowSeconds).toBe(300);
    expect(env.sessionStaleAfterSeconds).toBe(900);
  });

  it("rejects a stale window shorter than the live window", () => {
    expect(() =>
      validateEnv({ ...prodBase, TRACKING_LIVE_WINDOW_SECONDS: "600", SESSION_STALE_AFTER_SECONDS: "300" })
    ).toThrow(/SESSION_STALE_AFTER_SECONDS must be >= TRACKING_LIVE_WINDOW_SECONDS/);
  });

  it("session expiry defaults off in dev, on in prod, and respects the disable flag", () => {
    expect(validateEnv({ NODE_ENV: "development" }).sessionExpiryEnabled).toBe(false);
    expect(validateEnv(prodBase).sessionExpiryEnabled).toBe(true);
    expect(validateEnv({ ...prodBase, SESSION_EXPIRY_ENABLED: "false" }).sessionExpiryEnabled).toBe(false);
  });
});
