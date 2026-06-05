import { getDatabasePool, queryRows } from "../../db/client.js";

// --- Payments / ledger ----------------------------------------------------

export async function recordPayment(input: {
  id: string;
  organisationId: string;
  outletId: string;
  orderId?: string | null;
  collectedBy: string;
  amountCents: number;
  method: string;
  note?: string | null;
}): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO payment (id, organisation_id, outlet_id, order_id, collected_by, amount_cents, method, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.id, input.organisationId, input.outletId, input.orderId ?? null, input.collectedBy, input.amountCents, input.method, input.note ?? null]
  );
}

export async function outletLedger(organisationId: string, outletId: string): Promise<{ orderedCents: number; paidCents: number }> {
  const ordered = await queryRows<{ s: string }>(
    `SELECT COALESCE(SUM(total_cents),0)::text AS s FROM field_order WHERE organisation_id = $1 AND outlet_id = $2 AND status <> 'cancelled'`,
    [organisationId, outletId]
  );
  const paid = await queryRows<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents),0)::text AS s FROM payment WHERE organisation_id = $1 AND outlet_id = $2`,
    [organisationId, outletId]
  );
  return { orderedCents: Number(ordered[0]?.s ?? 0), paidCents: Number(paid[0]?.s ?? 0) };
}

export interface PaymentRow {
  id: string; outlet_id: string; order_id: string | null; collected_by: string;
  amount_cents: number; method: string; note: string | null; created_at: string;
}
export function listPayments(organisationId: string, outletId: string): Promise<PaymentRow[]> {
  return queryRows<PaymentRow>(
    `SELECT id, outlet_id, order_id, collected_by, amount_cents, method, note, created_at
     FROM payment WHERE organisation_id = $1 AND outlet_id = $2 ORDER BY created_at DESC LIMIT 200`,
    [organisationId, outletId]
  );
}

// --- Beat plans (PJP) -----------------------------------------------------

export async function createBeatPlan(input: {
  id: string; organisationId: string; repUserId: string; outletId: string; weekdays: string;
}): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO beat_plan (id, organisation_id, rep_user_id, outlet_id, weekdays)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.id, input.organisationId, input.repUserId, input.outletId, input.weekdays]
  );
}

export interface BeatPlanRow {
  id: string; rep_user_id: string; outlet_id: string; weekdays: string; active: boolean;
}
export function listBeatPlans(organisationId: string, repUserId?: string): Promise<BeatPlanRow[]> {
  if (repUserId) {
    return queryRows<BeatPlanRow>(
      `SELECT id, rep_user_id, outlet_id, weekdays, active FROM beat_plan
       WHERE organisation_id = $1 AND rep_user_id = $2 AND active = true ORDER BY created_at DESC`,
      [organisationId, repUserId]
    );
  }
  return queryRows<BeatPlanRow>(
    `SELECT id, rep_user_id, outlet_id, weekdays, active FROM beat_plan
     WHERE organisation_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1000`,
    [organisationId]
  );
}

// --- Attendance -----------------------------------------------------------

export async function checkInAttendance(input: {
  id: string; organisationId: string; userId: string; date: string;
  latitude: number | null; longitude: number | null;
}): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO attendance (id, organisation_id, user_id, attendance_date, status, checked_in_at, check_in_latitude, check_in_longitude)
     VALUES ($1,$2,$3,$4,'present',now(),$5,$6)
     ON CONFLICT (organisation_id, user_id, attendance_date) DO NOTHING`,
    [input.id, input.organisationId, input.userId, input.date, input.latitude, input.longitude]
  );
}

export async function checkOutAttendance(organisationId: string, userId: string, date: string): Promise<boolean> {
  const res = await getDatabasePool().query(
    `UPDATE attendance SET checked_out_at = now()
     WHERE organisation_id = $1 AND user_id = $2 AND attendance_date = $3 AND checked_out_at IS NULL`,
    [organisationId, userId, date]
  );
  return (res.rowCount ?? 0) > 0;
}

