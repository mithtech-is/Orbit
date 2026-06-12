import type { AppRouteRequest, AppRouteResponse } from "../../../types.js";
import { authenticateRequest } from "../../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../../auth/tenant-auth.js";
import { requireArea } from "../../../../auth/areas.js";
import {
  findMutationByKey,
  recordMutation,
  recordConflict,
  upsertDevice
} from "../../../../modules/sync/repository.js";
import { dispatchMutation } from "../../../../modules/sync/dispatch.js";
import { writeAuditLog } from "../../../../modules/audit-and-compliance/repository.js";

interface IncomingMutation {
  idempotencyKey?: unknown;
  type?: unknown;
  payload?: unknown;
}

/**
 * POST /api/v1/sync/push
 *
 * Body: {
 *   deviceId: string,
 *   platform?: string,
 *   appVersion?: string,
 *   mutations: Array<{ idempotencyKey: string, type: string, payload: object }>
 * }
 *
 * Idempotency: a mutation_record row is keyed by (organisation_id, idempotencyKey).
 * If a record already exists the prior result is returned without re-applying.
 * Conflicts produce a sync_conflict row for later review.
 */
export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  // Offline sync push carries field mutations (visits/orders/pings) — field-only.
  requireArea(actor, "field");
  // Sync mutations are always self-targeted; scope to the actor so reps pass the RBAC gate.
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "visit:write");

  const body = (req.body as Record<string, unknown>) ?? {};
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  const platform = typeof body.platform === "string" ? body.platform : "unknown";
  const appVersion = typeof body.appVersion === "string" ? body.appVersion : undefined;
  const mutations = Array.isArray(body.mutations) ? (body.mutations as IncomingMutation[]) : [];

  if (!deviceId) {
    res.status(400).json({ code: "validation_error", message: "deviceId is required" });
    return;
  }

  await upsertDevice({
    id: deviceId,
    organisationId: actor.organisationId,
    userId: actor.userId,
    platform,
    appVersion
  });

  const results: Array<{
    idempotencyKey: string;
    status: string;
    result?: Record<string, unknown>;
    error?: string;
    conflictReason?: string;
  }> = [];

  for (const raw of mutations) {
    const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : "";
    const type = typeof raw.type === "string" ? raw.type : "";
    const payload = (typeof raw.payload === "object" && raw.payload !== null
      ? (raw.payload as Record<string, unknown>)
      : {});

    if (!idempotencyKey || !type) {
      results.push({ idempotencyKey: idempotencyKey || "", status: "rejected", error: "idempotencyKey and type required" });
      continue;
    }

    const existing = await findMutationByKey(actor.organisationId, idempotencyKey);
    if (existing) {
      results.push({
        idempotencyKey,
        status: existing.status,
        result: existing.result ?? undefined,
        error: existing.error ?? undefined
      });
      continue;
    }

    const dispatch = await dispatchMutation(type, payload, {
      organisationId: actor.organisationId,
      userId: actor.userId
    });

    if (dispatch.status === "conflict") {
      await recordConflict({
        organisationId: actor.organisationId,
        idempotencyKey,
        mutationType: type,
        reason: dispatch.conflictReason ?? "unknown",
        clientPayload: payload,
        serverState: dispatch.serverState
      });
    }

    await recordMutation({
      organisationId: actor.organisationId,
      idempotencyKey,
      deviceId,
      userId: actor.userId,
      mutationType: type,
      payload,
      status: dispatch.status,
      result: dispatch.result,
      error: dispatch.error
    });

    await writeAuditLog({
      organisationId: actor.organisationId,
      actorUserId: actor.userId,
      action: `sync.mutation.${dispatch.status}`,
      targetType: "mutation_record",
      targetId: idempotencyKey,
      metadata: {
        mutationType: type,
        deviceId,
        conflictReason: dispatch.conflictReason,
        error: dispatch.error
      }
    });

    results.push({
      idempotencyKey,
      status: dispatch.status,
      result: dispatch.result,
      error: dispatch.error,
      conflictReason: dispatch.conflictReason
    });
  }

  res.status(200).json({
    organisationId: actor.organisationId,
    deviceId,
    received: mutations.length,
    results
  });
}
