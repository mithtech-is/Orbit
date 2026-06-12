import { createHash, randomBytes } from "node:crypto";
import { getDatabasePool, queryRows } from "../db/client.js";

/**
 * Self-service password reset. We store only a SHA-256 HASH of the token; the
 * raw token is emailed once and never persisted, so a DB leak can't be used to
 * reset accounts. Tokens are single-use and time-boxed.
 */
export const RESET_TOKEN_TTL_MINUTES = 30;

/** Opaque, URL-safe reset token. */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic hash stored in the DB and looked up on redemption. Pure. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResetTokenRow {
  id: string;
  organisation_id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

export async function createResetToken(input: {
  organisationId: string;
  userId: string;
  tokenHash: string;
  ttlMinutes?: number;
}): Promise<void> {
  const pool = getDatabasePool();
  // Invalidate any outstanding tokens for this user first (one live token at a time).
  await pool.query(
    `UPDATE password_reset_token SET used_at = now()
     WHERE organisation_id = $1 AND user_id = $2 AND used_at IS NULL`,
    [input.organisationId, input.userId]
  );
  await pool.query(
    `INSERT INTO password_reset_token (organisation_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [input.organisationId, input.userId, input.tokenHash, input.ttlMinutes ?? RESET_TOKEN_TTL_MINUTES]
  );
}

/** Returns the matching unused, unexpired token row (scoped to the org), or undefined. */
export async function findValidResetToken(organisationId: string, tokenHash: string): Promise<ResetTokenRow | undefined> {
  const rows = await queryRows<ResetTokenRow>(
    `SELECT id, organisation_id, user_id, expires_at, used_at
     FROM password_reset_token
     WHERE organisation_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [organisationId, tokenHash]
  );
  return rows[0];
}

export async function markResetTokenUsed(id: string): Promise<void> {
  await getDatabasePool().query(`UPDATE password_reset_token SET used_at = now() WHERE id = $1`, [id]);
}