export interface AttendanceRow {
  user_id: string; attendance_date: string; status: string; checked_in_at: string | null; checked_out_at: string | null;
}
export function listAttendance(organisationId: string, date: string): Promise<AttendanceRow[]> {
  return queryRows<AttendanceRow>(
    `SELECT user_id, attendance_date, status, checked_in_at, checked_out_at
     FROM attendance WHERE organisation_id = $1 AND attendance_date = $2 ORDER BY user_id`,
    [organisationId, date]
  );
}

// --- Surveys --------------------------------------------------------------

export async function createSurvey(input: {
  id: string; organisationId: string; name: string; definition: unknown;
}): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO survey (id, organisation_id, name, definition) VALUES ($1,$2,$3,$4)`,
    [input.id, input.organisationId, input.name, JSON.stringify(input.definition ?? {})]
  );
}

export interface SurveyRow { id: string; name: string; definition: unknown; active: boolean; created_at: string; }
export function listSurveys(organisationId: string): Promise<SurveyRow[]> {
  return queryRows<SurveyRow>(
    `SELECT id, name, definition, active, created_at FROM survey WHERE organisation_id = $1 AND active = true ORDER BY created_at DESC`,
    [organisationId]
  );
}

export async function submitSurveyResponse(input: {
  id: string; organisationId: string; surveyId: string; submittedBy: string; outletId?: string | null; answers: unknown;
}): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO survey_response (id, organisation_id, survey_id, submitted_by, outlet_id, answers)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.id, input.organisationId, input.surveyId, input.submittedBy, input.outletId ?? null, JSON.stringify(input.answers ?? {})]
  );
}

export interface SurveyResponseRow { id: string; survey_id: string; submitted_by: string; outlet_id: string | null; answers: unknown; created_at: string; }
export function listSurveyResponses(organisationId: string, surveyId: string): Promise<SurveyResponseRow[]> {
  return queryRows<SurveyResponseRow>(
    `SELECT id, survey_id, submitted_by, outlet_id, answers, created_at
     FROM survey_response WHERE organisation_id = $1 AND survey_id = $2 ORDER BY created_at DESC LIMIT 500`,
    [organisationId, surveyId]
  );
}

// --- Reorder cadence + mileage inputs ------------------------------------

export interface OutletOrderTimes { outlet_id: string; name: string; order_times: string[] }
/** Order timestamps per outlet over the last `days` — JS computes the reorder score. */
export async function outletOrderHistory(organisationId: string, days = 180): Promise<OutletOrderTimes[]> {
  return queryRows<OutletOrderTimes>(
    `SELECT o.id AS outlet_id, o.name,
            ARRAY_AGG(fo.created_at ORDER BY fo.created_at) FILTER (WHERE fo.id IS NOT NULL) AS order_times
     FROM outlet o
     LEFT JOIN field_order fo
       ON fo.outlet_id = o.id AND fo.organisation_id = o.organisation_id
       AND fo.status <> 'cancelled' AND fo.created_at >= now() - make_interval(days => $2)
     WHERE o.organisation_id = $1
     GROUP BY o.id, o.name`,
    [organisationId, days]
  );
}

export interface RepDayPing { user_id: string; latitude: number; longitude: number; recorded_at: string }
/** Pings for a date ordered by (rep, time) — JS sums haversine distance for mileage. */
export function pingsForDate(organisationId: string, date: string): Promise<RepDayPing[]> {
  return queryRows<RepDayPing>(
    `SELECT user_id, latitude, longitude, recorded_at
     FROM location_ping
     WHERE organisation_id = $1 AND recorded_at >= $2::date AND recorded_at < ($2::date + interval '1 day')
     ORDER BY user_id ASC, recorded_at ASC
     LIMIT 100000`,
    [organisationId, date]
  );
}
