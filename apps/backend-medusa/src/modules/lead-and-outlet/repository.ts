import { getDatabasePool, queryRows } from "../../db/client.js";
import type { LeadAndOutletRepository, LeadRow, OutletRow } from "./query-service.js";

export interface CreateOutletInput {
  id: string;
  organisationId: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface CreateLeadInput {
  id: string;
  organisationId: string;
  /** Nullable FK to outlet(id) — null when the lead has no outlet yet. */
  outletId: string | null;
  name: string;
  status: string;
  priority: number;
  /** Nullable FK to app_user(id) — null when the lead is unassigned. */
  assignedUserId: string | null;
  /** Optional pinned location captured on the map (null when unset). */
  latitude?: number | null;
  longitude?: number | null;
}

export function createLeadAndOutletRepository(): LeadAndOutletRepository {
  return {
    queryOutlets(organisationId) {
      return queryRows<OutletRow>(
        `SELECT o.id,
                o.organisation_id,
                o.name,
                ST_Y(o.location::geometry) AS latitude,
                ST_X(o.location::geometry) AS longitude,
                v.last_visited_at,
                COALESCE(v.visit_count, 0) AS visit_count
         FROM outlet o
         LEFT JOIN (
           SELECT outlet_id,
                  MAX(COALESCE(checked_out_at, checked_in_at, visit_date::timestamptz))::text AS last_visited_at,
                  COUNT(*) AS visit_count
           FROM visit
           WHERE organisation_id = $1
           GROUP BY outlet_id
         ) v ON v.outlet_id = o.id
         WHERE o.organisation_id = $1
         ORDER BY o.name ASC`,
        [organisationId]
      );
    },

    queryLeads(organisationId) {
      return queryRows<LeadRow>(
        `SELECT l.id,
                l.organisation_id,
                l.outlet_id,
                l.name,
                l.status,
                l.priority,
                l.assigned_user_id,
                au.name AS assigned_user_name,
                l.latitude,
                l.longitude
         FROM lead l
         LEFT JOIN app_user au ON au.id = l.assigned_user_id
         WHERE l.organisation_id = $1
         ORDER BY l.priority DESC, l.created_at ASC, l.id ASC`,
        [organisationId]
      );
    }
  };
}

/**
 * Authoritative outlet location (lat/lng) read from the DB — used for
 * server-side geofence verification so a client can't spoof its position
 * relative to the outlet. Returns null when the outlet isn't in the tenant.
 */
export async function getOutletLocation(organisationId: string, outletId: string): Promise<{ latitude: number; longitude: number } | null> {
  const rows = await queryRows<{ latitude: number | string; longitude: number | string }>(
    `SELECT ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
       FROM outlet WHERE id = $1 AND organisation_id = $2`,
    [outletId, organisationId]
  );
  if (!rows.length) return null;
  return { latitude: Number(rows[0].latitude), longitude: Number(rows[0].longitude) };
}

export async function insertOutlet(input: CreateOutletInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO outlet (id, organisation_id, name, location)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)`,
    [input.id, input.organisationId, input.name, input.longitude, input.latitude]
  );
}

export async function insertLead(input: CreateLeadInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO lead (id, organisation_id, outlet_id, name, status, priority, assigned_user_id, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [input.id, input.organisationId, input.outletId, input.name, input.status, input.priority, input.assignedUserId,
     input.latitude ?? null, input.longitude ?? null]
  );
}

export async function updateLead(input: CreateLeadInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE lead SET name = $1, status = $2, priority = $3, outlet_id = $4, assigned_user_id = $5,
        latitude = $8, longitude = $9
     WHERE id = $6 AND organisation_id = $7`,
    [input.name, input.status, input.priority, input.outletId, input.assignedUserId, input.id, input.organisationId,
     input.latitude ?? null, input.longitude ?? null]
  );
}

/**
 * Status-only update for a lead a rep owns. Reps have `lead:read` (not write),
 * so this is the ONLY lead mutation they can make — it touches status alone and
 * never the assignee, outlet, or anything else. Scoped to the assigned rep at
 * the route layer. Returns true when a row was updated.
 */
export async function updateLeadStatusOwned(
  id: string,
  organisationId: string,
  status: string,
  ownerUserId: string
): Promise<boolean> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `UPDATE lead SET status = $3
      WHERE id = $1 AND organisation_id = $2 AND assigned_user_id = $4`,
    [id, organisationId, status, ownerUserId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteLead(id: string, organisationId: string): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `DELETE FROM lead WHERE id = $1 AND organisation_id = $2`,
    [id, organisationId]
  );
}

/**
 * Apply an inbound ERP/CRM change to a lead. Updates ONLY name + status (the
 * fields the CRM owns once a lead is synced) and leaves outlet/priority/assignee
 * untouched. Returns true if a row was updated.
 */
export async function updateLeadFromErp(input: {
  id: string;
  organisationId: string;
  name?: string;
  status?: string;
}): Promise<boolean> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `UPDATE lead
        SET name = COALESCE($3, name),
            status = COALESCE($4, status)
      WHERE id = $1 AND organisation_id = $2`,
    [input.id, input.organisationId, input.name ?? null, input.status ?? null]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateOutlet(input: CreateOutletInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE outlet SET name = $1,
        location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
     WHERE id = $4 AND organisation_id = $5`,
    [input.name, input.longitude, input.latitude, input.id, input.organisationId]
  );
}

export async function deleteOutlet(id: string, organisationId: string): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `DELETE FROM outlet WHERE id = $1 AND organisation_id = $2`,
    [id, organisationId]
  );
}
