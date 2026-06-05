import { createApiClient, type LoginResponse } from "@orbit/api-client";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:9000";

const TOKEN_KEY = "field_sales_token";
const SESSION_KEY = "field_sales_session";
const STASH_TOKEN_KEY = "field_sales_admin_token";
const STASH_SESSION_KEY = "field_sales_admin_session";

export type AppArea = "admin" | "field";

export interface StoredSession {
  userId: string;
  organisationId: string;
  name: string;
  email: string;
  role: string;
  area?: AppArea;
  permissions?: string[];
}

/** Single source of truth on the client, mirroring the backend areas.ts. */
export function areaForRole(role: string | undefined): AppArea {
  return role === "field_sales_representative" ? "field" : "admin";
}

function loadToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    return stored ?? undefined;
  } catch {
    return undefined;
  }
}

export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function saveToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
  token: loadToken()
});

export function rehydrateToken(): void {
  const token = loadToken();
  if (token) {
    apiClient.setToken(token);
  }
}

export async function loginUser(email: string, password: string, organisationId: string): Promise<LoginResponse> {
  const result = await apiClient.login({ email, password, organisationId });
  saveToken(result.token);
  saveSession({
    userId: result.userId,
    organisationId: result.organisationId,
    name: result.name,
    email: result.email,
    role: result.role,
    area: result.area ?? areaForRole(result.role),
    permissions: result.permissions
  });
  return result;
}

export function logoutUser(): void {
  // Best-effort server-side revocation (denylist the token's jti) — never block
  // the local sign-out on it.
  try {
    void apiClient.logout().catch(() => undefined);
  } catch {}
  clearToken();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STASH_TOKEN_KEY);
      localStorage.removeItem(STASH_SESSION_KEY);
    } catch {}
  }
  window.location.href = "/login";
}

export interface ImpersonationInfo {
  active: boolean;
  adminName?: string;
  adminEmail?: string;
}

export function getImpersonation(): ImpersonationInfo {
  if (typeof window === "undefined") return { active: false };
  try {
    const stash = localStorage.getItem(STASH_SESSION_KEY);
    if (!stash) return { active: false };
    const parsed = JSON.parse(stash) as StoredSession;
    return { active: true, adminName: parsed.name, adminEmail: parsed.email };
  } catch {
    return { active: false };
  }
}

export function startImpersonation(target: {
  token: string;
  userId: string;
  organisationId: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
}): void {
  if (typeof window === "undefined") return;
  const currentToken = localStorage.getItem(TOKEN_KEY);
  const currentSession = localStorage.getItem(SESSION_KEY);
  if (currentToken && currentSession && !localStorage.getItem(STASH_TOKEN_KEY)) {
    localStorage.setItem(STASH_TOKEN_KEY, currentToken);
    localStorage.setItem(STASH_SESSION_KEY, currentSession);
  }
  localStorage.setItem(TOKEN_KEY, target.token);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      userId: target.userId,
      organisationId: target.organisationId,
      name: target.name,
      email: target.email,
      role: target.role,
      area: areaForRole(target.role),
      permissions: target.permissions
    })
  );
  apiClient.setToken(target.token);
}

export function stopImpersonation(): void {
  if (typeof window === "undefined") return;
  const stashedToken = localStorage.getItem(STASH_TOKEN_KEY);
  const stashedSession = localStorage.getItem(STASH_SESSION_KEY);
  if (stashedToken && stashedSession) {
    localStorage.setItem(TOKEN_KEY, stashedToken);
    localStorage.setItem(SESSION_KEY, stashedSession);
    localStorage.removeItem(STASH_TOKEN_KEY);
    localStorage.removeItem(STASH_SESSION_KEY);
    apiClient.setToken(stashedToken);
  } else {
    clearToken();
  }
  window.location.href = "/";
}

export async function safeFetch<T>(fetchFn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetchFn();
  } catch {
    return fallback;
  }
}
