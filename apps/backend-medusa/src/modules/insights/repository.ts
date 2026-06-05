import { queryRows } from "../../db/client.js";

export interface CoverageRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  visit_count: number;
  last_visit: string | null;
}

/** Outlets with their completed-visit counts + last visit — feeds the coverage heatmap. */
export function queryCoverage(organisationId: string): Promise<CoverageRow[]> {
  return queryRows<CoverageRow>(
    `SELECT o.id,
            o.name,
            ST_Y(o.location::geometry) AS latitude,
            ST_X(o.location::geometry) AS longitude,
            COUNT(v.id)::int AS visit_count,
            MAX(v.checked_in_at) AS last_visit
     FROM outlet o
     LEFT JOIN visit v
       ON v.outlet_id = o.id AND v.organisation_id = o.organisation_id AND v.checked_in_at IS NOT NULL
     WHERE o.organisation_id = $1
     GROUP BY o.id, o.name, o.location
     ORDER BY visit_count DESC`,
    [organisationId]
  );
}

export interface AdherenceRow {
  user_id: string;
  planned_outlets: number;
  visited_outlets: number;
}

/** Per-rep planned vs actually-visited outlet counts for a date (route adherence). */
export function queryRouteAdherence(organisationId: string, date: string): Promise<AdherenceRow[]> {
  return queryRows<AdherenceRow>(
    `WITH planned AS (
       SELECT rp.assigned_user_id AS user_id,
              COUNT(DISTINCT rs.outlet_id)::int AS planned_outlets
       FROM route_plan rp
       JOIN route_stop rs ON rs.route_plan_id = rp.id AND rs.organisation_id = rp.organisation_id
       WHERE rp.organisation_id = $1 AND rp.route_date = $2
       GROUP BY rp.assigned_user_id
     ),
     visited AS (
       SELECT v.assigned_user_id AS user_id,
              COUNT(DISTINCT v.outlet_id)::int AS visited_outlets
       FROM visit v
       WHERE v.organisation_id = $1 AND v.visit_date = $2 AND v.checked_in_at IS NOT NULL
       GROUP BY v.assigned_user_id
     )
     SELECT p.user_id, p.planned_outlets, COALESCE(vi.visited_outlets, 0) AS visited_outlets
     FROM planned p
     LEFT JOIN visited vi ON vi.user_id = p.user_id
     ORDER BY p.user_id`,
    [organisationId, date]
  );
}

export interface OffTargetRow { user_id: string; total: number; off_target: number }
/** Per-rep off-target visit counts over the last `days` — for the leaderboard. */
export function queryOffTargetLeaderboard(organisationId: string, days: number): Promise<OffTargetRow[]> {
  return queryRows<OffTargetRow>(
    `SELECT assigned_user_id AS user_id, count(*)::int AS total,
            count(*) FILTER (WHERE geofence_status = 'exception')::int AS off_target
     FROM visit
     WHERE organisation_id = $1 AND assigned_user_id IS NOT NULL
       AND visit_date >= current_date - make_interval(days => $2)
     GROUP BY assigned_user_id HAVING count(*) > 0
     ORDER BY off_target DESC, total DESC`,
    [organisationId, days]
  );
}

export interface FunnelRow { leads_total: number; leads_qualified: number; leads_won: number; orders: number }
/** Lead → Qualified → Won → Order conversion funnel counts. */
export async function queryConversionFunnel(organisationId: string): Promise<FunnelRow> {
  const rows = await queryRows<FunnelRow>(
    `SELECT
       (SELECT count(*) FROM lead WHERE organisation_id = $1)::int AS leads_total,
       (SELECT count(*) FROM lead WHERE organisation_id = $1 AND status IN ('qualified','won'))::int AS leads_qualified,
       (SELECT count(*) FROM lead WHERE organisation_id = $1 AND status = 'won')::int AS leads_won,
       (SELECT count(*) FROM field_order WHERE organisation_id = $1 AND status <> 'cancelled')::int AS orders`,
    [organisationId]
  );
  return rows[0] ?? { leads_total: 0, leads_qualified: 0, leads_won: 0, orders: 0 };
}

export interface TimeOnFieldRow { user_id: string; visits: number; seconds: number }
/** Per-rep total in-visit time (sum of check-in→check-out) for a date. */
export function queryTimeOnField(organisationId: string, date: string): Promise<TimeOnFieldRow[]> {
  return queryRows<TimeOnFieldRow>(
    `SELECT assigned_user_id AS user_id, count(*)::int AS visits,
            COALESCE(SUM(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))), 0)::int AS seconds
     FROM visit
     WHERE organisation_id = $1 AND visit_date = $2 AND assigned_user_id IS NOT NULL
       AND checked_in_at IS NOT NULL AND checked_out_at IS NOT NULL
     GROUP BY assigned_user_id ORDER BY seconds DESC`,
    [organisationId, date]
  );
}

export interface VisitsPerDayRow { d: string; visits: number; completed: number }
/** Org-wide visits + completions per day for the last `days` (trend chart). */
export function queryVisitsPerDay(organisationId: string, days: number): Promise<VisitsPerDayRow[]> {
  return queryRows<VisitsPerDayRow>(
    `SELECT visit_date::text AS d, count(*)::int AS visits,
            count(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM visit WHERE organisation_id = $1 AND visit_date >= current_date - make_interval(days => $2)
     GROUP BY visit_date ORDER BY visit_date`,
    [organisationId, days]
  );
}

