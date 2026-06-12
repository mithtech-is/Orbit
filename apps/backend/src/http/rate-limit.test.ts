import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, clearRateLimitState, bucketForPath, DEFAULT_LIMITS, rateLimitPrincipal } from "./rate-limit.js";

afterEach(() => clearRateLimitState());

describe("rate limiter", () => {
  it("allows up to maxRequests within the window and rejects the next call", () => {
    const cfg = { windowMs: 60_000, maxRequests: 3 };
    const now = 1_000_000;
    expect(checkRateLimit("ip-A", cfg, now).allowed).toBe(true);
    expect(checkRateLimit("ip-A", cfg, now + 1).allowed).toBe(true);
    expect(checkRateLimit("ip-A", cfg, now + 2).allowed).toBe(true);
    const fourth = checkRateLimit("ip-A", cfg, now + 3);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("scopes the window per key", () => {
    const cfg = { windowMs: 60_000, maxRequests: 1 };
    expect(checkRateLimit("ip-A", cfg).allowed).toBe(true);
    expect(checkRateLimit("ip-B", cfg).allowed).toBe(true);
    expect(checkRateLimit("ip-A", cfg).allowed).toBe(false);
  });

  it("allows again once requests age out of the window", () => {
    const cfg = { windowMs: 1_000, maxRequests: 1 };
    const now = 1_000_000;
    expect(checkRateLimit("ip-A", cfg, now).allowed).toBe(true);
    expect(checkRateLimit("ip-A", cfg, now + 500).allowed).toBe(false);
    expect(checkRateLimit("ip-A", cfg, now + 1_500).allowed).toBe(true);
  });

  it("bucketForPath routes login/POST tracking/POST sync push to dedicated configs", () => {
    expect(bucketForPath("POST", "/api/v1/auth/login")).toBe(DEFAULT_LIMITS.auth);
    expect(bucketForPath("POST", "/api/v1/tracking")).toBe(DEFAULT_LIMITS.ingest);
    expect(bucketForPath("POST", "/api/v1/sync/push")).toBe(DEFAULT_LIMITS.ingest);
    expect(bucketForPath("GET", "/api/v1/outlets")).toBe(DEFAULT_LIMITS.general);
  });
});

describe("rateLimitPrincipal", () => {
  it("keys authenticated requests by user, not IP", () => {
    expect(rateLimitPrincipal("user_rep_7", "10.0.0.1")).toBe("u:user_rep_7");
  });

  it("falls back to client IP when there is no authenticated user", () => {
    expect(rateLimitPrincipal(null, "10.0.0.1")).toBe("ip:10.0.0.1");
    expect(rateLimitPrincipal(undefined, "10.0.0.1")).toBe("ip:10.0.0.1");
  });

  it("two reps behind one shared NAT IP get independent buckets", () => {
    const cfg = { windowMs: 60_000, maxRequests: 1 };
    const ip = "203.0.113.9"; // same office egress IP for both reps
    const a = rateLimitPrincipal("user_rep_1", ip);
    const b = rateLimitPrincipal("user_rep_2", ip);
    expect(checkRateLimit(a, cfg).allowed).toBe(true);
    expect(checkRateLimit(b, cfg).allowed).toBe(true); // would be false if keyed by IP
    expect(checkRateLimit(a, cfg).allowed).toBe(false); // rep 1 has spent their own bucket
  });
});
