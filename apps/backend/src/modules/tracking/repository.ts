import { getDatabasePool, queryRows } from "../../db/client.js";

export interface WorkSessionRow {
  id: string;
  organisation_id: string;
  user_id: string;
  consent_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  started_latitude: number | null;
  started_longitude: number | null;
}

export interface ConsentLogRow {
  id: string;
  organisation_id: string;
  user_id: string;
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
}

export interface LatestPingRow {
  user_id: string;
  work_session_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  recorded_at: string;
}

export interface TrackingRepository {
  queryActiveSession(organisationId: string, userId: string): Promise<WorkSessionRow | undefined>;
  querySessionsToday(organisationId: string): Promise<WorkSessionRow[]>;
  /**
   * Rep-scoped variant: only the given user's sessions today. Used so the mobile
   * app's 30s session poll doesn't download the whole org's session list every
   * time — see performance-audit C6.
   */
  querySessionsTodayForUser(organisationId: string, userId: string): Promise<WorkSessionRow[]>;
  queryLatestConsent(organisationId: string, userId: string): Promise<ConsentLogRow | undefined>;
  /**
   * Latest ping for every currently-active work session in the tenant whose most
   * recent ping is newer than `liveWindowSeconds`. Used by the manager's live-map
   * page to render initial markers on load. The freshness filter is what stops a
   * stale `active` session (rep's app died without stopping) from rendering a
   * fake live location indefinitely.
   */
  queryLatestPingsForActiveSessions(organisationId: string, liveWindowSeconds: number): Promise<LatestPingRow[]>;
}

export function createTrackingRepository(): TrackingRepository {
  return {
    async queryActiveSession(organisationId, userId) {
      const rows = await queryRows<WorkSessionRow>(
        `SELECT id, organisation_id, user_id, consent_id, status,
                started_at, ended_at, started_latitude, started_longitude
         FROM work_session
         WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'
         ORDER BY started_at DESC LIMIT 1`,
        [organisationId, userId]
      );
      return rows[0];
    },

    querySessionsToday(organisationId) {
      return queryRows<WorkSessionRow>(
        `SELECT id, organisation_id, user_id, consent_id, status,
                started_at, ended_at, started_latitude, started_longitude
         FROM work_session
         WHERE organisation_id = $1 AND started_at >= CURRENT_DATE
         ORDER BY started_at DESC`,
        [organisationId]
      );
    },

    querySessionsTodayForUser(organisationId, userId) {
      return queryRows<WorkSessionRow>(
        `SELECT id, organisation_id, user_id, consent_id, status,
                started_at, ended_at, started_latitude, started_longitude
         FROM work_session
         WHERE organisation_id = $1 AND user_id = $2 AND started_at >= CURRENT_DATE
         ORDER BY started_at DESC`,
        [organisationId, userId]
      );
    },

    async queryLatestConsent(organisationId, userId) {
      const rows = await queryRows<ConsentLogRow>(
        `SELECT id, organisation_id, user_id, granted, granted_at, revoked_at
         FROM consent_log
         WHERE organisation_id = $1 AND user_id = $2
         ORDER BY granted_at DESC LIMIT 1`,
        [organisationId, userId]
      );
      return rows[0];
    },

    queryLatestPingsForActiveSessions(organisationId, liveWindowSeconds) {
      // Returns the most recent ping for every rep who currently has an active
      // session AND whose latest ping is within the live window. We DISTINCT ON
      // user_id (not work_session_id) so a rep who just started a fresh session
      // — and hasn't pinged it yet — still appears at their last known location
      // from an earlier session, *provided that ping is still fresh*.
      //
      // The `recorded_at >= now() - window` filter is the core fix for the fake
      // live location: a session can stay `active` forever if the rep's app is
      // killed without stopping it, but its last ping ages out of the window so
      // the rep correctly drops off the map until they ping again.
      return queryRows<LatestPingRow>(
        `WITH active_users AS (
           SELECT DISTINCT user_id, id AS active_session_id
           FROM work_session
           WHERE organisation_id = $1 AND status = 'active'
         )
         SELECT DISTINCT ON (p.user_id)
           p.user_id,
           COALESCE(au.active_session_id, p.work_session_id) AS work_session_id,
           p.latitude,
           p.longitude,
           p.accuracy_meters,
           p.recorded_at
         FROM location_ping p
         JOIN active_users au ON au.user_id = p.user_id
         WHERE p.organisation_id = $1
           AND p.recorded_at >= now() - make_interval(secs => $2)
           AND p.recorded_at <= now()
         ORDER BY p.user_id, p.recorded_at DESC`,
        [organisationId, liveWindowSeconds]
      );
    }
  };
}

export async function recordConsent(input: {
  organisationId: string;
  userId: string;
  granted: boolean;
  deviceInfo?: Record<string, unknown>;
}): Promise<string> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `INSERT INTO consent_log (organisation_id, user_id, granted, device_info)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.organisationId, input.userId, input.granted, JSON.stringify(input.deviceInfo ?? {})]
  );

  if (!input.granted) {
    await pool.query(
      `UPDATE work_session SET status = 'stopped', ended_at = now()
       WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
      [input.organisationId, input.userId]
    );
  }

  return result.rows[0].id as string;
}

