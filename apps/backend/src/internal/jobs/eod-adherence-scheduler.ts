import { queryRows } from "../../db/client.js";
import { queryRouteAdherence } from "../../modules/insights/repository.js";
import { adherencePercent } from "../../modules/insights/geo.js";
import { notifyManagers } from "../../modules/notification/field-events.js";
import { getEnv } from "../../config/env.js";
import { getRedis, isRedisEnabled } from "../../redis/client.js";

let timer: NodeJS.Timeout | undefined;
let lastRunYmd = "";

/** Hour of day (server time, 0-23) at/after which the EOD summary fires. */
const EOD_HOUR = Number(process.env.EOD_ADHERENCE_HOUR) || 19;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Once-per-day lock across instances (date in the key, ~26h TTL). */
async function acquireDayLock(ymd: string): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set(`orbit:eod-adherence:${ymd}`, String(process.pid), "PX", 26 * 60 * 60 * 1000, "NX");
    return res === "OK";
  } catch {
    return true;
  }
}

/**
 * Compute today's route adherence per org and send each org's managers a summary.
 * Exported for manual invocation / tests. Returns the number of orgs notified.
 */
export async function runEndOfDayAdherence(): Promise<{ orgsNotified: number }> {
  const ymd = today();
  const orgs = await queryRows<{ id: string }>(`SELECT id FROM organisation`);
  let notified = 0;
  for (const { id: organisationId } of orgs) {
    const rows = await queryRouteAdherence(organisationId, ymd);
    if (rows.length === 0) continue; // no plans today → nothing to report
    const planned = rows.reduce((s, r) => s + r.planned_outlets, 0);
    const visited = rows.reduce((s, r) => s + r.visited_outlets, 0);
    const overall = adherencePercent(planned, visited);
    const laggards = rows.filter((r) => adherencePercent(r.planned_outlets, r.visited_outlets) < 80).length;
    await notifyManagers(organisationId, {
      type: "adherence.end_of_day",
      title: `End-of-day adherence: ${overall}%`,
      body: `${visited}/${planned} planned outlets visited across ${rows.length} rep(s)` +
        (laggards > 0 ? ` · ${laggards} below 80%` : ""),
      data: { date: ymd, plannedOutlets: planned, visitedOutlets: visited, adherencePercent: overall, repsBelowTarget: laggards }
    });
    notified += 1;
  }
  return { orgsNotified: notified };
}

/**
 * Fires the end-of-day adherence summary once per day, at/after EOD_HOUR (server
 * time). Reuses the session-expiry enable flag + interval as the "background jobs
 * on" signal; disable independently with EOD_ADHERENCE_ENABLED=false.
 */
export function startEodAdherenceScheduler(): void {
  if (timer) return;
  const env = getEnv();
  if (!env.sessionExpiryEnabled) return;
  if (process.env.EOD_ADHERENCE_ENABLED === "false") return;
  const interval = env.sessionExpiryIntervalMs;

  const tick = async () => {
    try {
      const ymd = today();
      if (lastRunYmd === ymd) return;
      if (new Date().getHours() < EOD_HOUR) return;
      if (!(await acquireDayLock(ymd))) { lastRunYmd = ymd; return; }
      const summary = await runEndOfDayAdherence();
      lastRunYmd = ymd;
      process.stdout.write(`[eod-adherence] sent summary to ${summary.orgsNotified} org(s) for ${ymd}\n`);
    } catch (error) {
      process.stderr.write(`[eod-adherence] failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };

  void tick();
  timer = setInterval(() => void tick(), interval);
}

export function stopEodAdherenceScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
