import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { createBeatPlan, listBeatPlans } from "../../../modules/field-ops/repository.js";
import { isBeatDueOn } from "../../../modules/field-ops/calc.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

let counter = 0;
function beatId(): string {
  counter += 1;
  return `beat_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * GET /api/v1/beat-plans[?dueToday=1] — recurring outlet schedules. Reps
 * (route:plan absent) see their own; planners see all. `dueToday` filters to
 * beats scheduled for today's weekday.
 */
export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const isPlanner = actor.permissions.includes("route:plan");
  const isRep = actor.permissions.includes("order:create") || actor.permissions.includes("visit:write");
  if (!isPlanner && !isRep) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "route:plan");
    return;
  }

  const rows = isPlanner
    ? await listBeatPlans(actor.organisationId)
    : await listBeatPlans(actor.organisationId, actor.userId);

  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  const dueToday = url.searchParams.get("dueToday") === "1";
  const weekday = new Date().getDay();
  const filtered = dueToday ? rows.filter((b) => isBeatDueOn(b.weekdays, weekday)) : rows;

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "beat_plan",
    items: filtered.map((b) => ({ id: b.id, repUserId: b.rep_user_id, outletId: b.outlet_id, weekdays: b.weekdays, active: b.active }))
  });
}

/** POST /api/v1/beat-plans — a planner defines a recurring beat. */
export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "route:plan");

  const body = (req.body as Record<string, unknown>) ?? {};
  const repUserId = typeof body.repUserId === "string" ? body.repUserId : "";
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const weekdays = typeof body.weekdays === "string" && body.weekdays ? body.weekdays : "1,2,3,4,5";
  if (!repUserId || !outletId) {
    res.status(400).json({ code: "validation_error", message: "repUserId and outletId are required" });
    return;
  }
  const id = beatId();
  await createBeatPlan({ id, organisationId: actor.organisationId, repUserId, outletId, weekdays });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "beat_plan.created",
    targetType: "beat_plan",
    targetId: id,
    metadata: { repUserId, outletId, weekdays }
  });
  res.status(201).json({ id, repUserId, outletId, weekdays });
}