export async function startWorkSession(input: {
  id: string;
  organisationId: string;
  userId: string;
  consentId: string;
  latitude?: number;
  longitude?: number;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO work_session (id, organisation_id, user_id, consent_id,
                               status, started_at, started_latitude, started_longitude)
     VALUES ($1, $2, $3, $4, 'active', now(), $5, $6)`,
    [input.id, input.organisationId, input.userId, input.consentId,
     input.latitude ?? null, input.longitude ?? null]
  );
}

export async function stopWorkSession(input: {
  organisationId: string;
  sessionId: string;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `UPDATE work_session SET status = 'stopped', ended_at = now()
     WHERE id = $1 AND organisation_id = $2 AND status = 'active'`,
    [input.sessionId, input.organisationId]
  );
}

/**
 * Marks the latest active consent revoked AND stops any active session for that
 * rep. Returns the number of consent rows updated (0 or 1) and whether a session
 * was stopped — used by the API layer to write an accurate audit entry.
 */
export async function revokeConsent(input: {
  organisationId: string;
  userId: string;
  /** Reason the rep gave when turning sharing off during working hours. */
  reason?: string | null;
}): Promise<{ consentRevoked: boolean; sessionStopped: boolean }> {
  const pool = getDatabasePool();
  const consent = await pool.query(
    `UPDATE consent_log
     SET revoked_at = now(), granted = false, revoke_reason = $3
     WHERE id = (
       SELECT id FROM consent_log
       WHERE organisation_id = $1 AND user_id = $2 AND revoked_at IS NULL
       ORDER BY granted_at DESC LIMIT 1
     )
     RETURNING id`,
    [input.organisationId, input.userId, input.reason ?? null]
  );

  const session = await pool.query(
    `UPDATE work_session SET status = 'stopped', ended_at = now()
     WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'
     RETURNING id`,
    [input.organisationId, input.userId]
  );

  return {
    consentRevoked: consent.rowCount !== null && consent.rowCount > 0,
    sessionStopped: session.rowCount !== null && session.rowCount > 0
  };
}

export interface UserConsentStatusRow {
  user_id: string;
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}

/**
 * Latest consent row per user in the tenant — powers the admin "Tracking" column
 * on the Users page (current sharing status + the reason given when last turned
 * off). DISTINCT ON (user_id) ordered by granted_at picks each user's newest row.
 */
export async function queryLatestConsentPerUser(organisationId: string): Promise<UserConsentStatusRow[]> {
  return queryRows<UserConsentStatusRow>(
    `SELECT DISTINCT ON (user_id)
       user_id, granted, granted_at, revoked_at, revoke_reason
     FROM consent_log
     WHERE organisation_id = $1
     ORDER BY user_id, granted_at DESC`,
    [organisationId]
  );
}

export interface InsertPingsInput {
  organisationId: string;
  userId: string;
  workSessionId: string;
  pings: Array<{
    id: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    recordedAt: string;
  }>;
}

/**
 * Inserts a batch of location pings inside the rep's active session. The PK is
 * `(organisation_id, id)` so duplicates from a retried sync are silently ignored
 * via `ON CONFLICT DO NOTHING`. Returns the count actually persisted.
 */
export async function insertLocationPings(input: InsertPingsInput): Promise<number> {
  if (input.pings.length === 0) return 0;
  const pool = getDatabasePool();
  const values: unknown[] = [];
  const tuples: string[] = [];
  let p = 1;
  for (const ping of input.pings) {
    tuples.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
    );
    values.push(
      ping.id,
      input.organisationId,
      input.workSessionId,
      input.userId,
      ping.latitude,
      ping.longitude,
      ping.accuracyMeters,
      ping.recordedAt
    );
  }
  const result = await pool.query(
    `INSERT INTO location_ping
       (id, organisation_id, work_session_id, user_id, latitude, longitude, accuracy_meters, recorded_at)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (organisation_id, id, recorded_at) DO NOTHING`,
    values
  );
  return result.rowCount ?? 0;
}

export interface ExpiredSessionRow {
  id: string;
  organisation_id: string;
  user_id: string;
  ended_at: string;
}

/**
 * Auto-stops abandoned work sessions across ALL tenants in one pass: any session
 * still `active` whose last activity (the later of its start time and its most
 * recent ping) is older than `staleAfterSeconds`. This is the durable cleanup
 * behind the live map — without it, a session left open when a rep's app is
 * killed stays `active` forever and the rep's session list / map state lies.
 *
 * `ended_at` is set to the last activity time, not now(), so the recorded
 * session duration reflects when the rep actually went silent rather than when
 * the sweep happened. Returns the rows it closed so the caller can write audit
 * entries. Intended for a scheduled job; callable inline for tests.
 */
export async function expireStaleSessions(staleAfterSeconds: number): Promise<ExpiredSessionRow[]> {
  const pool = getDatabasePool();
  const result = await pool.query<ExpiredSessionRow>(
    `WITH last_activity AS (
       SELECT ws.id,
              GREATEST(ws.started_at, COALESCE(MAX(p.recorded_at), ws.started_at)) AS last_at
       FROM work_session ws
       LEFT JOIN location_ping p
         ON p.work_session_id = ws.id AND p.organisation_id = ws.organisation_id
       WHERE ws.status = 'active'
       GROUP BY ws.id, ws.started_at
     )
     UPDATE work_session ws
     SET status = 'stopped', ended_at = la.last_at
     FROM last_activity la
     WHERE ws.id = la.id
       AND la.last_at < now() - make_interval(secs => $1)
     RETURNING ws.id, ws.organisation_id, ws.user_id, ws.ended_at`,
    [staleAfterSeconds]
  );
  return result.rows;
}

/**
 * Retention sweep: deletes pings older than the tenant's configured
 * `raw_location_retention_days`. Returns the number of rows deleted. Intended
 * for a scheduled job; callable inline for tests.
 */
export async function sweepExpiredPings(organisationId: string): Promise<number> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `DELETE FROM location_ping
     WHERE organisation_id = $1
       AND recorded_at < now() - make_interval(days => (
         SELECT raw_location_retention_days FROM organisation_setting WHERE organisation_id = $1
       ))`,
    [organisationId]
  );
  return result.rowCount ?? 0;
}
