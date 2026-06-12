import { getDatabasePool, queryRows } from "../../db/client.js";

export interface RoutePlanRow {
  id: string;
  organisation_id: string;
  assigned_user_id: string;
  route_date: string;
  status: string;
  planned_distance_meters: number;
  planned_duration_minutes: number;
  provider: string;
  provider_reference: string;
}

export interface RouteStopRow {
  id: string;
  organisation_id: string;
  route_plan_id: string;
  outlet_id: string;
  stop_order: number;
  status: string;
  expected_duration_minutes: number;
  visit_type: string | null;
  objective: string | null;
  outlet_name: string;
  outlet_latitude: number;
  outlet_longitude: number;
}

export interface CreateRoutePlanInput {
  id: string;
  organisationId: string;
  assignedUserId: string;
  routeDate: string;
  stopIds: Array<{ outletId: string; expectedDurationMinutes: number; priority: number; visitType?: string; objective?: string }>;
  repLatitude: number;
  repLongitude: number;
  /** false → save as draft; otherwise the plan is released (visible to the rep). */
  release?: boolean;
}

export interface RoutePlanDetail {
  id: string;
  organisationId: string;
  assignedUserId: string;
  routeDate: string;
  status: string;
  plannedDistanceMeters: number;
  plannedDurationMinutes: number;
  provider: string;
  stops: Array<{
    id: string;
    outletId: string;
    outletName: string;
    outletLatitude: number;
    outletLongitude: number;
    stopOrder: number;
    status: string;
    expectedDurationMinutes: number;
    visitType: string | null;
    objective: string | null;
  }>;
}

export interface RoutePlanningRepository {
  queryRoutePlans(organisationId: string): Promise<RoutePlanRow[]>;
  queryPlanWithStops(organisationId: string, planId: string): Promise<RoutePlanDetail | undefined>;
}

export function createRoutePlanningRepository(): RoutePlanningRepository {
  return {
    queryRoutePlans(organisationId) {
      return queryRows<RoutePlanRow>(
        `SELECT id, organisation_id, assigned_user_id, route_date,
                status, planned_distance_meters, planned_duration_minutes,
                provider, provider_reference
         FROM route_plan
         WHERE organisation_id = $1
         ORDER BY route_date DESC, created_at DESC`,
        [organisationId]
      );
    },

    async queryPlanWithStops(organisationId, planId) {
      const plans = await queryRows<RoutePlanRow>(
        `SELECT id, organisation_id, assigned_user_id, route_date,
                status, planned_distance_meters, planned_duration_minutes,
                provider, provider_reference
         FROM route_plan
         WHERE organisation_id = $1 AND id = $2`,
        [organisationId, planId]
      );
      if (plans.length === 0) return undefined;

      const plan = plans[0];
      const stops = await queryStopsWithLocation(organisationId, planId);

      return {
        id: plan.id,
        organisationId: plan.organisation_id,
        assignedUserId: plan.assigned_user_id,
        routeDate: plan.route_date,
        status: plan.status,
        plannedDistanceMeters: plan.planned_distance_meters,
        plannedDurationMinutes: plan.planned_duration_minutes,
        provider: plan.provider,
        stops: stops.map((s) => ({
          id: s.id,
          outletId: s.outlet_id,
          outletName: s.outlet_name,
          outletLatitude: s.outlet_latitude,
          outletLongitude: s.outlet_longitude,
          stopOrder: s.stop_order,
          status: s.status,
          expectedDurationMinutes: s.expected_duration_minutes,
          visitType: s.visit_type,
          objective: s.objective
        }))
      };
    }
  };
}

async function queryStopsWithLocation(organisationId: string, planId: string): Promise<RouteStopRow[]> {
  return queryRows<RouteStopRow>(
    `SELECT rs.id, rs.organisation_id, rs.route_plan_id, rs.outlet_id,
            rs.stop_order, rs.status, rs.expected_duration_minutes,
            rs.visit_type, rs.objective,
            o.name AS outlet_name,
            ST_Y(o.location::geometry) AS outlet_latitude,
            ST_X(o.location::geometry) AS outlet_longitude
     FROM route_stop rs
     JOIN outlet o ON o.id = rs.outlet_id AND o.organisation_id = rs.organisation_id
     WHERE rs.organisation_id = $1 AND rs.route_plan_id = $2
     ORDER BY rs.stop_order ASC`,
    [organisationId, planId]
  );
}

