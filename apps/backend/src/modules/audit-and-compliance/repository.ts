import { getDatabasePool, queryRows } from "../../db/client.js";

export interface AuditEntryInput {
  organisationId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEntryRow {
  id: string;
  organisation_id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function writeAuditLog(entry: AuditEntryInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO audit_log (organisation_id, actor_user_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.organisationId,
      entry.actorUserId,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.metadata ?? {})
    ]
  );
}

export interface QueryAuditLogInput {
  organisationId: string;
  /** Optional filter: only return entries whose action starts with this prefix (e.g. "tracking."). */
  actionPrefix?: string;
  limit?: number;
}

export async function queryAuditLog(input: QueryAuditLogInput): Promise<AuditEntryRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  if (input.actionPrefix) {
    return queryRows<AuditEntryRow>(
      `SELECT id, organisation_id, actor_user_id, action, target_type, target_id, metadata, created_at
       FROM audit_log
       WHERE organisation_id = $1 AND action LIKE $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [input.organisationId, `${input.actionPrefix}%`, limit]
    );
  }
  return queryRows<AuditEntryRow>(
    `SELECT id, organisation_id, actor_user_id, action, target_type, target_id, metadata, created_at
     FROM audit_log
     WHERE organisation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [input.organisationId, limit]
  );
}
