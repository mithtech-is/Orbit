import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import {
  createTerritoryRepository,
  insertTerritory,
  updateTerritory,
  deleteTerritory,
  queryOutletsInTerritory
} from "../../../modules/territory/repository.js";
import { listTenantTerritories } from "../../../modules/territory/query-service.js";
import { listTenantOutlets } from "../../../modules/lead-and-outlet/query-service.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "territory:manage");

  const items = await listTenantTerritories(createTerritoryRepository(), actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "territory",
    items
  });
}

export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "territory:manage");

  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const boundaryWkt = typeof body.boundaryWkt === "string" ? body.boundaryWkt.trim() : "";

  if (!name || !boundaryWkt) {
    res.status(400).json({ code: "validation_error", message: "name and boundaryWkt are required" });
    return;
  }

  const id = typeof body.id === "string" && body.id ? body.id : `territory_${Date.now()}`;
  await insertTerritory({
    id,
    organisationId: actor.organisationId,
    name,
    boundaryWkt
  });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "territory.created",
    targetType: "territory",
    targetId: id,
    metadata: { name }
  });

  res.status(201).json({ id, organisationId: actor.organisationId, name });
}

export async function PUT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "territory:manage");

  const body = req.body as Record<string, unknown>;
  const id = (req.headers["x-resource-id"] as string) ?? (typeof body.id === "string" ? body.id : "");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const boundaryWkt = typeof body.boundaryWkt === "string" ? body.boundaryWkt.trim() : "";

  if (!id || !name || !boundaryWkt) {
    res.status(400).json({ code: "validation_error", message: "id, name, and boundaryWkt are required" });
    return;
  }

  await updateTerritory({ id, organisationId: actor.organisationId, name, boundaryWkt });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "territory.updated",
    targetType: "territory",
    targetId: id,
    metadata: { name }
  });
  res.status(200).json({ id, status: "updated" });
}

export async function DEL(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "territory:manage");

  const id = (req.headers["x-resource-id"] as string) ?? (req.body as Record<string, string> | undefined)?.id;
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "id is required" });
    return;
  }

  await deleteTerritory(id, actor.organisationId);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "territory.deleted",
    targetType: "territory",
    targetId: id
  });
  res.status(200).json({ id, status: "deleted" });
}

/**
 * GET /api/v1/territories/:id/outlets — outlets whose location is inside the territory.
 * The resource id is forwarded via `x-resource-id` by `dev-server.ts`.
 */
export async function GET_OUTLETS(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:read");

  const territoryId = req.headers["x-resource-id"] as string | undefined;
  if (!territoryId) {
    res.status(400).json({ code: "validation_error", message: "territory id is required" });
    return;
  }

  const rows = await queryOutletsInTerritory(actor.organisationId, territoryId);
  const items = await listTenantOutlets({ queryOutlets: async () => rows }, actor.organisationId);

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "territory.contains",
    territoryId,
    items
  });
}
