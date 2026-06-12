import { randomUUID } from "node:crypto";
import { getDatabasePool, queryRows } from "../../db/client.js";
import { calculateVisitDistance } from "../field-ops/distance-calculator.js";
import { paginate } from "../../http/pagination.js";

/**
 * Default cap on a single /visits response. A manager viewing a 10k-rep org
 * could otherwise pull the entire tenant's visit history in one payload; this
 * returns the most recent page and flags `hasMore` so the client knows to page.
 */
export const VISIT_PAGE_DEFAULT = 500;
export const VISIT_PAGE_MAX = 1000;

export interface VisitRow {
  id: string;
  organisation_id: string;
  outlet_id: string;
  assigned_user_id: string;
  visit_date: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  geofence_status: string | null;
}

export interface VisitPage {
  items: VisitRow[];
  hasMore: boolean;
}

export interface VisitRepository {
  queryVisits(organisationId: string, assignedUserId?: string, limit?: number): Promise<VisitPage>;
  queryVisitById(id: string): Promise<VisitRow | undefined>;
}

const VISIT_COLUMNS = `id, organisation_id, outlet_id, assigned_user_id,
                       visit_date, status, outcome, notes,
                       checked_in_at, checked_out_at,
                       check_in_latitude, check_in_longitude,
                       geofence_status`;

export function createVisitRepository(): VisitRepository {
  return {
    async queryVisits(organisationId, assignedUserId, limit = VISIT_PAGE_DEFAULT) {
      // Fetch limit + 1 so paginate() can detect whether more rows exist without
      // a second COUNT query.
      const fetch = limit + 1;
      const rows = assignedUserId
        ? await queryRows<VisitRow>(
            `SELECT ${VISIT_COLUMNS}
             FROM visit
             WHERE organisation_id = $1 AND assigned_user_id = $2
             ORDER BY visit_date DESC, checked_in_at DESC NULLS LAST
             LIMIT $3`,
            [organisationId, assignedUserId, fetch]
          )
        : await queryRows<VisitRow>(
            `SELECT ${VISIT_COLUMNS}
             FROM visit
             WHERE organisation_id = $1
             ORDER BY visit_date DESC, checked_in_at DESC NULLS LAST
             LIMIT $2`,
            [organisationId, fetch]
          );
      return paginate(rows, limit);
    },

    async queryVisitById(id) {
      const rows = await queryRows<VisitRow>(
        `SELECT id, organisation_id, outlet_id, assigned_user_id,
                visit_date, status, outcome, notes,
                checked_in_at, checked_out_at,
                check_in_latitude, check_in_longitude,
                geofence_status
         FROM visit WHERE id = $1`,
        [id]
      );
      return rows[0];
    }
  };
}

export async function checkInToVisit(input: {
  id: string;
  organisationId: string;
  outletId: string;
  assignedUserId: string;
  latitude: number;
  longitude: number;
  geofenceStatus: string;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO visit (id, organisation_id, outlet_id, assigned_user_id,
                        visit_date, status,
                        checked_in_at, check_in_latitude, check_in_longitude,
                        geofence_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       checked_in_at = EXCLUDED.checked_in_at,
       check_in_latitude = EXCLUDED.check_in_latitude,
       check_in_longitude = EXCLUDED.check_in_longitude,
       geofence_status = EXCLUDED.geofence_status`,
    [
      input.id, input.organisationId, input.outletId, input.assignedUserId,
      new Date().toISOString().slice(0, 10), "in_progress",
      new Date().toISOString(), input.latitude, input.longitude,
      input.geofenceStatus
    ]
  );
}

/** A visit shorter than this on check-out is auto-flagged as a no-show. */
const NO_SHOW_SECONDS = Number(process.env.NO_SHOW_MIN_SECONDS) || 60;

export async function checkOutFromVisit(input: {
  id: string;
  organisationId: string;
  outcome: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}): Promise<void> {
  const pool = getDatabasePool();
  // No-show auto-detection: a visit whose check-in→check-out gap is under the
  // threshold is marked 'no_show' instead of 'completed'.
  await pool.query(
    `UPDATE visit
     SET status = CASE
           WHEN checked_in_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (now() - checked_in_at)) < $8 THEN 'no_show'
           ELSE 'completed' END,
         checked_out_at = $1::timestamptz,
         outcome = $2::text,
         notes = COALESCE($3::text, notes),
         check_in_latitude = COALESCE(check_in_latitude, $4::double precision),
         check_in_longitude = COALESCE(check_in_longitude, $5::double precision)
     WHERE id = $6 AND organisation_id = $7`,
    [
      new Date().toISOString(),
      input.outcome,
      input.notes,
      input.latitude,
      input.longitude,
      input.id,
      input.organisationId,
      NO_SHOW_SECONDS
    ]
  );
}

/** Manager schedules a one-off visit for a rep (status 'planned', appears in My Day). */
export async function scheduleVisit(input: {
  id: string;
  organisationId: string;
  outletId: string;
  assignedUserId: string;
  visitDate: string;
  objective?: string | null;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO visit (id, organisation_id, outlet_id, assigned_user_id, visit_date, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'planned', $6)`,
    [input.id, input.organisationId, input.outletId, input.assignedUserId, input.visitDate, input.objective ?? null]
  );
}

