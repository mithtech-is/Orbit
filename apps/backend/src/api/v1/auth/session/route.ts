import type { AppRouteRequest, AppRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { areaForRole } from "../../../../auth/areas.js";

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  res.status(200).json({
    userId: actor.userId,
    organisationId: actor.organisationId,
    role: actor.role,
    area: areaForRole(actor.role),
    permissions: actor.permissions
  });
}
