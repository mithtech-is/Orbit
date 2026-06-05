import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { queryRows } from "../../../../db/client.js";
import { createRoutePlanningRepository } from "../../../../modules/route-planning/repository.js";

interface AssignedVisitRow {
  id: string;
  outlet_id: string;
  outlet_name: string;
  outlet_latitude: number;
  outlet_longitude: number;
  status: string;
  visit_date: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  geofence_status: string | null;
  outcome: string | null;
}

interface AssignedLeadRow {
  id: string;
  name: string;
  status: string;
  priority: number;
  outlet_id: string;
  outlet_name: string;
}

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  const today = new Date().toISOString().slice(0, 10);

  const planRows = await queryRows<{ id: string; route_date: string; status: string }>(
    `SELECT id, route_date::text AS route_date, status
     FROM route_plan
     WHERE organisation_id = $1
       AND assigned_user_id = $2
       AND route_date = $3::date
     ORDER BY created_at DESC`,
    [actor.organisationId, actor.userId, today]
  );

  const repo = createRoutePlanningRepository();
  const plans = await Promise.all(planRows.map((p) => repo.queryPlanWithStops(actor.organisationId, p.id)));
  const plansSafe = plans.filter((p): p is NonNullable<typeof p> => Boolean(p));

  const visits = await queryRows<AssignedVisitRow>(
    `SELECT v.id, v.outlet_id, v.status, v.visit_date::text AS visit_date,
            v.checked_in_at::text AS checked_in_at,
            v.checked_out_at::text AS checked_out_at,
            v.geofence_status, v.outcome,
            o.name AS outlet_name,
            ST_Y(o.location::geometry) AS outlet_latitude,
            ST_X(o.location::geometry) AS outlet_longitude
     FROM visit v
     JOIN outlet o ON o.id = v.outlet_id AND o.organisation_id = v.organisation_id
     WHERE v.organisation_id = $1
       AND v.assigned_user_id = $2
       AND v.visit_date = $3::date
     ORDER BY v.checked_in_at NULLS FIRST, v.id`,
    [actor.organisationId, actor.userId, today]
  );

  const leads = await queryRows<AssignedLeadRow>(
    `SELECT l.id, l.name, l.status, l.priority, l.outlet_id, o.name AS outlet_name
     FROM lead l
     JOIN outlet o ON o.id = l.outlet_id AND o.organisation_id = l.organisation_id
     WHERE l.organisation_id = $1
       AND l.assigned_user_id = $2
       AND l.status NOT IN ('won', 'lost')
     ORDER BY l.priority ASC, l.name ASC
     LIMIT 25`,
    [actor.organisationId, actor.userId]
  );

  const visitsCompleted = visits.filter((v) => v.status === "completed").length;
  const totalStops = plansSafe.reduce((sum, p) => sum + p.stops.length, 0);
  const totalPlannedMeters = plansSafe.reduce((sum, p) => sum + p.plannedDistanceMeters, 0);
  const totalPlannedMinutes = plansSafe.reduce((sum, p) => sum + p.plannedDurationMinutes, 0);

  res.status(200).json({
    organisationId: actor.organisationId,
    userId: actor.userId,
    date: today,
    summary: {
      visitsAssigned: visits.length,
      visitsCompleted,
      visitsRemaining: visits.length - visitsCompleted,
      stopsPlanned: totalStops,
      plannedDistanceMeters: totalPlannedMeters,
      plannedDurationMinutes: totalPlannedMinutes,
      openLeads: leads.length
    },
    routePlans: plansSafe,
    visits: visits.map((v) => ({
      id: v.id,
      outletId: v.outlet_id,
      outletName: v.outlet_name,
      outletLatitude: v.outlet_latitude !== null ? Number(v.outlet_latitude) : null,
      outletLongitude: v.outlet_longitude !== null ? Number(v.outlet_longitude) : null,
      status: v.status,
      visitDate: v.visit_date,
      checkedInAt: v.checked_in_at,
      checkedOutAt: v.checked_out_at,
      geofenceStatus: v.geofence_status,
      outcome: v.outcome
    })),
    leads: leads.map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      priority: l.priority,
      outletId: l.outlet_id,
      outletName: l.outlet_name
    }))
  });
}