export interface OutcomeRow { outcome: string; n: number }
/** Completed-visit counts grouped by outcome over the last `days` (breakdown chart). */
export function queryVisitsByOutcome(organisationId: string, days: number): Promise<OutcomeRow[]> {
  return queryRows<OutcomeRow>(
    `SELECT COALESCE(NULLIF(outcome, ''), '(none)') AS outcome, count(*)::int AS n
     FROM visit WHERE organisation_id = $1 AND status = 'completed'
       AND visit_date >= current_date - make_interval(days => $2)
     GROUP BY 1 ORDER BY n DESC LIMIT 10`,
    [organisationId, days]
  );
}

export interface VisitQualitySummary {
  avg_rating: number;
  rated_visits: number;
  avg_nps: number;
  nps_responses: number;
  expense_cents: number;
  samples: number;
  competitor_notes: number;
}

/**
 * Org-wide aggregates of the rich visit details captured at check-out
 * (feedback_rating, nps_score, visit_expense, visit_sample,
 * visit_competitor_intel) over the last `days`. Surfaces the data reps enter
 * on the visit form into the dashboard.
 */
export async function queryVisitQuality(organisationId: string, days: number): Promise<VisitQualitySummary> {
  const rows = await queryRows<VisitQualitySummary>(
    `SELECT
       (SELECT COALESCE(AVG(feedback_rating), 0)::float8 FROM visit
          WHERE organisation_id=$1 AND feedback_rating IS NOT NULL
            AND visit_date >= current_date - make_interval(days => $2)) AS avg_rating,
       (SELECT count(*)::int FROM visit
          WHERE organisation_id=$1 AND feedback_rating IS NOT NULL
            AND visit_date >= current_date - make_interval(days => $2)) AS rated_visits,
       (SELECT COALESCE(AVG(nps_score), 0)::float8 FROM visit
          WHERE organisation_id=$1 AND nps_score IS NOT NULL
            AND visit_date >= current_date - make_interval(days => $2)) AS avg_nps,
       (SELECT count(*)::int FROM visit
          WHERE organisation_id=$1 AND nps_score IS NOT NULL
            AND visit_date >= current_date - make_interval(days => $2)) AS nps_responses,
       (SELECT COALESCE(SUM(e.amount_cents), 0)::int FROM visit_expense e
          JOIN visit v ON v.id = e.visit_id
          WHERE e.organisation_id=$1 AND v.visit_date >= current_date - make_interval(days => $2)) AS expense_cents,
       (SELECT COALESCE(SUM(s.quantity), 0)::int FROM visit_sample s
          JOIN visit v ON v.id = s.visit_id
          WHERE s.organisation_id=$1 AND v.visit_date >= current_date - make_interval(days => $2)) AS samples,
       (SELECT count(*)::int FROM visit_competitor_intel ci
          JOIN visit v ON v.id = ci.visit_id
          WHERE ci.organisation_id=$1 AND v.visit_date >= current_date - make_interval(days => $2)) AS competitor_notes`,
    [organisationId, days]
  );
  return rows[0] ?? { avg_rating: 0, rated_visits: 0, avg_nps: 0, nps_responses: 0, expense_cents: 0, samples: 0, competitor_notes: 0 };
}

export interface CompetitorRow { competitor_name: string; mentions: number }
/** Most-mentioned competitor brands from visit intel over the last `days`. */
export function queryTopCompetitors(organisationId: string, days: number): Promise<CompetitorRow[]> {
  return queryRows<CompetitorRow>(
    `SELECT ci.competitor_name, count(*)::int AS mentions
     FROM visit_competitor_intel ci
     JOIN visit v ON v.id = ci.visit_id
     WHERE ci.organisation_id=$1 AND NULLIF(trim(ci.competitor_name), '') IS NOT NULL
       AND v.visit_date >= current_date - make_interval(days => $2)
     GROUP BY ci.competitor_name ORDER BY mentions DESC, ci.competitor_name ASC LIMIT 8`,
    [organisationId, days]
  );
}

export interface ExpenseCategoryRow { category: string; total_cents: number }
/** Visit expenses grouped by category over the last `days`. */
export function queryExpensesByCategory(organisationId: string, days: number): Promise<ExpenseCategoryRow[]> {
  return queryRows<ExpenseCategoryRow>(
    `SELECT COALESCE(NULLIF(trim(e.category), ''), 'Other') AS category, SUM(e.amount_cents)::int AS total_cents
     FROM visit_expense e
     JOIN visit v ON v.id = e.visit_id
     WHERE e.organisation_id=$1 AND v.visit_date >= current_date - make_interval(days => $2)
     GROUP BY 1 ORDER BY total_cents DESC`,
    [organisationId, days]
  );
}

export interface RecentPingRow {
  user_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
}

/** Recent pings ordered by (user, time) for the fraud scan. Capped to bound the scan. */
export function queryRecentPings(organisationId: string, sinceHours: number, cap = 50_000): Promise<RecentPingRow[]> {
  return queryRows<RecentPingRow>(
    `SELECT user_id, latitude, longitude, recorded_at
     FROM location_ping
     WHERE organisation_id = $1 AND recorded_at >= now() - make_interval(hours => $2)
     ORDER BY user_id ASC, recorded_at ASC
     LIMIT $3`,
    [organisationId, sinceHours, cap]
  );
}
