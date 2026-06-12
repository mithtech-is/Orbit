/**
 * In-memory sliding-window rate limiter. Keyed by (clientIp + bucket). Bucket
 * defaults are tuned for an internal API; tighten via `applyTo` config.
 *
 * Horizontal scale: when the backend runs on multiple instances, swap the
 * in-memory `Map` for a Redis ZSET. The function signature stays the same.
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, config: RateLimitConfig, now = Date.now()): RateLimitDecision {
  const windowStart = now - config.windowMs;
  const existing = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (existing.length >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing[0] + config.windowMs
    };
  }
  existing.push(now);
  buckets.set(key, existing);
  return {
    allowed: true,
    remaining: config.maxRequests - existing.length,
    resetAt: now + config.windowMs
  };
}

/** Test-only / shutdown helper. */
export function clearRateLimitState(): void {
  buckets.clear();
}

/**
 * Distributed rate limit (performance-audit H5). When REDIS_URL is set this uses
 * an atomic per-window INCR counter in Redis so the limit is enforced correctly
 * ACROSS all backend instances. Without Redis (single-instance dev) it falls
 * back to the in-memory sliding window above. Import is dynamic so the module
 * stays usable in pure unit tests that don't touch Redis.
 */
export async function checkRateLimitAsync(
  key: string,
  config: RateLimitConfig,
  now = Date.now()
): Promise<RateLimitDecision> {
  let redis: import("ioredis").default | null = null;
  try {
    const mod = await import("../redis/client.js");
    redis = mod.isRedisEnabled() ? mod.getRedis() : null;
  } catch {
    redis = null;
  }
  if (!redis) return checkRateLimit(key, config, now);

  const windowIndex = Math.floor(now / config.windowMs);
  const redisKey = `rl:${key}:${windowIndex}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.pexpire(redisKey, config.windowMs);
    const resetAt = (windowIndex + 1) * config.windowMs;
    if (count > config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }
    return { allowed: true, remaining: config.maxRequests - count, resetAt };
  } catch {
    // Redis blip — fail open to the in-memory limiter rather than block traffic.
    return checkRateLimit(key, config, now);
  }
}

export const DEFAULT_LIMITS = {
  auth: { windowMs: 60_000, maxRequests: 20 } satisfies RateLimitConfig,
  ingest: { windowMs: 60_000, maxRequests: 600 } satisfies RateLimitConfig,
  general: { windowMs: 60_000, maxRequests: 300 } satisfies RateLimitConfig
};

const AUTH_POST_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password"
]);

export function bucketForPath(method: string, pathname: string): RateLimitConfig {
  if (method === "POST" && AUTH_POST_PATHS.has(pathname)) return DEFAULT_LIMITS.auth;
  if (method === "POST" && (pathname === "/api/v1/tracking" || pathname === "/api/v1/sync/push")) {
    return DEFAULT_LIMITS.ingest;
  }
  return DEFAULT_LIMITS.general;
}

/**
 * The principal a request is rate-limited against. Authenticated requests are
 * limited PER USER so that an entire office or region of reps behind one NAT /
 * egress IP do not share — and exhaust — a single IP bucket (which would make
 * them 429 each other at scale). Unauthenticated requests (e.g. login) fall
 * back to the client IP so brute-force is still throttled per source.
 */
export function rateLimitPrincipal(userId: string | null | undefined, clientIp: string): string {
  return userId ? `u:${userId}` : `ip:${clientIp}`;
}
