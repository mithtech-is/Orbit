import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { queryAuditLog } from "../../../modules/audit-and-compliance/repository.js";

/**
 * GET /api/v1/audit-log?actionPrefix=tracking.&limit=100
 * Gated by `audit:read`. Returns up to 500 most-recent entries (capped server-side).
 */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "audit:read");

  const url = typeof req.headers["x-request-url"] === "string" ? (req.headers["x-request-url"] as string) : "";
  const query = parseQuery(url);
  const actionPrefix = query.actionPrefix;
  const limit = query.limit ? Number(query.limit) : undefined;

  const items = await queryAuditLog({
    organisationId: actor.organisationId,
    actionPrefix,
    limit
  });

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "audit_log",
    items: items.map((row) => ({
      id: row.id,
      organisationId: row.organisation_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata,
      createdAt: row.created_at
    }))
  });
}

function parseQuery(rawUrl: string): { actionPrefix?: string; limit?: string } {
  const idx = rawUrl.indexOf("?");
  if (idx < 0) return {};
  const params = new URLSearchParams(rawUrl.slice(idx + 1));
  const result: { actionPrefix?: string; limit?: string } = {};
  const prefix = params.get("actionPrefix");
  if (prefix) result.actionPrefix = prefix;
  const limit = params.get("limit");
  if (limit) result.limit = limit;
  return result;
}