/**
 * Dynamically load the configured maps provider via dynamic import so CJS
 * runtimes can consume the ESM `@orbit/maps-provider` package.
 *
 * Selection rules:
 *   - `MAP_PROVIDER=mapbox` requires `MAPBOX_TOKEN`
 *   - `MAP_PROVIDER=google` requires `GOOGLE_MAPS_API_KEY`
 *   - `MAP_PROVIDER=osrm` requires `OSRM_USER_AGENT` (Nominatim policy)
 *   - any other value, or a missing credential, falls back to the deterministic mock
 */
export async function loadMapsProvider() {
  const choice = (process.env.MAP_PROVIDER ?? "mock").toLowerCase();
  const mod = await import("@orbit/maps-provider");

  if (choice === "mapbox" && process.env.MAPBOX_TOKEN) {
    return mod.createMapboxMapsProvider({ accessToken: process.env.MAPBOX_TOKEN });
  }
  if (choice === "google" && process.env.GOOGLE_MAPS_API_KEY) {
    return mod.createGoogleMapsProvider({ apiKey: process.env.GOOGLE_MAPS_API_KEY });
  }
  if (choice === "osrm" && (process.env.OSRM_USER_AGENT || process.env.NOMINATIM_USER_AGENT)) {
    return mod.createOsrmMapsProvider({
      userAgent: process.env.OSRM_USER_AGENT ?? process.env.NOMINATIM_USER_AGENT ?? "Orbit/0.1",
      osrmBaseUrl: process.env.OSRM_BASE_URL,
      nominatimBaseUrl: process.env.NOMINATIM_BASE_URL
    });
  }
  // Defense-in-depth: boot-time env validation already blocks this in prod, but
  // never silently serve the deterministic MOCK provider (fabricated distances/
  // geocodes) outside development.
  if ((process.env.NODE_ENV ?? "development").toLowerCase() === "production") {
    throw new Error(
      `Refusing to use the mock maps provider in production (MAP_PROVIDER=${choice || "unset"}). ` +
        "Set MAP_PROVIDER to mapbox|google|osrm with the matching credential."
    );
  }
  return mod.createMockMapsProvider();
}

export interface PreviewedRoute {
  provider: string;
  providerReference: string;
  totalDistanceMeters: number;
  totalDurationMinutes: number;
  startsAt: string;
  endsAt: string;
  orderedStops: Array<{
    outletId: string;
    outletName: string;
    latitude: number;
    longitude: number;
    stopOrder: number;
    expectedDurationMinutes: number;
    priority: number;
    /** Drive minutes from the previous point to this stop (road time). */
    driveMinutes?: number;
    /** Minutes from route start until arriving at this stop (drive + earlier visits). */
    etaMinutes?: number;
  }>;
  /** Road-following path (start → stops in order). Absent for the mock provider. */
  routeGeometry?: Array<{ latitude: number; longitude: number }>;
  /** When the route is a round trip, the final drive back home. */
  returnHome?: { driveMinutes: number; distanceMeters: number };
}

export interface PreviewRoutePlanInput {
  organisationId: string;
  routeDate: string;
  repLatitude: number;
  repLongitude: number;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  stopIds: Array<{ outletId: string; expectedDurationMinutes: number; priority: number }>;
  /** When true, the route loops back to the start (home) after the last stop. */
  returnToStart?: boolean;
}

