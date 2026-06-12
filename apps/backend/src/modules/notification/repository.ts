import { getDatabasePool, queryRows } from "../../db/client.js";

export interface NotificationRow {
  id: string;
  organisation_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  status: string;
  read_at: string | null;
  created_at: string;
}

export async function insertNotification(input: {
  id: string;
  organisationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO notification (id, organisation_id, user_id, type, title, body, data, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'unread')
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.organisationId,
      input.userId,
      input.type,
      input.title,
      input.body ?? null,
      JSON.stringify(input.data ?? {})
    ]
  );
}

export function listNotifications(organisationId: string, userId: string, limit: number): Promise<NotificationRow[]> {
  return queryRows<NotificationRow>(
    `SELECT id, organisation_id, user_id, type, title, body, data, status, read_at, created_at
     FROM notification
     WHERE organisation_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [organisationId, userId, limit]
  );
}

export async function countUnread(organisationId: string, userId: string): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM notification
     WHERE organisation_id = $1 AND user_id = $2 AND status = 'unread'`,
    [organisationId, userId]
  );
  return Number(rows[0]?.n ?? 0);
}

/** Marks notifications read for the user. Empty `ids` marks ALL unread read. Returns count updated. */
export async function markNotificationsRead(
  organisationId: string,
  userId: string,
  ids: string[]
): Promise<number> {
  const pool = getDatabasePool();
  if (ids.length === 0) {
    const res = await pool.query(
      `UPDATE notification SET status = 'read', read_at = now()
       WHERE organisation_id = $1 AND user_id = $2 AND status = 'unread'`,
      [organisationId, userId]
    );
    return res.rowCount ?? 0;
  }
  const res = await pool.query(
    `UPDATE notification SET status = 'read', read_at = now()
     WHERE organisation_id = $1 AND user_id = $2 AND id = ANY($3) AND status = 'unread'`,
    [organisationId, userId, ids]
  );
  return res.rowCount ?? 0;
}

export interface DeviceRow {
  push_token: string | null;
}

/** Active push tokens for a user (most recently seen first). */
export async function listPushTokensForUser(organisationId: string, userId: string): Promise<string[]> {
  const rows = await queryRows<DeviceRow>(
    `SELECT push_token FROM device_registration
     WHERE organisation_id = $1 AND user_id = $2 AND push_token IS NOT NULL
     ORDER BY last_seen_at DESC`,
    [organisationId, userId]
  );
  return rows.map((r) => r.push_token).filter((t): t is string => Boolean(t));
}

/** Registers/refreshes a device's push token. Upsert on device id. */
export async function registerDeviceToken(input: {
  deviceId: string;
  organisationId: string;
  userId: string;
  platform: string;
  pushToken: string;
  appVersion?: string;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO device_registration (id, organisation_id, user_id, platform, app_version, push_token, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET
       push_token = EXCLUDED.push_token,
       platform = EXCLUDED.platform,
       app_version = EXCLUDED.app_version,
       last_seen_at = now()`,
    [input.deviceId, input.organisationId, input.userId, input.platform, input.appVersion ?? null, input.pushToken]
  );
}
