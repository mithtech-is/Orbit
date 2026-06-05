import type { MedusaRouteRequest } from "../api/types.js";
import { AuthorisationError, actorFromHeaders } from "./tenant-auth.js";
import { verifyToken } from "./auth-service.js";
import type { AuthenticatedActor } from "./tenant-auth.js";

export function authenticateRequest(req: MedusaRouteRequest): AuthenticatedActor {
  const authHeader = req.headers["authorization"];

  if (authHeader) {
    const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) {
      try {
        const payload = verifyToken(match[1]);
        return {
          userId: payload.userId,
          organisationId: payload.organisationId,
          role: payload.role as AuthenticatedActor["role"],
          permissions: payload.permissions as AuthenticatedActor["permissions"]
        };
      } catch {
        throw new AuthorisationError("Invalid or expired token");
      }
    }
  }

  if (req.headers["x-field-sales-user-id"]) {
    return actorFromHeaders(req.headers);
  }

  throw new AuthorisationError("Missing authentication");
}

/**
 * Best-effort userId extraction that NEVER throws — for cross-cutting concerns
 * (rate limiting, logging) that run before route-level auth and must not reject
 * the request themselves. Returns null when there is no valid credential.
 */
export function getRequestUserIdSafe(req: Pick<MedusaRouteRequest, "headers">): string | null {
  return getRequestAuthSafe(req)?.userId ?? null;
}

/**
 * Best-effort decode of the request's bearer token — returns the userId and jti
 * (for the revocation check) without throwing. Null when there's no valid token.
 * The dev-header auth path has no jti (revocation only applies to real JWTs).
 */
export function getRequestAuthSafe(req: Pick<MedusaRouteRequest, "headers">): { userId: string; jti?: string } | null {
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) {
      try {
        const payload = verifyToken(match[1]);
        return { userId: payload.userId, jti: payload.jti };
      } catch {
        return null;
      }
    }
  }
  const devUserId = req.headers["x-field-sales-user-id"];
  if (devUserId) return { userId: Array.isArray(devUserId) ? devUserId[0] : devUserId };
  return null;
}