/** True if the rep has another OPEN (in-progress, not checked out) visit. */
export async function hasOtherOpenVisit(organisationId: string, userId: string, exceptVisitId: string): Promise<boolean> {
  const rows = await queryRows<{ n: string }>(
    `SELECT count(*)::text AS n FROM visit
     WHERE organisation_id = $1 AND assigned_user_id = $2
       AND status = 'in_progress' AND checked_out_at IS NULL AND id <> $3`,
    [organisationId, userId, exceptVisitId]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Abandon the rep's own OPEN visits left over from a PRIOR day. A visit started
 * yesterday (or earlier) and never checked out is abandoned — closing it on the
 * next check-in clears the "open_visit_exists" block with no time-threshold
 * guesswork (strictly previous-calendar-day). Returns the closed visit ids.
 */
export async function closeStalePriorDayVisits(organisationId: string, userId: string): Promise<string[]> {
  const pool = getDatabasePool();
  const res = await pool.query<{ id: string }>(
    `UPDATE visit
        SET status = 'no_show', checked_out_at = COALESCE(checked_out_at, now())
      WHERE organisation_id = $1 AND assigned_user_id = $2
        AND status = 'in_progress' AND checked_out_at IS NULL
        AND visit_date < current_date
      RETURNING id`,
    [organisationId, userId]
  );
  return res.rows.map((r) => r.id);
}

/**
 * Rep discards their OWN open visit (checked in by mistake / never completed).
 * Marks it 'no_show' so it stops blocking new check-ins and is excluded from
 * completion counts. Owner-scoped — a rep can only cancel their own.
 */
export async function cancelOpenVisit(visitId: string, organisationId: string, userId: string): Promise<boolean> {
  const pool = getDatabasePool();
  const res = await pool.query(
    `UPDATE visit
        SET status = 'no_show', checked_out_at = COALESCE(checked_out_at, now())
      WHERE id = $1 AND organisation_id = $2 AND assigned_user_id = $3 AND status = 'in_progress'`,
    [visitId, organisationId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Geofence status of a visit, or undefined when the visit doesn't exist. */
export async function getVisitGeofenceStatus(visitId: string, organisationId: string): Promise<string | null | undefined> {
  const rows = await queryRows<{ geofence_status: string | null }>(
    `SELECT geofence_status FROM visit WHERE id = $1 AND organisation_id = $2`,
    [visitId, organisationId]
  );
  return rows.length ? rows[0].geofence_status : undefined;
}

export interface AbandonedVisitRow { id: string; organisation_id: string; assigned_user_id: string }

/**
 * Close visits stuck "in_progress" with no check-out past the threshold, marking
 * them 'no_show'. Returns the closed rows for audit. Used by the sweep scheduler.
 */
export async function expireAbandonedVisits(thresholdSeconds: number): Promise<AbandonedVisitRow[]> {
  const pool = getDatabasePool();
  const res = await pool.query<AbandonedVisitRow>(
    `UPDATE visit SET status = 'no_show', checked_out_at = now()
     WHERE status = 'in_progress' AND checked_out_at IS NULL AND checked_in_at IS NOT NULL
       AND checked_in_at < now() - make_interval(secs => $1)
     RETURNING id, organisation_id, assigned_user_id`,
    [thresholdSeconds]
  );
  return res.rows;
}

// --- Phase 3: richer visit capture ---

export interface VisitExpenseInput { category: string; amountCents: number; kms?: number | null; note?: string | null }
export interface VisitCompetitorIntelInput { competitorName: string; productName?: string | null; priceCents?: number | null; promo?: string | null; note?: string | null }
export interface VisitSampleInput { itemName: string; quantity: number; recipientName?: string | null; note?: string | null }

export interface VisitExtrasInput {
  feedbackRating?: number | null;
  npsScore?: number | null;
  feedbackText?: string | null;
  signedBy?: string | null;
  signaturePath?: string | null;
  expenses?: VisitExpenseInput[];
  competitorIntel?: VisitCompetitorIntelInput[];
  samples?: VisitSampleInput[];
}

/** True when the extras payload carries anything worth persisting. */
export function hasVisitExtras(e: VisitExtrasInput | undefined): e is VisitExtrasInput {
  if (!e) return false;
  return (
    e.feedbackRating != null || e.npsScore != null || (e.feedbackText?.trim()?.length ?? 0) > 0 ||
    (e.signedBy?.trim()?.length ?? 0) > 0 || (e.signaturePath?.trim()?.length ?? 0) > 0 ||
    (e.expenses?.length ?? 0) > 0 || (e.competitorIntel?.length ?? 0) > 0 || (e.samples?.length ?? 0) > 0
  );
}

/**
 * Persist the richer-capture extras for a visit. Feedback/NPS/signature go on the
 * visit row (COALESCE keeps existing when a field is omitted). Child rows
 * (expenses/intel/samples) are replaced wholesale so a re-checkout reflects the
 * latest state rather than duplicating. Best-effort: caller swallows errors.
 */
export async function recordVisitExtras(visitId: string, organisationId: string, extras: VisitExtrasInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE visit SET
        feedback_rating = COALESCE($3::int, feedback_rating),
        nps_score = COALESCE($4::int, nps_score),
        feedback_text = COALESCE($5::text, feedback_text),
        signed_by = COALESCE($6::text, signed_by),
        signature_path = COALESCE($7::text, signature_path)
      WHERE id = $1 AND organisation_id = $2`,
    [
      visitId, organisationId,
      extras.feedbackRating ?? null,
      extras.npsScore ?? null,
      extras.feedbackText?.trim() || null,
      extras.signedBy?.trim() || null,
      extras.signaturePath?.trim() || null
    ]
  );

  if (extras.expenses) {
    await pool.query(`DELETE FROM visit_expense WHERE visit_id = $1 AND organisation_id = $2`, [visitId, organisationId]);
    for (const e of extras.expenses) {
      if (!e.category?.trim() || !Number.isFinite(e.amountCents)) continue;
      await pool.query(
        `INSERT INTO visit_expense (id, organisation_id, visit_id, category, amount_cents, kms, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), organisationId, visitId, e.category.trim(), Math.round(e.amountCents), e.kms ?? null, e.note?.trim() || null]
      );
    }

    const dist = await calculateVisitDistance(organisationId, visitId).catch(() => null);
    if (dist && dist.pingCount > 0) {
      await pool.query(
        `UPDATE visit_expense SET calculated_kms = $1 WHERE visit_id = $2 AND organisation_id = $3 AND calculated_kms IS NULL AND LOWER(category) = 'mileage'`,
        [dist.distanceKm, visitId, organisationId]
      );
      await pool.query(
        `UPDATE visit_expense SET kms = $1 WHERE visit_id = $2 AND organisation_id = $3 AND kms IS NULL AND LOWER(category) = 'mileage'`,
        [dist.distanceKm, visitId, organisationId]
      );
    }
  }

  if (extras.competitorIntel) {
    await pool.query(`DELETE FROM visit_competitor_intel WHERE visit_id = $1 AND organisation_id = $2`, [visitId, organisationId]);
    for (const c of extras.competitorIntel) {
      if (!c.competitorName?.trim()) continue;
      await pool.query(
        `INSERT INTO visit_competitor_intel (id, organisation_id, visit_id, competitor_name, product_name, price_cents, promo, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), organisationId, visitId, c.competitorName.trim(), c.productName?.trim() || null,
         c.priceCents != null ? Math.round(c.priceCents) : null, c.promo?.trim() || null, c.note?.trim() || null]
      );
    }
  }

  if (extras.samples) {
    await pool.query(`DELETE FROM visit_sample WHERE visit_id = $1 AND organisation_id = $2`, [visitId, organisationId]);
    for (const sple of extras.samples) {
      if (!sple.itemName?.trim()) continue;
      await pool.query(
        `INSERT INTO visit_sample (id, organisation_id, visit_id, item_name, quantity, recipient_name, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), organisationId, visitId, sple.itemName.trim(), sple.quantity || 1, sple.recipientName?.trim() || null, sple.note?.trim() || null]
      );
    }
  }
}

