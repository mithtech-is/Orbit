import { getDatabasePool, queryRows } from "../../db/client.js";

export interface DeviceRegistration {
  id: string;
  organisation_id: string;
  user_id: string;
  platform: string;
  app_version: string | null;
  push_token: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface MutationRecordRow {
  organisation_id: string;
  idempotency_key: string;
  device_id: string | null;
  user_id: string;
  mutation_type: string;
  payload: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface SyncConflictRow {
  id: string;
  organisation_id: string;
  idempotency_key: string;
  mutation_type: string;
  reason: string;
  client_payload: Record<string, unknown>;
  server_state: Record<string, unknown> | null;
  created_at: string;
}

export async function upsertDevice(input: {
  id: string;
  organisationId: string;
  userId: string;
  platform: string;
  appVersion?: string;
  pushToken?: string;
}): Promise<DeviceRegistration> {
  const rows = await queryRows<DeviceRegistration>(
    `INSERT INTO device_registration (id, organisation_id, user_id, platform, app_version, push_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       platform = EXCLUDED.platform,
       app_version = COALESCE(EXCLUDED.app_version, device_registration.app_version),
       push_token = COALESCE(EXCLUDED.push_token, device_registration.push_token),
       last_seen_at = now()
     RETURNING id, organisation_id, user_id, platform, app_version, push_token, first_seen_at, last_seen_at`,
    [input.id, input.organisationId, input.userId, input.platform, input.appVersion ?? null, input.pushToken ?? null]
  );
  return rows[0];
}

export async function findMutationByKey(
  organisationId: string,
  idempotencyKey: string
): Promise<MutationRecordRow | undefined> {
  const rows = await queryRows<MutationRecordRow>(
    `SELECT organisation_id, idempotency_key, device_id, user_id, mutation_type,
            payload, status, result, error, received_at, processed_at
     FROM mutation_record
     WHERE organisation_id = $1 AND idempotency_key = $2`,
    [organisationId, idempotencyKey]
  );
  return rows[0];
}

export async function recordMutation(input: {
  organisationId: string;
  idempotencyKey: string;
  deviceId: string | null;
  userId: string;
  mutationType: string;
  payload: Record<string, unknown>;
  status: "applied" | "conflict" | "rejected";
  result?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO mutation_record (organisation_id, idempotency_key, device_id, user_id, mutation_type,
                                  payload, status, result, error, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (organisation_id, idempotency_key) DO NOTHING`,
    [
      input.organisationId,
      input.idempotencyKey,
      input.deviceId,
      input.userId,
      input.mutationType,
      JSON.stringify(input.payload),
      input.status,
      input.result ? JSON.stringify(input.result) : null,
      input.error ?? null
    ]
  );
}

export async function recordConflict(input: {
  organisationId: string;
  idempotencyKey: string;
  mutationType: string;
  reason: string;
  clientPayload: Record<string, unknown>;
  serverState?: Record<string, unknown>;
}): Promise<string> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `INSERT INTO sync_conflict (organisation_id, idempotency_key, mutation_type, reason, client_payload, server_state)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.organisationId,
      input.idempotencyKey,
      input.mutationType,
      input.reason,
      JSON.stringify(input.clientPayload),
      input.serverState ? JSON.stringify(input.serverState) : null
    ]
  );
  return result.rows[0].id as string;
}

export async function listConflicts(
  organisationId: string,
  limit = 100
): Promise<SyncConflictRow[]> {
  return queryRows<SyncConflictRow>(
    `SELECT id, organisation_id, idempotency_key, mutation_type, reason, client_payload, server_state, created_at
     FROM sync_conflict
     WHERE organisation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organisationId, Math.min(Math.max(limit, 1), 500)]
  );
}

export async function getConflict(organisationId: string, id: string): Promise<SyncConflictRow | undefined> {
  const rows = await queryRows<SyncConflictRow>(
    `SELECT id, organisation_id, idempotency_key, mutation_type, reason, client_payload, server_state, created_at
     FROM sync_conflict WHERE organisation_id = $1 AND id = $2`,
    [organisationId, id]
  );
  return rows[0];
}

/** Removes a conflict once it's been resolved (applied/dismissed). Returns true if a row was deleted. */
export async function deleteConflict(organisationId: string, id: string): Promise<boolean> {
  const pool = getDatabasePool();
  const res = await pool.query(`DELETE FROM sync_conflict WHERE organisation_id = $1 AND id = $2`, [organisationId, id]);
  return (res.rowCount ?? 0) > 0;
}

export async function getCursor(
  organisationId: string,
  deviceId: string,
  resource: string
): Promise<string | undefined> {
  const rows = await queryRows<{ cursor: string }>(
    `SELECT cursor FROM sync_cursor
     WHERE organisation_id = $1 AND device_id = $2 AND resource = $3`,
    [organisationId, deviceId, resource]
  );
  return rows[0]?.cursor;
}

export async function setCursor(input: {
  organisationId: string;
  deviceId: string;
  resource: string;
  cursor: string;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO sync_cursor (organisation_id, device_id, resource, cursor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organisation_id, device_id, resource) DO UPDATE SET
       cursor = EXCLUDED.cursor, updated_at = now()`,
    [input.organisationId, input.deviceId, input.resource, input.cursor]
  );
}
