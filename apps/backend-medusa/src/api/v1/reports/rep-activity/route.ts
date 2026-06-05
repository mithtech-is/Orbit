import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import { loadRepActivity } from "../../../../modules/reports/repository.js";

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const rows = await loadRepActivity(actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "reports.rep_activity",
    items: rows
  });
}
