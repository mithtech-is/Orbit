import type { AppRouteRequest, AppRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import { loadExpenseReport } from "../../../../modules/reports/repository.js";

function queryParam(req: AppRouteRequest, key: string): string | null {
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  return url.searchParams.get(key);
}

function isoDate(value: string | null, fallback: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallback;
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");

  const today = new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = isoDate(queryParam(req, "from"), fromDefault);
  const to = isoDate(queryParam(req, "to"), today);

  const report = await loadExpenseReport(actor.organisationId, { from, to });
  res.status(200).json({ ...report, dataSource: "reports.expenses" });
}
