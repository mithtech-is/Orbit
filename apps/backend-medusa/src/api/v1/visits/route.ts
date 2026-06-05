import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { requireArea } from "../../../auth/areas.js";
import {
  createVisitRepository,
  checkInToVisit,
  checkOutFromVisit,
  readVisitExtras,
  hasOtherOpenVisit,
  getVisitGeofenceStatus,
  closeStalePriorDayVisits,
  cancelOpenVisit,
  scheduleVisit,
  VISIT_PAGE_DEFAULT,
  VISIT_PAGE_MAX
} from "../../../modules/visit/repository.js";
import { toVisitSummary } from "../../../modules/visit/query-service.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { dispatchNotification } from "../../../modules/notification/service.js";
import { listAttachmentsForVisit } from "../../../modules/attachment/repository.js";
import { getDatabasePool, queryRows } from "../../../db/client.js";
import { clampLimit } from "../../../http/pagination.js";
import { syncVisitOutcomeToErp } from "../../../integrations/erp-sync.js";
import { notifyManagers } from "../../../modules/notification/field-events.js";

export async function PUT(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  // Reassignment is a manager action; gate on team:manage which managers + admins have.
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");

  const visitId = typeof req.headers["x-resource-id"] === "string"
    ? (req.headers["x-resource-id"] as string)
    : "";
  if (!visitId) {
    res.status(400).json({ code: "validation_error", message: "Visit id is required." });
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const newAssigneeId = typeof body.assignedUserId === "string" ? body.assignedUserId.trim() : "";
  if (!newAssigneeId) {
    res.status(400).json({ code: "validation_error", message: "assignedUserId is required." });
    return;
  }

  const assigneeRows = await queryRows<{ id: string }>(
    `SELECT id FROM app_user WHERE id = $1 AND organisation_id = $2 AND active = true`,
    [newAssigneeId, actor.organisationId]
  );
  if (assigneeRows.length === 0) {
    res.status(400).json({ code: "validation_error", message: "Assignee not found in this organisation." });
    return;
  }

  const result = await getDatabasePool().query(
    `UPDATE visit SET assigned_user_id = $1 WHERE id = $2 AND organisation_id = $3 RETURNING assigned_user_id`,
    [newAssigneeId, visitId, actor.organisationId]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ code: "not_found", message: "Visit not found." });
    return;
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "visit.reassigned",
    targetType: "visit",
    targetId: visitId,
    metadata: { newAssigneeId }
  });

  // Notify the rep their queue changed (best-effort — never blocks the reassign).
  await dispatchNotification({
    organisationId: actor.organisationId,
    userId: newAssigneeId,
    type: "visit.assigned",
    title: "New visit assigned",
    body: "A visit was assigned to you. Open My Day to see it.",
    data: { visitId }
  });

  res.status(200).json({ id: visitId, assignedUserId: newAssigneeId, status: "reassigned" });
}

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  // Reps see only their own visits; managers/admins/ops see the full tenant set.
  // Permission gate: any role with `visit:write` can read (matches the RBAC
  // matrix where managers have "Review only" and reps have "Own visits").
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "visit:write");

  const repScopedUserId = actor.role === "field_sales_representative" ? actor.userId : undefined;
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  const limit = clampLimit(url.searchParams.get("limit"), VISIT_PAGE_DEFAULT, VISIT_PAGE_MAX);

  const { items: rows, hasMore } = await createVisitRepository().queryVisits(
    actor.organisationId,
    repScopedUserId,
    limit
  );
  const visits = rows.map(toVisitSummary);

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "visit",
    repScoped: Boolean(repScopedUserId),
    items: visits,
    limit,
    hasMore
  });
}

