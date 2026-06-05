import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import {
  listTeams, createTeam, renameTeam, deleteTeam, addTeamMember, removeTeamMember
} from "../../../modules/team/repository.js";

/** GET /api/v1/teams — teams + their member user ids. */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");
  const items = await listTeams(actor.organisationId);
  res.status(200).json({ organisationId: actor.organisationId, dataSource: "team", items });
}

/** POST /api/v1/teams — create a team { name }. */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");
  const name = typeof (req.body as Record<string, unknown>)?.name === "string" ? ((req.body as Record<string, string>).name).trim() : "";
  if (!name) { res.status(400).json({ code: "validation_error", message: "name is required" }); return; }
  const team = await createTeam(actor.organisationId, name);
  await writeAuditLog({ organisationId: actor.organisationId, actorUserId: actor.userId, action: "team.created", targetType: "team", targetId: team.id, metadata: { name } });
  res.status(201).json(team);
}

/** PUT /api/v1/teams/:id — rename { name }. */
export async function PUT_TEAM(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");
  const teamId = (req.headers["x-resource-id"] as string) ?? "";
  const name = typeof (req.body as Record<string, unknown>)?.name === "string" ? ((req.body as Record<string, string>).name).trim() : "";
  if (!teamId || !name) { res.status(400).json({ code: "validation_error", message: "id and name are required" }); return; }
  const ok = await renameTeam(actor.organisationId, teamId, name);
  if (!ok) { res.status(404).json({ code: "not_found", message: "Team not found" }); return; }
  res.status(200).json({ id: teamId, name });
}

/** DELETE /api/v1/teams/:id. */
export async function DEL_TEAM(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");
  const teamId = (req.headers["x-resource-id"] as string) ?? "";
  if (!teamId) { res.status(400).json({ code: "validation_error", message: "id is required" }); return; }
  const ok = await deleteTeam(actor.organisationId, teamId);
  if (!ok) { res.status(404).json({ code: "not_found", message: "Team not found" }); return; }
  await writeAuditLog({ organisationId: actor.organisationId, actorUserId: actor.userId, action: "team.deleted", targetType: "team", targetId: teamId });
  res.status(200).json({ id: teamId, status: "deleted" });
}

/** POST /api/v1/teams/:id/members — add a member { userId }. */
export async function POST_MEMBER(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");
  const teamId = (req.headers["x-resource-id"] as string) ?? "";
  const userId = typeof (req.body as Record<string, unknown>)?.userId === "string" ? (req.body as Record<string, string>).userId : "";
  if (!teamId || !userId) { res.status(400).json({ code: "validation_error", message: "team id and userId are required" }); return; }
  const ok = await addTeamMember(actor.organisationId, teamId, userId);
  if (!ok) { res.status(400).json({ code: "validation_error", message: "Team or user not found in this organisation" }); return; }
  res.status(200).json({ teamId, userId, status: "added" });
}

/** DELETE /api/v1/teams/:id/members/:userId — remove a member. */
export async function DEL_MEMBER(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "team:manage");
  const teamId = (req.headers["x-resource-id"] as string) ?? "";
  const userId = (req.headers["x-resource-sub-id"] as string) ?? "";
  if (!teamId || !userId) { res.status(400).json({ code: "validation_error", message: "team id and userId are required" }); return; }
  await removeTeamMember(actor.organisationId, teamId, userId);
  res.status(200).json({ teamId, userId, status: "removed" });
}
