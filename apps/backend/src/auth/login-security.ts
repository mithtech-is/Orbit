import { getRedis, isRedisEnabled } from "../redis/client.js";

/**
 * Server-side session hardening backed by Redis (no-ops gracefully without it):
 *   - token revocation denylist (so logout / forced sign-out actually kills a
 *     JWT before its 24h expiry), and
 *   - login lockout with exponential backoff (brute-force defense per account).
 *
 * Single-instance dev without Redis: revocation is unavailable (logout still
 * clears the client token) and lockout falls open. Production runs Redis.
 */

const REVOKE_PREFIX = "revoked:jti:";
const FAIL_PREFIX = "login_fail:";

export async function revokeJti(jti: string, ttlSeconds: number): Promise<void> {
  if (!jti || ttlSeconds <= 0 || !isRedisEnabled()) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`${REVOKE_PREFIX}${jti}`, "1", "EX", Math.ceil(ttlSeconds));
  } catch {
    /* best-effort */
  }
}

export async function isJtiRevoked(jti: string): Promise<boolean> {
  if (!jti || !isRedisEnabled()) return false;
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.get(`${REVOKE_PREFIX}${jti}`)) !== null;
  } catch {
    return false; // Redis blip → don't lock everyone out
  }
}

// --- Login lockout -------------------------------------------------------

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;

/**
 * Backoff (seconds) once attempts reach the threshold. Pure → unit tested.
 * 0 means "not locked yet". Grows 1m, 5m, 15m, capped at 15m.
 */
export function lockoutSeconds(attempts: number): number {
  if (attempts < LOGIN_MAX_ATTEMPTS) return 0;
  const over = attempts - LOGIN_MAX_ATTEMPTS;
  const ladder = [60, 5 * 60, 15 * 60];
  return ladder[Math.min(over, ladder.length - 1)];
}

function failKey(organisationId: string, email: string): string {
  return `${FAIL_PREFIX}${organisationId}:${email.toLowerCase()}`;
}

/** Returns remaining lockout seconds (0 = allowed). */
export async function loginLockRemaining(organisationId: string, email: string): Promise<number> {
  if (!isRedisEnabled()) return 0;
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const key = failKey(organisationId, email);
    const attempts = Number((await redis.get(key)) ?? 0);
    const lock = lockoutSeconds(attempts);
    if (lock === 0) return 0;
    const ttl = await redis.ttl(key);
    return ttl > 0 ? Math.min(ttl, lock) : 0;
  } catch {
    return 0;
  }
}

export async function recordLoginFailure(organisationId: string, email: string): Promise<void> {
  if (!isRedisEnabled()) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = failKey(organisationId, email);
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, LOGIN_FAIL_WINDOW_SECONDS);
  } catch {
    /* best-effort */
  }
}

export async function clearLoginFailures(organisationId: string, email: string): Promise<void> {
  if (!isRedisEnabled()) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(failKey(organisationId, email));
  } catch {
    /* best-effort */
  }
}