export interface VisitExtras {
  feedbackRating: number | null;
  npsScore: number | null;
  feedbackText: string | null;
  signedBy: string | null;
  signaturePath: string | null;
  expenses: Array<{ id: string; category: string; amountCents: number; kms: number | null; calculatedKms: number | null; note: string | null }>;
  totalExpenseCents: number;
  competitorIntel: Array<{ id: string; competitorName: string; productName: string | null; priceCents: number | null; promo: string | null; note: string | null }>;
  samples: Array<{ id: string; itemName: string; quantity: number; recipientName: string | null; note: string | null }>;
}

/** Read back a visit's captured extras (for the manager dashboard / detail view). */
export async function readVisitExtras(visitId: string, organisationId: string): Promise<VisitExtras> {
  const headRows = await queryRows<{ feedback_rating: number | null; nps_score: number | null; feedback_text: string | null; signed_by: string | null; signature_path: string | null }>(
    `SELECT feedback_rating, nps_score, feedback_text, signed_by, signature_path FROM visit WHERE id = $1 AND organisation_id = $2`,
    [visitId, organisationId]
  );
  const head = headRows[0];
  const expenses = await queryRows<{ id: string; category: string; amount_cents: number; kms: number | null; calculated_kms: number | null; note: string | null }>(
    `SELECT id, category, amount_cents, kms, calculated_kms, note FROM visit_expense WHERE visit_id = $1 AND organisation_id = $2 ORDER BY created_at`,
    [visitId, organisationId]
  );
  const intel = await queryRows<{ id: string; competitor_name: string; product_name: string | null; price_cents: number | null; promo: string | null; note: string | null }>(
    `SELECT id, competitor_name, product_name, price_cents, promo, note FROM visit_competitor_intel WHERE visit_id = $1 AND organisation_id = $2 ORDER BY created_at`,
    [visitId, organisationId]
  );
  const samples = await queryRows<{ id: string; item_name: string; quantity: number; recipient_name: string | null; note: string | null }>(
    `SELECT id, item_name, quantity, recipient_name, note FROM visit_sample WHERE visit_id = $1 AND organisation_id = $2 ORDER BY created_at`,
    [visitId, organisationId]
  );
  return {
    feedbackRating: head?.feedback_rating ?? null,
    npsScore: head?.nps_score ?? null,
    feedbackText: head?.feedback_text ?? null,
    signedBy: head?.signed_by ?? null,
    signaturePath: head?.signature_path ?? null,
    expenses: expenses.map((e) => ({ id: e.id, category: e.category, amountCents: e.amount_cents, kms: e.kms, calculatedKms: e.calculated_kms, note: e.note })),
    totalExpenseCents: expenses.reduce((sum, e) => sum + e.amount_cents, 0),
    competitorIntel: intel.map((c) => ({ id: c.id, competitorName: c.competitor_name, productName: c.product_name, priceCents: c.price_cents, promo: c.promo, note: c.note })),
    samples: samples.map((s) => ({ id: s.id, itemName: s.item_name, quantity: s.quantity, recipientName: s.recipient_name, note: s.note }))
  };
}
