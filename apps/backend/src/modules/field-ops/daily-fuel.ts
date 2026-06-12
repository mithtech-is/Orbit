/**
 * Daily fuel expense computation, run on work-session stop.
 *
 * Pipeline:
 *   actual_km   = haversine sum of every ping in the session window
 *   planned_km  = sum(route_plan.planned_distance_meters) for the rep's route plans dated today
 *   deviation_km = max(0, actual_km - planned_km)
 *
 *   rate        = resolveFuelRate(org, rep)
 *   amount_cents           = round(actual_km   * rate_per_km_cents)
 *   deviation_amount_cents = round(deviation_km * rate_per_km_cents)
 *
 *   over_limit  = (org.daily_fuel_limit_cents > 0 && amount > limit) || deviation_km > 0
 *
 * UPSERT into field_expense (unique on org+rep+date+category) so a session that
 * starts/stops multiple times in a day collapses to a single row that always
 * reflects the latest figure. Status starts 'pending' — every expense requires
 * approval per the product decision. ERPNext sync is best-effort + async.
 */

import { queryRows } from "../../db/client.js";
import { sumPingDistance, type PingSample } from "./distance-calculator.js";
import { resolveFuelRate, type ResolvedFuelRate } from "./fuel-rate.js";

export interface DailyFuelInput {
  organisationId: string;
  repUserId: string;
  workSessionId: string;
  /**
   * Window over which to sum pings. Pass the session's `started_at` and either
   * its `ended_at` or "now". Stored in UTC ISO format.
   */
  windowStart: string;
  windowEnd: string;
  /** Day to attribute the expense to (YYYY-MM-DD). Defaults to windowEnd's date in UTC. */
  expenseDate?: string;
}

export interface DailyFuelResult {
  expenseId: string;
  actualKm: number;
  plannedKm: number;
  deviationKm: number;
  ratePerKmCents: number;
  rateSource: ResolvedFuelRate["source"];
  amountCents: number;
  deviationAmountCents: number;
  overLimit: boolean;
  dailyLimitCents: number;
  /** True if a row already existed and we updated it (vs. fresh insert). */
  updated: boolean;
  /** True when the rate resolved to 0 — no expense row was written. */
  skipped: boolean;
}

