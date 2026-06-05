import { queryRows } from "../../db/client.js";

export interface TenantSummary {
  organisationId: string;
  outletCount: number;
  leadCount: number;
  visitCount: number;
  routePlanCount: number;
  orderCount: number;
  totalOrderCents: number;
  activeSessionCount: number;
  visitsPlannedToday: number;
  visitsCompletedToday: number;
  offTarget7d: number;
}

export interface RepActivity {
  repUserId: string;
  visitsTotal: number;
  visitsCompleted: number;
  geofenceExceptions: number;
  ordersTotal: number;
  orderTotalCents: number;
}

export interface ExpenseReportItem {
  expenseId: string;
  visitId: string;
  visitDate: string;
  outletId: string;
  outletName: string;
  repUserId: string;
  repName: string;
  category: string;
  amountCents: number;
  kms: number | null;
  note: string | null;
  createdAt: string;
  erpSyncStatus: "synced" | "pending";
  erpId: string | null;
}

export interface ExpenseRepTotal {
  repUserId: string;
  repName: string;
  totalExpenseCents: number;
  expenseCount: number;
  erpSyncedCount: number;
}

export interface ExpenseReport {
  organisationId: string;
  from: string;
  to: string;
  totalExpenseCents: number;
  expenseCount: number;
  repTotals: ExpenseRepTotal[];
  items: ExpenseReportItem[];
}

export async function loadTenantSummary(organisationId: string): Promise<TenantSummary> {
  const rows = await queryRows<TenantSummary & Record<string, unknown>>(
    `SELECT
       $1::text AS "organisationId",
       (SELECT count(*) FROM outlet WHERE organisation_id = $1)::int AS "outletCount",
       (SELECT count(*) FROM lead WHERE organisation_id = $1)::int AS "leadCount",
       (SELECT count(*) FROM visit WHERE organisation_id = $1)::int AS "visitCount",
       (SELECT count(*) FROM route_plan WHERE organisation_id = $1)::int AS "routePlanCount",
       (SELECT count(*) FROM field_order WHERE organisation_id = $1)::int AS "orderCount",
       (SELECT COALESCE(SUM(total_cents), 0) FROM field_order WHERE organisation_id = $1)::int AS "totalOrderCents",
       (SELECT count(*) FROM work_session WHERE organisation_id = $1 AND status = 'active')::int AS "activeSessionCount",
       (SELECT count(*) FROM visit WHERE organisation_id = $1 AND visit_date = current_date)::int AS "visitsPlannedToday",
       (SELECT count(*) FROM visit WHERE organisation_id = $1 AND visit_date = current_date AND status = 'completed')::int AS "visitsCompletedToday",
       (SELECT count(*) FROM visit WHERE organisation_id = $1 AND geofence_status = 'exception' AND visit_date >= current_date - 7)::int AS "offTarget7d"`,
    [organisationId]
  );
  return rows[0];
}

export interface RepSelfAnalytics {
  userId: string;
  today: { visits: number; completed: number; offTarget: number };
  last7: { visits: number; completed: number; completionRate: number; activeDays: number };
  last30: { visits: number; completed: number; offTarget: number; ordersCount: number; orderValueCents: number; collectedCents: number };
  leads: { open: number; won: number };
  rank: { position: number; totalReps: number } | null;
  visitsPerDay: Array<{ date: string; visits: number; completed: number }>;
  /** Rich visit-detail roll-up for this rep over the last 30 days. */
  quality: { avgRating: number; ratedVisits: number; expensesCents: number; samples: number; competitorNotes: number };
}

/**
 * Self-service analytics for a single rep (their own KPIs only). Powers the
 * mobile "My performance" screen. Scoped to (organisation, user) — a rep can
 * only ever see their own numbers.
 */
