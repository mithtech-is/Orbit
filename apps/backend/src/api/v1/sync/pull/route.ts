import type { AppRouteRequest, AppRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import { getCursor, setCursor, upsertDevice } from "../../../../modules/sync/repository.js";
import { queryRows } from "../../../../db/client.js";

const SUPPORTED_RESOURCES = new Set(["visits", "outlets", "leads", "route-plans"]);

/**
 * GET /api/v1/sync/pull?deviceId=...&resource=visits&since=2026-05-28T00:00:00Z
 *
 * Cursor-based delta pull. The cursor is the latest timestamp (or PK) observed
 * by the device; the server returns rows strictly after the cursor and writes
 * the new cursor back to `sync_cursor`. If `since` is omitted, the persisted
 * cursor (or "0") is used so a freshly-installed device gets the full state.
 */
export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  // pull is read-only; allow anyone with visit:write OR outlet:read access.
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:read");

  const url = typeof req.headers["x-request-url"] === "string" ? (req.headers["x-request-url"] as string) : "";
  const idx = url.indexOf("?");
  const params = idx >= 0 ? new URLSearchParams(url.slice(idx + 1)) : new URLSearchParams();
  const deviceId = params.get("deviceId") ?? "";
  const resource = params.get("resource") ?? "";
  const sinceParam = params.get("since");

  if (!deviceId || !SUPPORTED_RESOURCES.has(resource)) {
    res.status(400).json({
      code: "validation_error",
      message: "deviceId and a supported resource are required",
      supported: Array.from(SUPPORTED_RESOURCES)
    });
    return;
  }

  await upsertDevice({
    id: deviceId,
    organisationId: actor.organisationId,
    userId: actor.userId,
    platform: "unknown"
  });

  const stored = await getCursor(actor.organisationId, deviceId, resource);
  const since = sinceParam ?? stored ?? "1970-01-01T00:00:00.000Z";

  const items = await fetchSince(resource, actor.organisationId, since);
  const nextCursor = items.length > 0 ? (items[items.length - 1] as { _cursor: string })._cursor : since;

  if (nextCursor !== since) {
    await setCursor({
      organisationId: actor.organisationId,
      deviceId,
      resource,
      cursor: nextCursor
    });
  }

  res.status(200).json({
    organisationId: actor.organisationId,
    deviceId,
    resource,
    since,
    nextCursor,
    count: items.length,
    items: items.map((row) => {
      const r = row as Record<string, unknown>;
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k !== "_cursor") rest[k] = v;
      }
      return rest;
    })
  });
}

async function fetchSince(resource: string, organisationId: string, since: string): Promise<unknown[]> {
  switch (resource) {
    case "visits":
      return queryRows(
        `SELECT id, organisation_id, outlet_id, assigned_user_id, visit_date, status,
                outcome, notes, checked_in_at, checked_out_at, geofence_status,
                COALESCE(checked_out_at, checked_in_at, visit_date::timestamptz)::text AS _cursor
         FROM visit
         WHERE organisation_id = $1
           AND COALESCE(checked_out_at, checked_in_at, visit_date::timestamptz) > $2::timestamptz
         ORDER BY _cursor ASC
         LIMIT 500`,
        [organisationId, since]
      );
    case "outlets":
      return queryRows(
        `SELECT id, organisation_id, name,
                ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude,
                created_at::text AS _cursor
         FROM outlet
         WHERE organisation_id = $1 AND created_at > $2::timestamptz
         ORDER BY _cursor ASC
         LIMIT 500`,
        [organisationId, since]
      );
    case "leads":
      return queryRows(
        `SELECT id, organisation_id, outlet_id, name, status, priority, assigned_user_id,
                created_at::text AS _cursor
         FROM lead
         WHERE organisation_id = $1 AND created_at > $2::timestamptz
         ORDER BY _cursor ASC
         LIMIT 500`,
        [organisationId, since]
      );
    case "route-plans":
      return queryRows(
        `SELECT id, organisation_id, assigned_user_id, route_date, status,
                planned_distance_meters, planned_duration_minutes, provider,
                created_at::text AS _cursor
         FROM route_plan
         WHERE organisation_id = $1 AND created_at > $2::timestamptz
         ORDER BY _cursor ASC
         LIMIT 500`,
        [organisationId, since]
      );
    default:
      return [];
  }
}