export async function previewRoutePlan(input: PreviewRoutePlanInput): Promise<PreviewedRoute> {
  if (input.stopIds.length === 0) {
    throw new Error("at least one stop is required");
  }

  const outletRows = await queryRows<{ id: string; name: string; latitude: number; longitude: number }>(
    `SELECT id, name,
            ST_Y(location::geometry) AS latitude,
            ST_X(location::geometry) AS longitude
     FROM outlet
     WHERE organisation_id = $1 AND id = ANY($2::text[])`,
    [input.organisationId, input.stopIds.map((s) => s.outletId)]
  );
  const outletMap = new Map(outletRows.map((o) => [o.id, o]));

  const stops = input.stopIds.map((s) => {
    const outlet = outletMap.get(s.outletId);
    if (!outlet) throw new Error(`Outlet ${s.outletId} not found in this organisation`);
    return {
      id: s.outletId,
      latitude: Number(outlet.latitude),
      longitude: Number(outlet.longitude),
      expectedDurationMinutes: s.expectedDurationMinutes,
      priority: s.priority
    };
  });

  const startsAt = `${input.routeDate}T${input.workingHoursStart ?? "09:00"}:00.000Z`;
  const endsAt = `${input.routeDate}T${input.workingHoursEnd ?? "18:00"}:00.000Z`;

  const optimiseInput = {
    start: { latitude: input.repLatitude, longitude: input.repLongitude },
    stops,
    workingWindow: { startsAt, endsAt },
    returnToStart: input.returnToStart === true
  };
  const provider = await loadMapsProvider();
  let optimised;
  try {
    optimised = await provider.optimiseRoute(optimiseInput);
  } catch (error) {
    // The routing service (e.g. OSRM) is unreachable. Degrade to a clearly
    // labelled straight-line estimate rather than failing the whole plan — the
    // client shows "straight-line estimate" when there's no road geometry.
    process.stderr.write(
      `[route] maps provider failed, falling back to estimate: ${error instanceof Error ? error.message : String(error)}\n`
    );
    const { createMockMapsProvider } = await import("@orbit/maps-provider");
    optimised = await createMockMapsProvider().optimiseRoute(optimiseInput);
  }

  return {
    provider: optimised.provider,
    providerReference: optimised.providerReference,
    totalDistanceMeters: optimised.totalDistanceMeters,
    totalDurationMinutes: optimised.totalDurationMinutes,
    startsAt,
    endsAt,
    orderedStops: optimised.orderedStops.map((stop, idx) => {
      const outlet = outletMap.get(stop.id);
      const driveMinutes = optimised.legs?.[idx]?.driveMinutes;
      // ETA to arrive at this stop = drive time of all legs up to here + visit
      // time spent at the earlier stops.
      let etaMinutes: number | undefined;
      if (optimised.legs && optimised.legs.length > idx) {
        const driveSoFar = optimised.legs.slice(0, idx + 1).reduce((sum, l) => sum + l.driveMinutes, 0);
        const visitSoFar = optimised.orderedStops.slice(0, idx).reduce((sum, s) => sum + s.expectedDurationMinutes, 0);
        etaMinutes = driveSoFar + visitSoFar;
      }
      return {
        outletId: stop.id,
        outletName: outlet?.name ?? stop.id,
        latitude: stop.latitude,
        longitude: stop.longitude,
        stopOrder: idx + 1,
        expectedDurationMinutes: stop.expectedDurationMinutes,
        priority: stop.priority,
        driveMinutes,
        etaMinutes
      };
    }),
    routeGeometry: optimised.routeGeometry,
    returnHome: optimised.returnHome
  };
}

