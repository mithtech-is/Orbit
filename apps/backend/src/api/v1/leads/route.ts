import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { createLeadAndOutletRepository, insertLead, updateLead, deleteLead, updateLeadStatusOwned } from "../../../modules/lead-and-outlet/repository.js";
import { listTenantLeads } from "../../../modules/lead-and-outlet/query-service.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { syncLeadToErp, deleteLeadFromErp } from "../../../integrations/erp-sync.js";

/** Coerce a request value into a valid coordinate, or null when absent/invalid. */
function coord(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "lead:read");
  const items = await listTenantLeads(createLeadAndOutletRepository(), actor.organisationId);

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "lead-and-outlet",
    items
  });
}

export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "lead:write");

  const body = req.body as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    res.status(400).json({ code: "validation_error", message: "name is required" });
    return;
  }

  const lead = {
    id: (body.id as string) ?? `lead_${Date.now()}`,
    organisationId: actor.organisationId,
    // outlet_id and assigned_user_id are nullable FKs — an empty string is not a
    // valid foreign key, so an unset value must be stored as NULL, not "".
    outletId: (body.outletId as string) || null,
    name: body.name as string,
    status: (body.status as string) ?? "new",
    priority: typeof body.priority === "number" ? body.priority : 1,
    assignedUserId: (body.assignedUserId as string) || null,
    latitude: coord(body.latitude, -90, 90),
    longitude: coord(body.longitude, -180, 180)
  };

  await insertLead(lead);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "lead.created",
    targetType: "lead",
    targetId: lead.id,
    metadata: { name: lead.name, status: lead.status, priority: lead.priority }
  });

  // Best-effort mirror to Frappe CRM as a CRM Lead. No-op when ERP is disabled.
  await syncLeadToErp(actor.organisationId, lead.id);

  res.status(201).json(lead);
}

export async function PUT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "lead:write");

  const body = req.body as Record<string, unknown>;
  const leadId = (req.headers["x-resource-id"] as string) ?? (body.id as string);

  if (!leadId || !body.name) {
    res.status(400).json({ code: "validation_error", message: "id and name are required" });
    return;
  }

  // Full edit (incl. reassigning the rep) is available to lead:write holders
  // (sales managers / ops / admins). Reps never reach this route — they get a
  // status-only path (see PATCH_STATUS) instead. Deleting is stricter (DEL).
  await updateLead({
    id: leadId,
    organisationId: actor.organisationId,
    // Nullable FKs — store NULL when unset rather than an invalid "" (see POST).
    outletId: (body.outletId as string) || null,
    name: body.name as string,
    status: (body.status as string) ?? "new",
    priority: typeof body.priority === "number" ? body.priority : 1,
    assignedUserId: (body.assignedUserId as string) || null,
    latitude: coord(body.latitude, -90, 90),
    longitude: coord(body.longitude, -180, 180)
  });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "lead.updated",
    targetType: "lead",
    targetId: leadId,
    metadata: { name: body.name, status: body.status, priority: body.priority }
  });

  // Best-effort mirror to Frappe CRM as a CRM Lead. No-op when ERP is disabled.
  await syncLeadToErp(actor.organisationId, leadId);

  res.status(200).json({ id: leadId, status: "updated" });
}

export async function DEL(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  // Deleting a lead is destructive — restrict to admins (team:manage). Users
  // with plain lead:write can edit but not delete.
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");

  const leadId = (req.headers["x-resource-id"] as string) ?? (req.body as Record<string, string> | undefined)?.id;

  if (!leadId) {
    res.status(400).json({ code: "validation_error", message: "id is required" });
    return;
  }

  // Propagate to the CRM first (mapping must still exist), then delete locally.
  await deleteLeadFromErp(actor.organisationId, leadId);
  await deleteLead(leadId, actor.organisationId);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "lead.deleted",
    targetType: "lead",
    targetId: leadId
  });

  res.status(200).json({ id: leadId, status: "deleted" });
}

const LEAD_STATUSES = new Set(["new", "contacted", "qualified", "in_progress", "nurture", "won", "lost"]);

/**
 * POST /api/v1/leads/:id/status  { status }
 *
 * Status-only update for a lead a rep OWNS. Reps have `lead:read` (not write),
 * so this is the only lead change they can make — it never touches the assignee
 * or any other field, and only succeeds for a lead assigned to the caller.
 */
export async function PATCH_STATUS(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "lead:read");

  const leadId = req.headers["x-resource-id"] as string;
  const body = req.body as Record<string, unknown>;
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";

  if (!leadId || !status) {
    res.status(400).json({ code: "validation_error", message: "id and status are required" });
    return;
  }
  if (!LEAD_STATUSES.has(status)) {
    res.status(400).json({ code: "validation_error", message: `status must be one of: ${[...LEAD_STATUSES].join(", ")}` });
    return;
  }

  const updated = await updateLeadStatusOwned(leadId, actor.organisationId, status, actor.userId);
  if (!updated) {
    // Either the lead doesn't exist in this tenant, or it isn't assigned to the
    // caller — reps can only move their own leads.
    res.status(404).json({ code: "not_found", message: "Lead not found or not assigned to you" });
    return;
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "lead.status_updated",
    targetType: "lead",
    targetId: leadId,
    metadata: { status }
  });

  // Best-effort mirror to Frappe CRM. No-op when ERP is disabled.
  await syncLeadToErp(actor.organisationId, leadId);

  res.status(200).json({ id: leadId, status });
}
