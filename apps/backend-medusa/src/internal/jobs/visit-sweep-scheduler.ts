import { expireAbandonedVisits } from "../../modules/visit/repository.js";
import { writeAuditLog } from "../../modules/audit-and-compliance/repository.js";
import { notifyManagers } from "../../modules/notification/field-events.js";
import { getEnv } from "../../config/env.js";
import { getRedis, isRedisEnabled } from "../../redis/client.js";

let timer: NodeJS.Timeout | undefined;

/** A visit stuck "checked in" longer than this is auto-closed as a no-show. */
const ABANDON_AFTER_SECONDS = Number(process.env.VISIT_ABANDON_AFTER_SECONDS) || 7200; // 2h

/** Leader lock so only one backend instance runs the sweep per tick. */
async function acquireLock(ttlMs: number): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set("orbit:visit-sweep:lock", String(process.pid), "PX", ttlMs, "NX");
    return res === "OK";
  } catch {
    return true;
  }
}

/** Close abandoned (stuck-checked-in) visits as no-shows; one audit row each. */
export async function runVisitSweep(): Promise<{ closed: number }> {
  const closed = await expireAbandonedVisits(ABANDON_AFTER_SECONDS);
  for (const v of closed) {
    try {
      await writeAuditLog({
        organisationId: v.organisation_id,
        actorUserId: null,
        action: "visit.auto_no_show",
        targetType: "visit",
        targetId: v.id,
        metadata: { userId: v.assigned_user_id, reason: "abandoned_check_in", thresholdSeconds: ABANDON_AFTER_SECONDS }
      });
    } catch (error) {
      process.stderr.write(`[visit-sweep] audit write failed for visit=${v.id}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    await notifyManagers(v.organisation_id, {
      type: "visit.abandoned",
      title: "Abandoned check-in auto-closed",
      body: "A rep's check-in was left open and was auto-closed as a no-show.",
      data: { visitId: v.id, repUserId: v.assigned_user_id }
    });
  }
  return { closed: closed.length };
}

/**
 * Starts the abandoned-check-in sweep. Reuses the session-expiry enable flag +
 * interval (both are "stale field-state cleanup" sweeps): on by default in
 * production, opt-in in dev (SESSION_EXPIRY_ENABLED=true).
 */
export function startVisitSweepScheduler(): void {
  if (timer) return;
  const env = getEnv();
  if (!env.sessionExpiryEnabled) return;
  const interval = env.sessionExpiryIntervalMs;

  const tick = async () => {
    try {
      const won = await acquireLock(Math.min(interval, 5 * 60 * 1000));
      if (!won) return;
      const summary = await runVisitSweep();
      if (summary.closed > 0) {
        process.stdout.write(`[visit-sweep] auto-closed ${summary.closed} abandoned visit(s) as no-show\n`);
      }
    } catch (error) {
      process.stderr.write(`[visit-sweep] sweep failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };

  void tick();
  timer = setInterval(() => void tick(), interval);
}

export function stopVisitSweepScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
