import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import { backfillErp, erpStatus } from "../../../../integrations/erp-sync.js";
import { writeAuditLog } from "../../../../modules/audit-and-compliance/repository.js";

/** GET /api/v1/integrations/erp/status — connection + mapping counts. */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");
  const status = await erpStatus(actor.organisationId);
  res.status(200).json({ organisationId: actor.organisationId, ...status });
}

/** POST /api/v1/integrations/erp/backfill — push all outlets + products to ERP. */
export async function POST_BACKFILL(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");
  const result = await backfillErp(actor.organisationId);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "erp.backfill",
    targetType: "organisation",
    targetId: actor.organisationId,
    metadata: result
  });
  res.status(200).json({ organisationId: actor.organisationId, backfilled: result });
}
