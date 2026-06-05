/**
 * Identity + authorisation snapshot for the signed-in user.
 *
 * Mirrors the backend `LoginResponse` shape so the mobile app can decide which
 * tabs / admin links to render without making an extra `/api/v1/auth/session`
 * round-trip on every screen mount.
 */
export interface MobileSession {
  token: string;
  userId: string;
  organisationId: string;
  name: string;
  email: string;
  role: string;
  /** "field" for reps. The field app only permits field-area sessions. */
  area?: "admin" | "field";
  permissions: string[];
}

export interface TokenStorage {
  /** @deprecated Prefer {@link loadSession}. Returns just the JWT. */
  load(): Promise<string | null>;
  /** @deprecated Prefer {@link saveSession}. Stores only the JWT, leaves identity blank. */
  save(token: string): Promise<void>;
  /** Clears any persisted session (and the legacy single-token entry). */
  clear(): Promise<void>;
  /** Returns the full persisted session, or null when no user is signed in. */
  loadSession(): Promise<MobileSession | null>;
  /** Persist the full session (identity, role, permissions, JWT). */
  saveSession(session: MobileSession): Promise<void>;
}