export async function createRoutePlan(input: CreateRoutePlanInput): Promise<RoutePlanDetail> {
  const pool = getDatabasePool();

  const outletRows = await queryRows<{ id: string; latitude: number; longitude: number }>(
    `SELECT id, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM outlet
     WHERE organisation_id = $1 AND id = ANY($2::text[])`,
    [input.organisationId, input.stopIds.map((s) => s.outletId)]
  );

  const outletMap = new Map(outletRows.map((o) => [o.id, o]));

  const stops = input.stopIds.map((s) => {
    const outlet = outletMap.get(s.outletId);
    if (!outlet) throw new Error(`Outlet ${s.outletId} not found`);
    return {
      id: s.outletId,
      latitude: Number(outlet.latitude),
      longitude: Number(outlet.longitude),
      expectedDurationMinutes: s.expectedDurationMinutes,
      priority: s.priority
    };
  });

  const mapsProvider = await loadMapsProvider();
  const optimised = await mapsProvider.optimiseRoute({
    start: { latitude: input.repLatitude, longitude: input.repLongitude },
    stops,
    workingWindow: {
      startsAt: `${input.routeDate}T09:00:00.000Z`,
      endsAt: `${input.routeDate}T18:00:00.000Z`
    }
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Per-stop planning meta keyed by outlet so it survives provider reordering.
    const metaByOutlet = new Map(input.stopIds.map((s) => [s.outletId, { visitType: s.visitType ?? null, objective: s.objective ?? null, priority: s.priority }]));
    // Lifecycle: explicit draft when release===false, otherwise released.
    const planStatus = input.release === false ? "draft" : "released";
    await client.query(
      `INSERT INTO route_plan (id, organisation_id, assigned_user_id, route_date, status,
                               planned_distance_meters, planned_duration_minutes, provider, provider_reference)
       VALUES ($1, $2, $3, $4, $9, $5, $6, $7, $8)`,
      [
        input.id,
        input.organisationId,
        input.assignedUserId,
        input.routeDate,
        optimised.totalDistanceMeters,
        optimised.totalDurationMinutes,
        optimised.provider,
        optimised.providerReference,
        planStatus
      ]
    );

    for (let i = 0; i < optimised.orderedStops.length; i++) {
      const stop = optimised.orderedStops[i];
      const stopId = `${input.id}_stop_${i}`;
      const meta = metaByOutlet.get(stop.id);
      await client.query(
        `INSERT INTO route_stop (id, organisation_id, route_plan_id, outlet_id, stop_order, status, expected_duration_minutes, visit_type, objective, priority)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)`,
        [stopId, input.organisationId, input.id, stop.id, i + 1, stop.expectedDurationMinutes, meta?.visitType ?? null, meta?.objective ?? null, meta?.priority ?? 0]
      );
    }

    await client.query("COMMIT");

    return (await createRoutePlanningRepository().queryPlanWithStops(
      input.organisationId,
      input.id
    )) as RoutePlanDetail;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function assignRoutePlan(organisationId: string, planId: string, userId: string): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE route_plan SET assigned_user_id = $1 WHERE id = $2 AND organisation_id = $3`,
    [userId, planId, organisationId]
  );
}

export async function updateRouteStatus(organisationId: string, planId: string, status: string): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE route_plan SET status = $1 WHERE id = $2 AND organisation_id = $3`,
    [status, planId, organisationId]
  );
}

export type RoutePlanAction = "release" | "start" | "complete" | "cancel";

// Day Plan lifecycle: Draft → Released → In Progress → Completed | Cancelled.
const PLAN_TRANSITIONS: Record<RoutePlanAction, { from: string[]; to: string }> = {
  release: { from: ["draft", "planned"], to: "released" },
  start: { from: ["released", "planned"], to: "in_progress" },
  complete: { from: ["in_progress", "released"], to: "completed" },
  cancel: { from: ["draft", "planned", "released", "in_progress"], to: "cancelled" }
};

export interface TransitionResult { ok: boolean; status?: string; assignedUserId?: string; routeDate?: string; error?: string }

/** Apply a lifecycle action to a route plan, enforcing valid transitions. */
export async function transitionRoutePlan(organisationId: string, planId: string, action: RoutePlanAction): Promise<TransitionResult> {
  const rows = await queryRows<{ status: string; assigned_user_id: string; route_date: string }>(
    `SELECT status, assigned_user_id, route_date::text AS route_date FROM route_plan WHERE organisation_id = $1 AND id = $2`,
    [organisationId, planId]
  );
  if (rows.length === 0) return { ok: false, error: "not_found" };
  const current = rows[0].status;
  const rule = PLAN_TRANSITIONS[action];
  if (!rule.from.includes(current)) {
    return { ok: false, error: `cannot ${action} a plan in status '${current}'` };
  }
  await updateRouteStatus(organisationId, planId, rule.to);
  return { ok: true, status: rule.to, assignedUserId: rows[0].assigned_user_id, routeDate: rows[0].route_date };
}