/** GET /api/v1/visits/:id/attachments — photos/files attached to a visit. */
export async function GET_ATTACHMENTS(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  const canView = actor.permissions.includes("visit:write") || actor.permissions.includes("report:read");
  if (!canView) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
    return;
  }
  const visitId = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!visitId) {
    res.status(400).json({ code: "validation_error", message: "visit id required" });
    return;
  }
  const rows = await listAttachmentsForVisit(actor.organisationId, visitId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "attachment",
    visitId,
    items: rows.map((a) => ({
      id: a.id,
      contentType: a.content_type,
      caption: a.caption,
      sizeBytes: a.size_bytes,
      url: `/api/v1/uploads/${a.id}`,
      createdAt: a.created_at
    }))
  });
}

/** POST /api/v1/visits/schedule — a manager pre-schedules a one-off visit for a rep. */
export async function POST_SCHEDULE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");

  const body = (req.body as Record<string, unknown>) ?? {};
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const assignedUserId = typeof body.assignedUserId === "string" ? body.assignedUserId : "";
  const visitDate = typeof body.visitDate === "string" && body.visitDate ? body.visitDate : new Date().toISOString().slice(0, 10);
  const objective = typeof body.objective === "string" ? body.objective : null;
  if (!outletId || !assignedUserId) {
    res.status(400).json({ code: "validation_error", message: "outletId and assignedUserId are required" });
    return;
  }

  const id = `visit_${Date.now()}`;
  await scheduleVisit({ id, organisationId: actor.organisationId, outletId, assignedUserId, visitDate, objective });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "visit.scheduled",
    targetType: "visit",
    targetId: id,
    metadata: { outletId, assignedUserId, visitDate }
  });
  await dispatchNotification({
    organisationId: actor.organisationId,
    userId: assignedUserId,
    type: "visit.assigned",
    title: "New visit scheduled",
    body: `A visit was scheduled for you on ${visitDate}.`,
    data: { visitId: id, outletId, visitDate }
  });

  res.status(201).json({ id, outletId, assignedUserId, visitDate, status: "planned" });
}

/** GET /api/v1/visits/:id/extras — richer-capture data (feedback, expenses, intel, samples). */
export async function GET_EXTRAS(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  const canView = actor.permissions.includes("visit:write") || actor.permissions.includes("report:read");
  if (!canView) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
    return;
  }
  const visitId = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!visitId) {
    res.status(400).json({ code: "validation_error", message: "visit id required" });
    return;
  }
  const [extras, attachments] = await Promise.all([
    readVisitExtras(visitId, actor.organisationId),
    listAttachmentsForVisit(actor.organisationId, visitId)
  ]);
  res.status(200).json({
    organisationId: actor.organisationId,
    visitId,
    ...extras,
    proofPhotos: attachments
      .filter((a) => a.category === "visit_proof_photo" && a.content_type.startsWith("image/"))
      .map((a) => ({
        id: a.id,
        contentType: a.content_type,
        caption: a.caption,
        sizeBytes: a.size_bytes,
        url: `/api/v1/uploads/${a.id}`,
        createdAt: a.created_at
      }))
  });
}

export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  // Visit check-in/out is a FIELD action — admins never do it.
  requireArea(actor, "field");
  // Visit POST is always rep-owned (check-in or check-out of OWN visit), so we
  // scope the record to actor.userId — that matches the RBAC matrix rule
  // "Reps can only see/write own visits".
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "visit:write");

  const body = (req.body as Record<string, unknown>) ?? {};
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "check_in") {
    return handleCheckIn(actor, body, res);
  }

  if (action === "check_out") {
    return handleCheckOut(actor, body, res);
  }

  if (action === "cancel") {
    return handleCancel(actor, body, res);
  }

  res.status(400).json({ code: "validation_error", message: "action must be 'check_in', 'check_out' or 'cancel'" });
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

