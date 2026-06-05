import { getDatabasePool, queryRows } from "../../db/client.js";

/**
 * GDPR / data-subject tooling: export everything we hold about a user, and
 * erase their personal data while preserving business records (orders/visits)
 * in anonymised form. Raw location history — the most sensitive data — is hard
 * deleted; the person is anonymised, not cascade-deleted, so referential
 * integrity and transactional history survive.
 */

/** Pure: deterministic anonymised email (unique per user id, never deliverable). */
export function anonymisedEmail(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `erased_${safe}@deleted.invalid`;
}

export const ANONYMISED_NAME = "Deleted user";

/** Cap on raw rows embedded in an export so the payload stays bounded. */
export const EXPORT_ROW_CAP = 5000;

export interface UserDataExport {
  generatedAt: string | null; // stamped by the caller (no Date.now in this layer)
  organisationId: string;
  userId: string;
  profile: Record<string, unknown> | null;
  consentLog: unknown[];
  workSessions: unknown[];
  locationPings: { count: number; truncated: boolean; rows: unknown[] };
  visits: unknown[];
  orders: unknown[];
  notifications: unknown[];
  devices: unknown[];
  auditActions: unknown[];
}

async function rows(sql: string, params: unknown[]): Promise<unknown[]> {
  return queryRows<Record<string, unknown>>(sql, params);
}

export async function exportUserData(organisationId: string, userId: string): Promise<UserDataExport> {
  const profileRows = await queryRows<Record<string, unknown>>(
    `SELECT id, email, name, role, active, password_change_required, created_at
     FROM app_user WHERE organisation_id = $1 AND id = $2`,
    [organisationId, userId]
  );

  const pingCountRows = await queryRows<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM location_ping WHERE organisation_id = $1 AND user_id = $2`,
    [organisationId, userId]
  );
  const pingCount = Number(pingCountRows[0]?.n ?? 0);

  const [consentLog, workSessions, pingRows, visits, orders, notifications, devices, auditActions] = await Promise.all([
    rows(`SELECT id, granted, granted_at, revoked_at FROM consent_log WHERE organisation_id = $1 AND user_id = $2 ORDER BY granted_at DESC`, [organisationId, userId]),
    rows(`SELECT id, status, started_at, ended_at, started_latitude, started_longitude FROM work_session WHERE organisation_id = $1 AND user_id = $2 ORDER BY started_at DESC`, [organisationId, userId]),
    rows(`SELECT id, work_session_id, latitude, longitude, accuracy_meters, recorded_at FROM location_ping WHERE organisation_id = $1 AND user_id = $2 ORDER BY recorded_at DESC LIMIT $3`, [organisationId, userId, EXPORT_ROW_CAP]),
    rows(`SELECT id, outlet_id, visit_date, status, outcome, checked_in_at, checked_out_at, geofence_status FROM visit WHERE organisation_id = $1 AND assigned_user_id = $2 ORDER BY visit_date DESC`, [organisationId, userId]),
    rows(`SELECT id, outlet_id, status, source, total_cents, created_at FROM field_order WHERE organisation_id = $1 AND rep_user_id = $2 ORDER BY created_at DESC`, [organisationId, userId]),
    rows(`SELECT id, type, title, body, status, created_at FROM notification WHERE organisation_id = $1 AND user_id = $2 ORDER BY created_at DESC`, [organisationId, userId]),
    rows(`SELECT id, platform, app_version, first_seen_at, last_seen_at FROM device_registration WHERE organisation_id = $1 AND user_id = $2`, [organisationId, userId]),
    rows(`SELECT action, target_type, target_id, created_at FROM audit_log WHERE organisation_id = $1 AND actor_user_id = $2 ORDER BY created_at DESC LIMIT $3`, [organisationId, userId, EXPORT_ROW_CAP])
  ]);

  return {
    generatedAt: null,
    organisationId,
    userId,
    profile: profileRows[0] ?? null,
    consentLog,
    workSessions,
    locationPings: { count: pingCount, truncated: pingCount > EXPORT_ROW_CAP, rows: pingRows },
    visits,
    orders,
    notifications,
    devices,
    auditActions
  };
}

export interface ErasureSummary {
  anonymised: boolean;
  locationPingsDeleted: number;
  devicesDeleted: number;
  consentsRevoked: number;
}

/**
 * Right-to-erasure: anonymise the person and purge their raw location trail.
 * Business records (orders, visits) are retained but now point at an anonymised
 * user. Idempotent-ish — re-running on an already-erased user is harmless.
 */
export async function eraseUserData(organisationId: string, userId: string): Promise<ErasureSummary> {
  const pool = getDatabasePool();

  await pool.query(
    `UPDATE app_user
     SET name = $3, email = $4, password_hash = NULL, active = false, password_change_required = false
     WHERE organisation_id = $1 AND id = $2`,
    [organisationId, userId, ANONYMISED_NAME, anonymisedEmail(userId)]
  );

  const pings = await pool.query(`DELETE FROM location_ping WHERE organisation_id = $1 AND user_id = $2`, [organisationId, userId]);
  const devices = await pool.query(`DELETE FROM device_registration WHERE organisation_id = $1 AND user_id = $2`, [organisationId, userId]);
  const consents = await pool.query(
    `UPDATE consent_log SET revoked_at = COALESCE(revoked_at, now()), granted = false
     WHERE organisation_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [organisationId, userId]
  );
  // Stop any active session so the now-erased user drops off the live map.
  await pool.query(
    `UPDATE work_session SET status = 'stopped', ended_at = now()
     WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
    [organisationId, userId]
  );

  return {
    anonymised: true,
    locationPingsDeleted: pings.rowCount ?? 0,
    devicesDeleted: devices.rowCount ?? 0,
    consentsRevoked: consents.rowCount ?? 0
  };
}