export async function loadRepSelfAnalytics(organisationId: string, userId: string): Promise<RepSelfAnalytics> {
  const params = [organisationId, userId];
  const scalarRows = await queryRows<Record<string, number>>(
    `SELECT
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date=current_date)::int AS today_visits,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date=current_date AND status='completed')::int AS today_completed,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date=current_date AND geofence_status='exception')::int AS today_offtarget,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '6 days')::int AS w_visits,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '6 days' AND status='completed')::int AS w_completed,
       (SELECT count(DISTINCT visit_date) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '6 days' AND checked_in_at IS NOT NULL)::int AS w_active_days,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '29 days')::int AS m_visits,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '29 days' AND status='completed')::int AS m_completed,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '29 days' AND geofence_status='exception')::int AS m_offtarget,
       (SELECT count(*) FROM field_order WHERE organisation_id=$1 AND rep_user_id=$2 AND created_at >= now() - interval '30 days')::int AS m_orders,
       (SELECT COALESCE(SUM(total_cents),0) FROM field_order WHERE organisation_id=$1 AND rep_user_id=$2 AND created_at >= now() - interval '30 days')::int AS m_order_cents,
       (SELECT COALESCE(SUM(amount_cents),0) FROM payment WHERE organisation_id=$1 AND collected_by=$2 AND created_at >= now() - interval '30 days')::int AS m_collected_cents,
       (SELECT count(*) FROM lead WHERE organisation_id=$1 AND assigned_user_id=$2 AND status NOT IN ('won','lost'))::int AS open_leads,
       (SELECT count(*) FROM lead WHERE organisation_id=$1 AND assigned_user_id=$2 AND status='won')::int AS won_leads,
       (SELECT COALESCE(AVG(feedback_rating),0)::float8 FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND feedback_rating IS NOT NULL AND visit_date >= current_date - interval '29 days') AS m_avg_rating,
       (SELECT count(*) FROM visit WHERE organisation_id=$1 AND assigned_user_id=$2 AND feedback_rating IS NOT NULL AND visit_date >= current_date - interval '29 days')::int AS m_rated,
       (SELECT COALESCE(SUM(e.amount_cents),0) FROM visit_expense e JOIN visit v ON v.id=e.visit_id WHERE e.organisation_id=$1 AND v.assigned_user_id=$2 AND v.visit_date >= current_date - interval '29 days')::int AS m_expense_cents,
       (SELECT COALESCE(SUM(s.quantity),0) FROM visit_sample s JOIN visit v ON v.id=s.visit_id WHERE s.organisation_id=$1 AND v.assigned_user_id=$2 AND v.visit_date >= current_date - interval '29 days')::int AS m_samples,
       (SELECT count(*) FROM visit_competitor_intel ci JOIN visit v ON v.id=ci.visit_id WHERE ci.organisation_id=$1 AND v.assigned_user_id=$2 AND v.visit_date >= current_date - interval '29 days')::int AS m_competitor`,
    params
  );
  const s = scalarRows[0] ?? {};

  const rankRows = await queryRows<{ position: number; total: number }>(
    `WITH per AS (
       SELECT assigned_user_id AS uid,
              count(*) FILTER (WHERE status='completed' AND visit_date >= current_date - interval '29 days')::int AS c
       FROM visit WHERE organisation_id=$1 AND assigned_user_id IS NOT NULL
       GROUP BY assigned_user_id
     ), ranked AS (
       SELECT uid, RANK() OVER (ORDER BY c DESC)::int AS position, count(*) OVER ()::int AS total FROM per
     )
     SELECT position, total FROM ranked WHERE uid=$2`,
    params
  );

  const series = await queryRows<{ d: string; visits: number; completed: number }>(
    `SELECT visit_date::text AS d,
            count(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS visits,
            count(*) FILTER (WHERE status='completed')::int AS completed
     FROM visit
     WHERE organisation_id=$1 AND assigned_user_id=$2 AND visit_date >= current_date - interval '13 days'
     GROUP BY visit_date ORDER BY visit_date`,
    params
  );

  return {
    userId,
    today: { visits: s.today_visits ?? 0, completed: s.today_completed ?? 0, offTarget: s.today_offtarget ?? 0 },
    last7: {
      visits: s.w_visits ?? 0,
      completed: s.w_completed ?? 0,
      completionRate: s.w_visits ? Math.round((s.w_completed / s.w_visits) * 100) : 0,
      activeDays: s.w_active_days ?? 0
    },
    last30: {
      visits: s.m_visits ?? 0,
      completed: s.m_completed ?? 0,
      offTarget: s.m_offtarget ?? 0,
      ordersCount: s.m_orders ?? 0,
      orderValueCents: s.m_order_cents ?? 0,
      collectedCents: s.m_collected_cents ?? 0
    },
    leads: { open: s.open_leads ?? 0, won: s.won_leads ?? 0 },
    rank: rankRows[0] ? { position: rankRows[0].position, totalReps: rankRows[0].total } : null,
    visitsPerDay: series.map((r) => ({ date: r.d, visits: r.visits, completed: r.completed })),
    quality: {
      avgRating: Math.round((s.m_avg_rating ?? 0) * 10) / 10,
      ratedVisits: s.m_rated ?? 0,
      expensesCents: s.m_expense_cents ?? 0,
      samples: s.m_samples ?? 0,
      competitorNotes: s.m_competitor ?? 0
    }
  };
}

