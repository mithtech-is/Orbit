import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { exportUserData, eraseUserData } from "../../../modules/audit-and-compliance/gdpr.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

function targetId(req: MedusaRouteRequest): string {
  return typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
}

/**
 * GET /api/v1/compliance/users/:id/export — full data-subject export (JSON).
 * Allowed for org admins (user:manage) OR the subject themselves (right of access).
 */
export async function GET_EXPORT(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  const id = targetId(req);
  const isSelf = id === actor.userId;
  if (!isSelf) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");
  }

  const bundle = await exportUserData(actor.organisationId, id);
  bundle.generatedAt = new Date().toISOString();

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "compliance.data_export",
    targetType: "app_user",
    targetId: id,
    metadata: { self: isSelf }
  });

  res.status(200).json(bundle);
}

/**
 * POST /api/v1/compliance/users/:id/erase — right to erasure. Anonymises the
 * user and purges raw location data. Org admins only (destructive). A guard
 * stops an admin from erasing their own account by accident.
 */
export async function POST_ERASE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const id = targetId(req);
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "user id required" });
    return;
  }
  if (id === actor.userId) {
    res.status(400).json({ code: "self_erase_blocked", message: "You cannot erase your own account." });
    return;
  }

  const summary = await eraseUserData(actor.organisationId, id);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "compliance.data_erasure",
    targetType: "app_user",
    targetId: id,
    metadata: { ...summary }
  });

  res.status(200).json({ userId: id, ...summary });
}
