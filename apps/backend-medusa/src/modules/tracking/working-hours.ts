import { queryRows } from "../../db/client.js";

/**
 * Determines whether "now" falls inside the organisation's configured working
 * window (working_days + working_hours_start/end, in the org's timezone).
 *
 * Used to gate location-sharing opt-out: a rep may freely turn sharing off
 * OUTSIDE working hours, but DURING working hours they must supply a reason
 * (the "exception" path), which is stored and surfaced to admins.
 */

interface OrgHoursRow {
  working_hours_start: string; // "09:00"
  working_hours_end: string; // "17:00"
  working_days: string; // "mon,tue,wed,thu,fri"
  timezone: string; // IANA, e.g. "Asia/Kolkata"
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Returns the {weekday, minutes-since-midnight} for `at` in the given IANA
 * timezone, using Intl so we don't pull in a tz library. Falls back to UTC if
 * the timezone is invalid.
 */
function localParts(at: Date, timeZone: string): { dayKey: string; minutes: number } {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const parts = fmt.formatToParts(at);
  const weekday = (parts.find((p) => p.type === "weekday")?.value ?? "Mon").toLowerCase().slice(0, 3);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl can render "24" for midnight under hour12:false — normalise.
  const h = hour === 24 ? 0 : hour;
  return { dayKey: weekday, minutes: h * 60 + minute };
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Pure predicate — exported for unit testing without a DB. */
export function isWithinWorkingHours(at: Date, hours: OrgHoursRow): boolean {
  const days = hours.working_days.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const { dayKey, minutes } = localParts(at, hours.timezone || "UTC");
  if (!days.includes(dayKey)) return false;
  const start = parseHHMM(hours.working_hours_start);
  const end = parseHHMM(hours.working_hours_end);
  // Normal same-day window (start < end). Overnight windows are uncommon for
  // field sales; if configured (start >= end) treat as "wraps past midnight".
  if (start <= end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

/** Loads the org's working window and evaluates it against `at` (default now). */
export async function isOrgWithinWorkingHours(organisationId: string, at: Date = new Date()): Promise<boolean> {
  const rows = await queryRows<OrgHoursRow>(
    `SELECT working_hours_start, working_hours_end, working_days, timezone
     FROM organisation_setting WHERE organisation_id = $1`,
    [organisationId]
  );
  const hours = rows[0];
  if (!hours) return false; // no settings → don't block opt-out
  return isWithinWorkingHours(at, hours);
}

// re-export for the route handler's convenience.
export const _DAY_KEYS = DAY_KEYS;