export async function loadRepActivity(organisationId: string): Promise<RepActivity[]> {
  return queryRows<RepActivity>(
    `SELECT u.id AS "repUserId",
            COALESCE(v.total, 0)::int AS "visitsTotal",
            COALESCE(v.completed, 0)::int AS "visitsCompleted",
            COALESCE(v.exceptions, 0)::int AS "geofenceExceptions",
            COALESCE(o.total, 0)::int AS "ordersTotal",
            COALESCE(o.cents, 0)::int AS "orderTotalCents"
     FROM app_user u
     LEFT JOIN (
       SELECT assigned_user_id,
              count(*) AS total,
              count(*) FILTER (WHERE status = 'completed') AS completed,
              count(*) FILTER (WHERE geofence_status = 'exception') AS exceptions
       FROM visit
       WHERE organisation_id = $1
       GROUP BY assigned_user_id
     ) v ON v.assigned_user_id = u.id
     LEFT JOIN (
       SELECT rep_user_id, count(*) AS total, SUM(total_cents) AS cents
       FROM field_order
       WHERE organisation_id = $1
       GROUP BY rep_user_id
     ) o ON o.rep_user_id = u.id
     WHERE u.organisation_id = $1
       AND u.role = 'field_sales_representative'
     ORDER BY "visitsTotal" DESC NULLS LAST, u.id ASC`,
    [organisationId]
  );
}

export async function loadExpenseReport(
  organisationId: string,
  range: { from: string; to: string }
): Promise<ExpenseReport> {
  const rows = await queryRows<{
    expense_id: string;
    visit_id: string;
    visit_date: string;
    outlet_id: string;
    outlet_name: string;
    rep_user_id: string;
    rep_name: string;
    category: string;
    amount_cents: number;
    kms: number | null;
    note: string | null;
    created_at: string;
    erp_id: string | null;
  }>(
    `SELECT e.id AS expense_id,
            e.visit_id,
            v.visit_date::text AS visit_date,
            v.outlet_id,
            o.name AS outlet_name,
            v.assigned_user_id AS rep_user_id,
            u.name AS rep_name,
            e.category,
            e.amount_cents,
            e.kms,
            e.note,
            e.created_at,
            m.erp_id
     FROM visit_expense e
     JOIN visit v ON v.id = e.visit_id AND v.organisation_id = e.organisation_id
     JOIN outlet o ON o.id = v.outlet_id AND o.organisation_id = e.organisation_id
     JOIN app_user u ON u.id = v.assigned_user_id AND u.organisation_id = e.organisation_id
     LEFT JOIN erp_entity_mapping m
       ON m.organisation_id = e.organisation_id
      AND m.entity_type = 'expense_claim'
      AND m.local_id = e.id
     WHERE e.organisation_id = $1
       AND v.visit_date >= $2::date
       AND v.visit_date <= $3::date
     ORDER BY v.visit_date DESC, e.created_at DESC`,
    [organisationId, range.from, range.to]
  );

  const items = rows.map((r): ExpenseReportItem => ({
    expenseId: r.expense_id,
    visitId: r.visit_id,
    visitDate: r.visit_date,
    outletId: r.outlet_id,
    outletName: r.outlet_name,
    repUserId: r.rep_user_id,
    repName: r.rep_name,
    category: r.category,
    amountCents: r.amount_cents,
    kms: r.kms,
    note: r.note,
    createdAt: r.created_at,
    erpId: r.erp_id,
    erpSyncStatus: r.erp_id ? "synced" : "pending"
  }));
  const totals = new Map<string, ExpenseRepTotal>();
  for (const item of items) {
    const cur = totals.get(item.repUserId) ?? {
      repUserId: item.repUserId,
      repName: item.repName,
      totalExpenseCents: 0,
      expenseCount: 0,
      erpSyncedCount: 0
    };
    cur.totalExpenseCents += item.amountCents;
    cur.expenseCount += 1;
    if (item.erpSyncStatus === "synced") cur.erpSyncedCount += 1;
    totals.set(item.repUserId, cur);
  }

  return {
    organisationId,
    from: range.from,
    to: range.to,
    totalExpenseCents: items.reduce((sum, item) => sum + item.amountCents, 0),
    expenseCount: items.length,
    repTotals: [...totals.values()].sort((a, b) => b.totalExpenseCents - a.totalExpenseCents),
    items
  };
}
