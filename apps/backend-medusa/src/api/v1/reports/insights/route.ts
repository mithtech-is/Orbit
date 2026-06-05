import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import {
  queryCoverage, queryRouteAdherence, queryRecentPings,
  queryOffTargetLeaderboard, queryConversionFunnel, queryTimeOnField, queryVisitsPerDay, queryVisitsByOutcome,
  queryVisitQuality, queryTopCompetitors, queryExpensesByCategory
} from "../../../../modules/insights/repository.js";
import { detectImpossibleTravel, adherencePercent, haversineMeters } from "../../../../modules/insights/geo.js";
import { outletOrderHistory, pingsForDate } from "../../../../modules/field-ops/repository.js";
import { reorderDueScore, mileageExpenseCents } from "../../../../modules/field-ops/calc.js";

function queryParam(req: MedusaRouteRequest, key: string): string | null {
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  return url.searchParams.get(key);
}

/** GET /api/v1/reports/coverage — outlets + visit density for the heatmap. */
export async function GET_COVERAGE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const rows = await queryCoverage(actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "coverage",
    items: rows.map((r) => ({
      outletId: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      visitCount: r.visit_count,
      lastVisit: r.last_visit
    }))
  });
}

/** GET /api/v1/reports/route-adherence?date=YYYY-MM-DD — planned vs actual per rep. */
export async function GET_ADHERENCE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const date = queryParam(req, "date") || new Date().toISOString().slice(0, 10);
  const rows = await queryRouteAdherence(actor.organisationId, date);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "route_adherence",
    date,
    items: rows.map((r) => ({
      userId: r.user_id,
      plannedOutlets: r.planned_outlets,
      visitedOutlets: r.visited_outlets,
      adherencePercent: adherencePercent(r.planned_outlets, r.visited_outlets)
    }))
  });
}

function rangeDays(req: MedusaRouteRequest, def = 30): number {
  const n = Number(queryParam(req, "days"));
  return Number.isFinite(n) && n > 0 && n <= 365 ? Math.floor(n) : def;
}

/** GET /api/v1/reports/off-target-leaderboard?days=30 — reps ranked by off-target %. */
export async function GET_OFFTARGET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const days = rangeDays(req);
  const rows = await queryOffTargetLeaderboard(actor.organisationId, days);
  res.status(200).json({
    organisationId: actor.organisationId, dataSource: "off_target_leaderboard", days,
    items: rows.map((r) => ({
      userId: r.user_id, totalVisits: r.total, offTarget: r.off_target,
      offTargetPercent: r.total > 0 ? Math.round((r.off_target / r.total) * 100) : 0
    }))
  });
}

/** GET /api/v1/reports/funnel — Lead → Qualified → Won → Order conversion. */
export async function GET_FUNNEL(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const f = await queryConversionFunnel(actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId, dataSource: "funnel",
    stages: [
      { key: "leads", label: "Leads", count: f.leads_total },
      { key: "qualified", label: "Qualified", count: f.leads_qualified },
      { key: "won", label: "Won", count: f.leads_won },
      { key: "orders", label: "Orders", count: f.orders }
    ]
  });
}

/** GET /api/v1/reports/time-on-field?date=YYYY-MM-DD — per-rep in-visit minutes. */
export async function GET_TIME_ON_FIELD(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const date = queryParam(req, "date") || new Date().toISOString().slice(0, 10);
  const rows = await queryTimeOnField(actor.organisationId, date);
  res.status(200).json({
    organisationId: actor.organisationId, dataSource: "time_on_field", date,
    items: rows.map((r) => ({ userId: r.user_id, visits: r.visits, minutes: Math.round(r.seconds / 60) }))
  });
}

/** GET /api/v1/reports/trends?days=14 — visits/day + visits-by-outcome for charts. */
export async function GET_TRENDS(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const days = rangeDays(req, 14);
  const [perDay, byOutcome] = await Promise.all([
    queryVisitsPerDay(actor.organisationId, days),
    queryVisitsByOutcome(actor.organisationId, Math.max(days, 30))
  ]);
  res.status(200).json({
    organisationId: actor.organisationId, dataSource: "trends", days,
    visitsPerDay: perDay.map((r) => ({ date: r.d, visits: r.visits, completed: r.completed })),
    visitsByOutcome: byOutcome.map((r) => ({ outcome: r.outcome, count: r.n }))
  });
}

