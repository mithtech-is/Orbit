import { expireStaleSessions } from "../../modules/tracking/repository.js";
import { writeAuditLog } from "../../modules/audit-and-compliance/repository.js";
import { getEnv } from "../../config/env.js";
import { getRedis, isRedisEnabled } from "../../redis/client.js";

let timer: NodeJS.Timeout | undefined;

/**
 * Leader lock so that with N backend instances only ONE runs the sweep per tick
 * (same pattern as the retention sweep). Without Redis (single instance) it
 * always wins. A short TTL (~one tick) means the lock auto-releases if the
 * holder dies mid-sweep.
 */
async function acquireExpiryLock(ttlMs: number): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set("orbit:session-expiry:lock", String(process.pid), "PX", ttlMs, "NX");
    return res === "OK";
  } catch {
    return true; // Redis blip → don't starve the sweep
  }
}

/**
 * Stops every abandoned work session (active, no ping within the stale window)
 * and writes one audit entry per closed session. Returns the count closed.
 * Exported for tests and manual invocation.
 */
export async function runSessionExpirySweep(): Promise<{ expired: number }> {
  const { sessionStaleAfterSeconds } = getEnv();
  const closed = await expireStaleSessions(sessionStaleAfterSeconds);
  for (const session of closed) {
    try {
      await writeAuditLog({
        organisationId: session.organisation_id,
        actorUserId: null,
        action: "tracking.session.auto_expired",
        targetType: "work_session",
        targetId: session.id,
        metadata: { userId: session.user_id, endedAt: session.ended_at, reason: "no_pings_within_stale_window" }
      });
    } catch (error) {
      process.stderr.write(
        `[session-expiry] audit write failed for session=${session.id}: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
  return { expired: closed.length };
}

/**
 * Starts the interval-based session-expiry sweep.
 *   - production: on by default, disable with SESSION_EXPIRY_ENABLED=false
 *   - development: off by default, opt-in with SESSION_EXPIRY_ENABLED=true
 * Interval defaults to 60s (`SESSION_EXPIRY_INTERVAL_MS`).
 */
export function startSessionExpiryScheduler(): void {
  if (timer) return;
  const env = getEnv();
  if (!env.sessionExpiryEnabled) return;
  const interval = env.sessionExpiryIntervalMs;

  const tick = async () => {
    try {
      const won = await acquireExpiryLock(Math.min(interval, 5 * 60 * 1000));
      if (!won) return;
      const summary = await runSessionExpirySweep();
      if (summary.expired > 0) {
        process.stdout.write(`[session-expiry] auto-stopped ${summary.expired} abandoned session(s)\n`);
      }
    } catch (error) {
      process.stderr.write(
        `[session-expiry] sweep failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  };

  void tick();
  timer = setInterval(() => void tick(), interval);
}

export function stopSessionExpiryScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
