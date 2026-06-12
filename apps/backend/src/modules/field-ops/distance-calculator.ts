import { queryRows } from "../../db/client.js";
import { haversineMeters } from "../insights/geo.js";

export interface RouteAdherenceResult {
  onRoute: boolean;
  plannedOrder: number | null;
  totalPlannedStops: number;
  deviationKm: number | null;
  skippedStops: Array<{ stopOrder: number; outletId: string; outletName: string }>;
}

export interface PingSample {
  latitude: number;
  longitude: number;
  recordedAt: string;
}

export interface DistanceResult {
  distanceKm: number;
  distanceMeters: number;
  pingCount: number;
}

export interface VisitWindow {
  userId: string;
  checkedInAt: string;
  checkedOutAt: string | null;
}

/**
 * Summed haversine distance between consecutive pings.
 */
export function sumPingDistance(pings: PingSample[]): number {
  if (pings.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 1; i < pings.length; i++) {
    const a = pings[i - 1];
    const b = pings[i];
    totalMeters += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return totalMeters;
}

/**
 * Load the visit's check-in/out window and sum ping distances.
 */
export async function calculateVisitDistance(organisationId: string, visitId: string): Promise<DistanceResult> {
  const visits = await queryRows<{ assigned_user_id: string; checked_in_at: string | null; checked_out_at: string | null }>(
    `SELECT assigned_user_id, checked_in_at, checked_out_at
     FROM visit
     WHERE organisation_id = $1 AND id = $2`,
    [organisationId, visitId]
  );
  const v = visits[0];
  if (!v?.checked_in_at) return { distanceKm: 0, distanceMeters: 0, pingCount: 0 };

  const windowEnd = v.checked_out_at ?? new Date().toISOString();
  const pings = await queryRows<PingSample>(
    `SELECT latitude, longitude, recorded_at
     FROM location_ping
     WHERE organisation_id = $1 AND user_id = $2
       AND recorded_at >= $3 AND recorded_at <= $4
     ORDER BY recorded_at ASC`,
    [organisationId, v.assigned_user_id, v.checked_in_at, windowEnd]
  );

  const distanceMeters = sumPingDistance(pings);
  return { distanceKm: Math.round(distanceMeters / 10) / 100, distanceMeters: Math.round(distanceMeters), pingCount: pings.length };
}

export async function checkRouteAdherence(organisationId: string, visitId: string): Promise<RouteAdherenceResult | null> {
  const visitRow = await queryRows<{ assigned_user_id: string; outlet_id: string; visit_date: string }>(
    `SELECT assigned_user_id, outlet_id, visit_date::text FROM visit WHERE organisation_id = $1 AND id = $2`,
    [organisationId, visitId]
  );
  const v = visitRow[0];
  if (!v) return null;

  const planRows = await queryRows<{
    plan_id: string; stop_order: number; outlet_id: string; outlet_name: string;
  }>(
    `SELECT rp.id AS plan_id, rs.stop_order, rs.outlet_id, o.name AS outlet_name
     FROM route_plan rp
     JOIN route_stop rs ON rs.route_plan_id = rp.id
     JOIN outlet o ON o.id = rs.outlet_id AND o.organisation_id = rp.organisation_id
     WHERE rp.organisation_id = $1 AND rp.assigned_user_id = $2 AND rp.route_date = $3::date
     ORDER BY rs.stop_order ASC`,
    [organisationId, v.assigned_user_id, v.visit_date]
  );
  if (planRows.length === 0) return null;

  const plannedStop = planRows.find((s) => s.outlet_id === v.outlet_id);
  if (!plannedStop) {
    return {
      onRoute: false,
      plannedOrder: null,
      totalPlannedStops: planRows.length,
      deviationKm: null,
      skippedStops: []
    };
  }

  const visitsToday = await queryRows<{ outlet_id: string; checked_in_at: string }>(
    `SELECT outlet_id, checked_in_at
     FROM visit
     WHERE organisation_id = $1 AND assigned_user_id = $2 AND visit_date = $3::date
       AND checked_in_at IS NOT NULL
     ORDER BY checked_in_at ASC`,
    [organisationId, v.assigned_user_id, v.visit_date]
  );

  const actualIndex = visitsToday.findIndex((vt) => vt.outlet_id === v.outlet_id);
  const visitedOutletIds = new Set(visitsToday.map((vt) => vt.outlet_id));

  const skippedStops = planRows
    .filter((s) => s.stop_order < plannedStop.stop_order && !visitedOutletIds.has(s.outlet_id))
    .map((s) => ({ stopOrder: s.stop_order, outletId: s.outlet_id, outletName: s.outlet_name }));

  const onRoute = actualIndex >= 0 && skippedStops.length === 0;

  let deviationKm: number | null = null;
  if (!onRoute && actualIndex >= 0) {
    const expectedOrder = plannedStop.stop_order;
    const actualOrder = actualIndex + 1;
    const diff = Math.abs(actualOrder - expectedOrder);
    const avgStopKm = 1.5;
    deviationKm = Math.round(diff * avgStopKm * 100) / 100;
  }

  return {
    onRoute,
    plannedOrder: plannedStop.stop_order,
    totalPlannedStops: planRows.length,
    deviationKm,
    skippedStops
  };
}
