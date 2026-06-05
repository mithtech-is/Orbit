import { queryRows } from "../../db/client.js";
import { sweepExpiredPings } from "../../modules/tracking/repository.js";
import { writeAuditLog } from "../../modules/audit-and-compliance/repository.js";
import { getEnv } from "../../config/env.js";
import { getRedis, isRedisEnabled } from "../../redis/client.js";
import { ensureLocationPingPartitions, dropExpiredLocationPingPartitions } from "./partition-manager.js";

let timer: NodeJS.Timeout | undefined;

/**
 * Acquire a short-lived leader lock so that with N backend instances, only ONE
 * runs the retention sweep per tick (performance-audit H5). Returns true if this
 * instance won the lock. Without Redis (single instance) it always returns true.
 */
async function acquireRetentionLock(ttlMs: number): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  const redis = getRedis();
  if (!redis) return true;
  try {
    // SET NX PX — only the first caller in the window gets the lock.
    const res = await redis.set("orbit:retention:lock", String(process.pid), "PX", ttlMs, "NX");
    return res === "OK";
  } catch {
    return true; // Redis blip → don't starve retention
  }
}

/**
 * Iterates every tenant once, deletes location_ping rows older than that
 * tenant's `organisation_setting.raw_location_retention_days`, and writes an
 * audit log entry with the deleted count.
 */
export async function runRetentionSweep(): Promise<{ tenants: number; totalDeleted: number; partitionsDropped: number }> {
  // Keep location_ping partitions provisioned, then drop whole months older than
  // the MAX tenant retention (so no tenant loses data early). The per-tenant
  // DELETE below still trims precisely within the live partitions (audit C5).
  await ensureLocationPingPartitions();
  const maxKeep = await queryRows<{ d: number }>(
    `SELECT COALESCE(MAX(raw_location_retention_days), 365)::int AS d FROM organisation_setting`
  );
  const partitionsDropped = await dropExpiredLocationPingPartitions(maxKeep[0]?.d ?? 365);

  const tenants = await queryRows<{ id: string }>(`SELECT id FROM organisation`);
  let totalDeleted = 0;
  for (const { id } of tenants) {
    try {
      const deleted = await sweepExpiredPings(id);
      totalDeleted += deleted;
      if (deleted > 0) {
        await writeAuditLog({
          organisationId: id,
          actorUserId: null,
          action: "tracking.location.retention_swept",
          targetType: "organisation",
          targetId: id,
          metadata: { deleted }
        });
      }
    } catch (error) {
      process.stderr.write(
        `[retention] tenant=${id} sweep failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
  return { tenants: tenants.length, totalDeleted, partitionsDropped };
}

/**
 * Starts an interval-based retention sweep.
 *   - production: on by default, can be disabled with RETENTION_SWEEP_ENABLED=false
 *   - development: off by default, opt-in with RETENTION_SWEEP_ENABLED=true
 * Interval defaults to 24h (`RETENTION_SWEEP_INTERVAL_MS`).
 */
export function startRetentionScheduler(): void {
  if (timer) return;
  const env = getEnv();
  if (!env.retentionSweepEnabled) return;
  const interval = env.retentionSweepIntervalMs;

  const tick = async () => {
    try {
      // Only the leader runs the sweep; lock TTL ~= one tick so it auto-releases.
      const won = await acquireRetentionLock(Math.min(interval, 60 * 60 * 1000));
      if (!won) {
        process.stdout.write("[retention] another instance holds the lock; skipping\n");
        return;
      }
      const summary = await runRetentionSweep();
      process.stdout.write(
        `[retention] swept tenants=${summary.tenants} deleted=${summary.totalDeleted}\n`
      );
    } catch (error) {
      process.stderr.write(
        `[retention] sweep failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  };

  void tick();
  timer = setInterval(() => void tick(), interval);
}

export function stopRetentionScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
