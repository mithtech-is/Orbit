import type { AppRouteRequest, AppRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { loadRepSelfAnalytics } from "../../../../modules/reports/repository.js";

/**
 * GET /api/v1/me/analytics — the authenticated user's OWN performance KPIs
 * (visits, completion rate, orders, collections, leads, rank, 14-day trend).
 * Self-scoped: a rep only ever sees their own numbers, so no extra permission
 * beyond a valid session is required.
 */
export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const analytics = await loadRepSelfAnalytics(actor.organisationId, actor.userId);
  res.status(200).json({ organisationId: actor.organisationId, ...analytics });
}