async function handleCheckIn(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const outletId = readString(body.outletId);
  if (!outletId) {
    res.status(400).json({ code: "validation_error", message: "outletId is required" });
    return;
  }

  const latitude = readNumber(body.latitude);
  const longitude = readNumber(body.longitude);
  if (latitude === null || longitude === null) {
    res.status(400).json({ code: "validation_error", message: "valid latitude and longitude are required" });
    return;
  }

  const geofenceMeters = readNumber(body.geofenceRadiusMeters) ?? 100;
  const outletLat = readNumber(body.outletLatitude) ?? 0;
  const outletLng = readNumber(body.outletLongitude) ?? 0;

  const distanceFromOutlet = calculateDistance(latitude, longitude, outletLat, outletLng);
  const geofenceStatus = distanceFromOutlet <= geofenceMeters ? "within" : "exception";

  const visitId = readString(body.id) ?? `visit_${Date.now()}`;

  // Self-heal: abandon any open visit the rep left dangling on a PRIOR day so a
  // forgotten check-in can't permanently block today's work.
  await closeStalePriorDayVisits(actor.organisationId, actor.userId);

  // Concurrent check-in guard: one open visit per rep.
  if (await hasOtherOpenVisit(actor.organisationId, actor.userId, visitId)) {
    res.status(409).json({ code: "open_visit_exists", message: "Finish your current visit before checking in elsewhere." });
    return;
  }

  await checkInToVisit({
    id: visitId,
    organisationId: actor.organisationId,
    outletId,
    assignedUserId: actor.userId,
    latitude,
    longitude,
    geofenceStatus
  });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "visit.checked_in",
    targetType: "visit",
    targetId: visitId,
    metadata: { outletId, geofenceStatus, distanceMeters: Math.round(distanceFromOutlet) }
  });

  if (geofenceStatus === "exception") {
    await notifyManagers(actor.organisationId, {
      type: "visit.off_target",
      title: "Off-target check-in",
      body: "A rep checked in outside the outlet geofence.",
      data: { visitId, repUserId: actor.userId, outletId }
    });
  }

  res.status(201).json({
    id: visitId,
    organisationId: actor.organisationId,
    outletId,
    assignedUserId: actor.userId,
    status: "in_progress",
    geofenceStatus,
    distanceFromOutletMeters: Math.round(distanceFromOutlet)
  });
}

async function handleCheckOut(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const visitId = readString(body.visitId);
  if (!visitId) {
    res.status(400).json({ code: "validation_error", message: "visitId is required" });
    return;
  }

  const latitude = readNumber(body.latitude);
  const longitude = readNumber(body.longitude);
  const outcome = readString(body.outcome) ?? "completed";
  const notes = readString(body.notes);

  // Off-target enforcement: an out-of-geofence visit requires an explanatory note.
  const geofence = await getVisitGeofenceStatus(visitId, actor.organisationId);
  if (geofence === "exception" && !notes) {
    res.status(400).json({ code: "off_target_note_required", message: "This check-in was off-target — a note explaining why is required." });
    return;
  }

  await checkOutFromVisit({
    id: visitId,
    organisationId: actor.organisationId,
    outcome,
    notes,
    latitude,
    longitude
  });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "visit.checked_out",
    targetType: "visit",
    targetId: visitId,
    metadata: { outcome }
  });

  // Best-effort: a sales/demo or service outcome creates an ERP Opportunity/Issue.
  await syncVisitOutcomeToErp(actor.organisationId, visitId);

  res.status(200).json({ id: visitId, status: "completed" });
}

async function handleCancel(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const visitId = readString(body.visitId) ?? readString(body.id);
  if (!visitId) {
    res.status(400).json({ code: "validation_error", message: "visitId is required" });
    return;
  }
  const cancelled = await cancelOpenVisit(visitId, actor.organisationId, actor.userId);
  if (!cancelled) {
    res.status(404).json({ code: "not_found", message: "No open visit to discard." });
    return;
  }
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "visit.cancelled",
    targetType: "visit",
    targetId: visitId,
    metadata: {}
  });
  res.status(200).json({ id: visitId, status: "no_show" });
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}