function todayUtc(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Stable id derived from (rep, date) so the same day always lands on the same
 * row even across many stop-session calls. UUID would be wrong here.
 */
function fuelExpenseId(repUserId: string, date: string): string {
  return `fexp_${date.replace(/-/g, "")}_${repUserId}`;
}

interface OrgLimitRow { daily_fuel_limit_cents: number | null }
interface PlannedRow { total_meters: number | null }

export async function computeAndStoreDailyFuel(input: DailyFuelInput): Promise<DailyFuelResult> {
  const date = input.expenseDate ?? todayUtc(input.windowEnd);
  const expenseId = fuelExpenseId(input.repUserId, date);

  // 1) Resolve the effective rate FIRST — if zero, skip the whole pipeline.
  //    Rationale: a rep with no rate configured shouldn't generate a phantom
  //    0-amount "pending" row that an admin then has to approve.
  const rate = await resolveFuelRate(input.organisationId, input.repUserId);
  if (rate.ratePerKmCents <= 0) {
    return {
      expenseId,
      actualKm: 0,
      plannedKm: 0,
      deviationKm: 0,
      ratePerKmCents: 0,
      rateSource: rate.source,
      amountCents: 0,
      deviationAmountCents: 0,
      overLimit: false,
      dailyLimitCents: 0,
      updated: false,
      skipped: true
    };
  }

  // 2) Sum pings for the session window. We bound by session window (NOT day)
  //    so an overnight session attributes its distance to the day it stops.
  const pings = await queryRows<PingSample>(
    `SELECT latitude, longitude, recorded_at AS "recordedAt"
     FROM location_ping
     WHERE organisation_id = $1 AND user_id = $2
       AND recorded_at >= $3 AND recorded_at <= $4
     ORDER BY recorded_at ASC`,
    [input.organisationId, input.repUserId, input.windowStart, input.windowEnd]
  );
  const actualMeters = sumPingDistance(pings);
  const actualKm = Math.round(actualMeters / 10) / 100;

  // 3) Planned distance for the day = sum of every route_plan assigned to this
  //    rep dated `expenseDate`. Reps can have multiple plans/day (one per beat),
  //    so we sum them. If no plan is assigned, planned_km = 0 → all actual_km
  //    counts as deviation (you walked off-plan because there was no plan).
  const planned = await queryRows<PlannedRow>(
    `SELECT COALESCE(SUM(planned_distance_meters), 0)::float8 AS total_meters
     FROM route_plan
     WHERE organisation_id = $1 AND assigned_user_id = $2 AND route_date = $3::date`,
    [input.organisationId, input.repUserId, date]
  );
  const plannedKm = Math.round(((planned[0]?.total_meters ?? 0) / 1000) * 100) / 100;
  const deviationKm = Math.max(0, Math.round((actualKm - plannedKm) * 100) / 100);

  // 4) Amount = actual × rate (NOT planned). Deviation amount surfaces the extra
  //    spend caused by the off-plan portion — for the manager's approval call.
  const amountCents = Math.round(actualKm * rate.ratePerKmCents);
  const deviationAmountCents = Math.round(deviationKm * rate.ratePerKmCents);

  // 5) Daily limit + over-limit flag. Zero limit = no cap. Any deviation also
  //    raises the flag so the rep gets prompted for a reason.
  const limitRows = await queryRows<OrgLimitRow>(
    `SELECT daily_fuel_limit_cents FROM organisation_setting WHERE organisation_id = $1`,
    [input.organisationId]
  );
  const dailyLimitCents = limitRows[0]?.daily_fuel_limit_cents ?? 0;
  const overLimit = (dailyLimitCents > 0 && amountCents > dailyLimitCents) || deviationKm > 0;

  // 6) UPSERT. The UNIQUE (org, rep, date, category) constraint collapses
  //    multiple session stops in a single day into one row. We preserve any
  //    rep-entered `reason` and approval state on update — we only overwrite
  //    the computed columns.
  const existingRows = await queryRows<{ id: string }>(
    `SELECT id FROM field_expense
     WHERE organisation_id = $1 AND rep_user_id = $2 AND expense_date = $3::date AND category = 'fuel'`,
    [input.organisationId, input.repUserId, date]
  );
  const updated = existingRows.length > 0;

  await queryRows(
    `INSERT INTO field_expense
       (id, organisation_id, rep_user_id, work_session_id, expense_date, category,
        actual_distance_km, planned_distance_km, deviation_km,
        rate_per_km_cents, amount_cents, deviation_amount_cents,
        over_limit, status, metadata)
     VALUES ($1, $2, $3, $4, $5::date, 'fuel',
             $6, $7, $8,
             $9, $10, $11,
             $12, 'pending', $13::jsonb)
     ON CONFLICT (organisation_id, rep_user_id, expense_date, category) DO UPDATE
       SET work_session_id        = EXCLUDED.work_session_id,
           actual_distance_km     = EXCLUDED.actual_distance_km,
           planned_distance_km    = EXCLUDED.planned_distance_km,
           deviation_km           = EXCLUDED.deviation_km,
           rate_per_km_cents      = EXCLUDED.rate_per_km_cents,
           amount_cents           = EXCLUDED.amount_cents,
           deviation_amount_cents = EXCLUDED.deviation_amount_cents,
           over_limit             = EXCLUDED.over_limit,
           metadata               = EXCLUDED.metadata
       WHERE field_expense.status = 'pending'`,
    [
      expenseId,
      input.organisationId,
      input.repUserId,
      input.workSessionId,
      date,
      actualKm,
      plannedKm,
      deviationKm,
      rate.ratePerKmCents,
      amountCents,
      deviationAmountCents,
      overLimit,
      JSON.stringify({
        rateSource: rate.source,
        vehicleTypeId: rate.vehicleTypeId,
        vehicleTypeName: rate.vehicleTypeName,
        repOverrideCents: rate.repOverrideCents,
        pingCount: pings.length
      })
    ]
  );

  return {
    expenseId,
    actualKm,
    plannedKm,
    deviationKm,
    ratePerKmCents: rate.ratePerKmCents,
    rateSource: rate.source,
    amountCents,
    deviationAmountCents,
    overLimit,
    dailyLimitCents,
    updated,
    skipped: false
  };
}