/** GET /api/v1/reports/visit-quality?days=30 — rolled-up visit feedback, expenses, samples & competitor intel. */
export async function GET_VISIT_QUALITY(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const days = rangeDays(req, 30);
  const [summary, competitors, expenses] = await Promise.all([
    queryVisitQuality(actor.organisationId, days),
    queryTopCompetitors(actor.organisationId, days),
    queryExpensesByCategory(actor.organisationId, days)
  ]);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "visit_quality",
    days,
    avgRating: Math.round(summary.avg_rating * 10) / 10,
    ratedVisits: summary.rated_visits,
    avgNps: Math.round(summary.avg_nps * 10) / 10,
    npsResponses: summary.nps_responses,
    expenseCents: summary.expense_cents,
    samples: summary.samples,
    competitorNotes: summary.competitor_notes,
    topCompetitors: competitors.map((c) => ({ name: c.competitor_name, mentions: c.mentions })),
    expensesByCategory: expenses.map((e) => ({ category: e.category, totalCents: e.total_cents }))
  });
}

/** GET /api/v1/reports/fraud-signals?hours=24 — impossible-travel anomalies in location pings. */
export async function GET_FRAUD(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const hoursRaw = Number(queryParam(req, "hours"));
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 && hoursRaw <= 168 ? hoursRaw : 24;

  const pings = await queryRecentPings(actor.organisationId, hours);
  const signals: Array<Record<string, unknown>> = [];
  for (let i = 1; i < pings.length; i++) {
    const prev = pings[i - 1];
    const cur = pings[i];
    if (prev.user_id !== cur.user_id) continue; // only compare consecutive pings of the same rep
    const anomaly = detectImpossibleTravel(
      { latitude: prev.latitude, longitude: prev.longitude, recordedAtMs: new Date(prev.recorded_at).getTime() },
      { latitude: cur.latitude, longitude: cur.longitude, recordedAtMs: new Date(cur.recorded_at).getTime() }
    );
    if (anomaly) {
      signals.push({
        userId: cur.user_id,
        from: { latitude: prev.latitude, longitude: prev.longitude, at: prev.recorded_at },
        to: { latitude: cur.latitude, longitude: cur.longitude, at: cur.recorded_at },
        distanceMeters: anomaly.distanceMeters,
        seconds: anomaly.seconds,
        speedKmh: anomaly.speedKmh
      });
    }
  }

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "fraud_signals",
    windowHours: hours,
    signalCount: signals.length,
    items: signals
  });
}

/** GET /api/v1/reports/reorder — outlets ranked by how overdue they are for a reorder. */
export async function GET_REORDER(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const now = Date.now();
  const rows = await outletOrderHistory(actor.organisationId);
  const items = rows
    .map((r) => {
      const times = Array.isArray(r.order_times) ? r.order_times.filter(Boolean).map((t) => new Date(t).getTime()) : [];
      const score = reorderDueScore(times, now);
      const last = times.length ? new Date(Math.max(...times)).toISOString() : null;
      return { outletId: r.outlet_id, name: r.name, orderCount: times.length, lastOrderAt: last, dueScore: Math.round(score * 100) / 100 };
    })
    .filter((o) => o.dueScore > 0)
    .sort((a, b) => b.dueScore - a.dueScore);
  res.status(200).json({ organisationId: actor.organisationId, dataSource: "reorder", items });
}

/** GET /api/v1/reports/mileage?date=YYYY-MM-DD&ratePerKmCents=50 — per-rep distance + expense. */
export async function GET_MILEAGE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const date = queryParam(req, "date") || new Date().toISOString().slice(0, 10);
  const rateRaw = Number(queryParam(req, "ratePerKmCents"));
  const ratePerKmCents = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : 0;

  const pings = await pingsForDate(actor.organisationId, date);
  const byUser = new Map<string, number>(); // userId -> metres
  for (let i = 1; i < pings.length; i++) {
    const prev = pings[i - 1];
    const cur = pings[i];
    if (prev.user_id !== cur.user_id) continue;
    const d = haversineMeters(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
    byUser.set(cur.user_id, (byUser.get(cur.user_id) ?? 0) + d);
  }
  const items = [...byUser.entries()].map(([userId, metres]) => ({
    userId,
    distanceKm: Math.round(metres / 100) / 10,
    expenseCents: mileageExpenseCents(metres, ratePerKmCents)
  }));
  res.status(200).json({ organisationId: actor.organisationId, dataSource: "mileage", date, ratePerKmCents, items });
}
