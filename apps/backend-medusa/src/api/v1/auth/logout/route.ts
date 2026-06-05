import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { verifyToken } from "../../../../auth/auth-service.js";
import { revokeJti } from "../../../../auth/login-security.js";

/**
 * POST /api/v1/auth/logout — server-side revocation of the caller's token.
 * Adds the token's jti to the Redis denylist for its remaining lifetime so it
 * can't be replayed after sign-out (enforced at the request chokepoint). The
 * client should also discard the token locally.
 */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  authenticateRequest(req); // 401 if not authenticated

  const authHeader = req.headers["authorization"];
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (match) {
    try {
      const payload = verifyToken(match[1]);
      const nowSec = Math.floor(Date.now() / 1000);
      const ttl = payload.exp ? payload.exp - nowSec : 0;
      if (payload.jti && ttl > 0) {
        await revokeJti(payload.jti, ttl);
      }
    } catch {
      /* token already invalid — nothing to revoke */
    }
  }

  res.status(200).json({ status: "ok" });
}
