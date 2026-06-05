import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getDatabasePool, queryRows } from "../db/client.js";
import { getEnv } from "../config/env.js";
import { areaForRole, type AppArea } from "./areas.js";

const JWT_EXPIRES_IN = "24h";

function jwtSecret(): string {
  return getEnv().jwtSecret;
}

export interface AuthTokenPayload {
  userId: string;
  organisationId: string;
  role: string;
  permissions: string[];
  /**
   * Access area derived from role. Stamped into the token so both frontends gate
   * on it without re-deriving the rule. Tokens minted before this field existed
   * (or via the dev header path) fall back to {@link areaForRole} at read time.
   */
  area?: AppArea;
  /** Unique token id — used for server-side revocation (logout / forced sign-out). */
  jti?: string;
  /** Standard JWT expiry (seconds since epoch), present on verified tokens. */
  exp?: number;
}

export function signToken(payload: AuthTokenPayload, expiresIn: string = JWT_EXPIRES_IN): string {
  // Always stamp the area (can't drift from role) and a unique jti (for revocation).
  const claims: AuthTokenPayload = { ...payload, area: areaForRole(payload.role), jti: payload.jti ?? randomUUID() };
  return jwt.sign(claims, jwtSecret(), { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string): AuthTokenPayload {
  const payload = jwt.verify(token, jwtSecret()) as AuthTokenPayload;
  // Backfill area for tokens minted before the field existed.
  return { ...payload, area: payload.area ?? areaForRole(payload.role) };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AppUser {
  id: string;
  organisation_id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  password_hash: string | null;
}

export async function findUserByEmail(organisationId: string, email: string): Promise<AppUser | undefined> {
  const rows = await queryRows<AppUser>(
    `SELECT id, organisation_id, email, name, role, password_hash, active
     FROM app_user
     WHERE organisation_id = $1 AND email = $2`,
    [organisationId, email]
  );
  return rows[0];
}

export async function getUserPermissions(organisationId: string, role: string): Promise<string[]> {
  const rows = await queryRows<{ permission: string }>(
    `SELECT permission FROM role_permission WHERE organisation_id = $1 AND role = $2`,
    [organisationId, role]
  );
  return rows.map((r) => r.permission);
}

/**
 * Demo-only: provisions credentials for the dev admin and backfills a shared
 * dev password onto any seeded persona that lacks one. **Refuses to run in
 * production unless ENABLE_DEMO_SEED=true is explicitly set.** Even then the
 * production env validator rejects the combination — so this function is
 * effectively development-only.
 *
 * For real first-admin provisioning in production use the CLI:
 *   pnpm create-initial-admin
 */
export async function ensureSeedUser(): Promise<{ skipped: boolean; reason?: string }> {
  const env = getEnv();
  if (env.env === "production" && !env.enableDemoSeed) {
    return { skipped: true, reason: "production: ENABLE_DEMO_SEED not set" };
  }

  const pool = getDatabasePool();
  const hash = await hashPassword("admin123");

  await pool.query(
    `INSERT INTO app_user (id, organisation_id, email, name, role, password_hash, active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (organisation_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`,
    ["user_dev_admin", "mithtech", "admin@fieldsales.local", "Dev Admin", "organisation_admin", hash]
  );

  // Backfill: any seeded user without a password gets the shared dev hash so
  // local QA / E2E can authenticate as them. Idempotent.
  await pool.query(
    `UPDATE app_user
     SET password_hash = $1
     WHERE organisation_id = $2
       AND password_hash IS NULL
       AND active = true`,
    [hash, "mithtech"]
  );

  return { skipped: false };
}

/** Shared password-strength gate used by invite, change, and reset flows. */
export function assertStrongPassword(password: string): void {
  if (!password || password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  if (/^(admin|password|changeme|fieldsales|routepilot)/i.test(password)) {
    throw new Error("Password is too predictable. Pick something unique.");
  }
}

/**
 * Sets a user's password (used by self-service reset). Validates strength,
 * hashes, clears the force-change flag. Returns false when no such active user.
 */
export async function setUserPassword(organisationId: string, userId: string, newPassword: string): Promise<boolean> {
  assertStrongPassword(newPassword);
  const hash = await hashPassword(newPassword);
  const pool = getDatabasePool();
  const res = await pool.query(
    `UPDATE app_user SET password_hash = $1, password_change_required = false
     WHERE id = $2 AND organisation_id = $3 AND active = true`,
    [hash, userId, organisationId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Production-safe admin creation. Used by the `create-initial-admin` CLI and
 * the `POST /api/v1/users` invite endpoint. Enforces password strength.
 */
export async function createUserWithPassword(input: {
  id?: string;
  organisationId: string;
  email: string;
  name: string;
  role: string;
  password: string;
  forcePasswordChange?: boolean;
}): Promise<{ id: string }> {
  if (!input.email || !input.email.includes("@")) {
    throw new Error("A valid email is required.");
  }
  if (!input.password || input.password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  if (/^(admin|password|changeme|fieldsales|routepilot)/i.test(input.password)) {
    throw new Error("Password is too predictable. Pick something unique.");
  }

  const id = input.id ?? `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const hash = await hashPassword(input.password);
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO app_user (id, organisation_id, email, name, role, password_hash, active, password_change_required)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7)
     ON CONFLICT (organisation_id, email) DO NOTHING`,
    [id, input.organisationId, input.email.trim().toLowerCase(), input.name, input.role, hash, input.forcePasswordChange ?? false]
  );

  const existing = await queryRows<{ id: string }>(
    `SELECT id FROM app_user WHERE organisation_id = $1 AND email = $2`,
    [input.organisationId, input.email.trim().toLowerCase()]
  );
  return { id: existing[0]?.id ?? id };
}
