import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { requireArea } from "../../../auth/areas.js";
import { checkInAttendance, checkOutAttendance, listAttendance } from "../../../modules/field-ops/repository.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

let counter = 0;
function attendanceId(): string {
  counter += 1;
  return `att_day_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** GET /api/v1/attendance?date=YYYY-MM-DD — manager view of who's present. */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  const date = url.searchParams.get("date") || todayStr();
  const rows = await listAttendance(actor.organisationId, date);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "attendance",
    date,
    items: rows.map((a) => ({
      userId: a.user_id,
      status: a.status,
      checkedInAt: a.checked_in_at,
      checkedOutAt: a.checked_out_at
    }))
  });
}

/** POST /api/v1/attendance — a rep marks their attendance. Body: { action: "check_in"|"check_out", latitude?, longitude? } */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireArea(actor, "field");
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "tracking:send");

  const body = (req.body as Record<string, unknown>) ?? {};
  const action = typeof body.action === "string" ? body.action : "check_in";
  const date = todayStr();

  if (action === "check_out") {
    const ok = await checkOutAttendance(actor.organisationId, actor.userId, date);
    res.status(ok ? 200 : 404).json(ok ? { status: "checked_out", date } : { code: "no_check_in", message: "No open check-in for today" });
    return;
  }

  const latitude = typeof body.latitude === "number" ? body.latitude : null;
  const longitude = typeof body.longitude === "number" ? body.longitude : null;
  const id = attendanceId();
  await checkInAttendance({ id, organisationId: actor.organisationId, userId: actor.userId, date, latitude, longitude });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "attendance.checked_in",
    targetType: "attendance",
    targetId: id,
    metadata: { date }
  });
  res.status(201).json({ status: "checked_in", date });
}
