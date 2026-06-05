import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");

  res.status(200).json({
    organisationId: actor.organisationId,
    status: "ready"
  });
}
