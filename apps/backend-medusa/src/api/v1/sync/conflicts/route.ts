import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import { listConflicts, getConflict, deleteConflict, recordMutation } from "../../../../modules/sync/repository.js";
import { dispatchMutation } from "../../../../modules/sync/dispatch.js";
import { isConflictAction, appliesClientChange } from "../../../../modules/sync/conflict-resolution.js";
import { writeAuditLog } from "../../../../modules/audit-and-compliance/repository.js";

/**
 * GET /api/v1/sync/conflicts?limit=100
 *
 * Returns recent sync conflicts in the tenant for manager review. Gated by
 * `audit:read` — viewing conflicts means viewing what reps tried to do, which
 * is privacy-sensitive.
 */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "audit:read");

  const url = typeof req.headers["x-request-url"] === "string" ? (req.headers["x-request-url"] as string) : "";
  const idx = url.indexOf("?");
  const params = idx >= 0 ? new URLSearchParams(url.slice(idx + 1)) : new URLSearchParams();
  const limit = params.get("limit") ? Number(params.get("limit")) : undefined;

  const rows = await listConflicts(actor.organisationId, limit);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "sync_conflict",
    items: rows.map((r) => ({
      id: r.id,
      organisationId: r.organisation_id,
      idempotencyKey: r.idempotency_key,
      mutationType: r.mutation_type,
      reason: r.reason,
      clientPayload: r.client_payload,
      serverState: r.server_state,
      createdAt: r.created_at
    }))
  });
}

/**
 * POST /api/v1/sync/conflicts/:id/resolve  { action: apply_client|apply_server|dismiss }
 *
 * apply_client re-runs the client's mutation (and records it on success);
 * apply_server / dismiss simply clear the conflict. Gated by `audit:read`
 * (managers/admins). If re-applying still conflicts, the conflict is preserved.
 */
export async function POST_RESOLVE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "audit:read");

  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  const body = (req.body as Record<string, unknown>) ?? {};
  const action = body.action;
  if (!id || !isConflictAction(action)) {
    res.status(400).json({ code: "validation_error", message: "action must be apply_client, apply_server or dismiss" });
    return;
  }

  const conflict = await getConflict(actor.organisationId, id);
  if (!conflict) {
    res.status(404).json({ code: "not_found", message: "Conflict not found (already resolved?)" });
    return;
  }

  let outcome = "cleared";
  if (appliesClientChange(action)) {
    const result = await dispatchMutation(conflict.mutation_type, conflict.client_payload, {
      organisationId: actor.organisationId,
      userId: actor.userId
    });
    if (result.status !== "applied") {
      res.status(409).json({
        code: "still_conflicting",
        message: `Re-applying the client change did not succeed (${result.status}).`,
        detail: result.conflictReason ?? result.error
      });
      return;
    }
    await recordMutation({
      organisationId: actor.organisationId,
      idempotencyKey: `resolve_${conflict.idempotency_key}`,
      deviceId: "manager-resolution",
      userId: actor.userId,
      mutationType: conflict.mutation_type,
      payload: conflict.client_payload,
      status: "applied",
      result: result.result,
      error: undefined
    });
    outcome = "applied";
  }

  await deleteConflict(actor.organisationId, id);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "sync.conflict.resolved",
    targetType: "sync_conflict",
    targetId: id,
    metadata: { action, mutationType: conflict.mutation_type, outcome }
  });

  res.status(200).json({ id, action, outcome });
}
