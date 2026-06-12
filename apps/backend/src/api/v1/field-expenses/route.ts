/**
 * /api/v1/field-expenses — the daily auto-computed fuel expense surface.
 *
 *   GET   /api/v1/field-expenses        — list (manager: org-wide; rep: own only)
 *   PATCH .../:id/reason                — rep submits the deviation/over-limit reason
 *   PATCH .../:id/approve               — manager approves (re-syncs to ERPNext)
 *   PATCH .../:id/reject                — manager rejects with reason
 *
 * visit_expense (rep-entered toll/food/etc.) keeps its existing routes — the
 * approval columns on it are handled there.
 */

import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission, AuthorisationError } from "../../../auth/tenant-auth.js";
import {
  listFieldExpenses,
  getFieldExpense,
  submitExpenseReason,
  approveFieldExpense,
  rejectFieldExpense
} from "../../../modules/field-ops/expense-repository.js";
import { syncFieldExpenseToErp } from "../../../integrations/erp-sync.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

function queryParam(req: AppRouteRequest, key: string): string | null {
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  return url.searchParams.get(key);
}

function resourceId(req: AppRouteRequest): string {
  return typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
}

/** Two-tier scoping mirroring /visits + /field-orders. */
function decideScope(actor: { userId: string; permissions: string[] }): { canSeeAll: boolean; canSeeOwn: boolean } {
  const canSeeAll = actor.permissions.includes("report:read");
  const canSeeOwn = actor.permissions.includes("tracking:send");
  return { canSeeAll, canSeeOwn };
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const { canSeeAll, canSeeOwn } = decideScope(actor);
  if (!canSeeAll && !canSeeOwn) {
    throw new AuthorisationError("forbidden");
  }
  requireTenantPermission(actor, { organisationId: actor.organisationId }, canSeeAll ? "report:read" : "tracking:send");

  const status = queryParam(req, "status");
  const items = await listFieldExpenses({
    organisationId: actor.organisationId,
    repUserId: canSeeAll ? undefined : actor.userId,
    status: status === "pending" || status === "approved" || status === "rejected" ? status : undefined
  });

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "field_expense",
    repScoped: !canSeeAll,
    items
  });
}

/** Rep submits the "why I deviated / went over limit" reason. */
export async function PATCH_REASON(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "tracking:send");

  const id = resourceId(req);
  const body = (req.body ?? {}) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!id || reason.length < 5) {
    res.status(400).json({ code: "invalid_reason", message: "reason must be at least 5 characters" });
    return;
  }

  // A rep can only update their own expense — load + check ownership.
  const existing = await getFieldExpense(actor.organisationId, id);
  if (!existing) {
    res.status(404).json({ code: "not_found", message: "expense not found" });
    return;
  }
  if (existing.repUserId !== actor.userId) {
    throw new AuthorisationError("you can only submit a reason for your own expense");
  }
  if (existing.status !== "pending") {
    res.status(409).json({ code: "not_pending", message: "expense is no longer pending; reason cannot be changed" });
    return;
  }

  const updated = await submitExpenseReason(actor.organisationId, id, reason);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "field_expense.reason_submitted",
    targetType: "field_expense",
    targetId: id,
    metadata: { reason }
  });
  res.status(200).json(updated);
}

/** Manager approves a pending expense; re-syncs to ERPNext with status. */
export async function PATCH_APPROVE(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");

  const id = resourceId(req);
  if (!id) {
    res.status(400).json({ code: "invalid_request", message: "x-resource-id required" });
    return;
  }
  const existing = await getFieldExpense(actor.organisationId, id);
  if (!existing) {
    res.status(404).json({ code: "not_found", message: "expense not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ code: "not_pending", message: `expense is ${existing.status}` });
    return;
  }
  const updated = await approveFieldExpense(actor.organisationId, id, actor.userId);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "field_expense.approved",
    targetType: "field_expense",
    targetId: id
  });
  // Re-push so the ERPNext Expense Claim picks up the approval (status moves to
  // 'Approved' on the Frappe side; provider's hash-skip will only push when
  // something actually changed).
  void syncFieldExpenseToErp(actor.organisationId, id);
  res.status(200).json(updated);
}

/** Manager rejects with a reason. */
export async function PATCH_REJECT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");

  const id = resourceId(req);
  const body = (req.body ?? {}) as { rejectionReason?: unknown };
  const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
  if (!id || rejectionReason.length < 5) {
    res.status(400).json({ code: "invalid_request", message: "x-resource-id and rejectionReason (>=5 chars) required" });
    return;
  }
  const existing = await getFieldExpense(actor.organisationId, id);
  if (!existing) {
    res.status(404).json({ code: "not_found", message: "expense not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ code: "not_pending", message: `expense is ${existing.status}` });
    return;
  }
  const updated = await rejectFieldExpense(actor.organisationId, id, actor.userId, rejectionReason);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "field_expense.rejected",
    targetType: "field_expense",
    targetId: id,
    metadata: { rejectionReason }
  });
  res.status(200).json(updated);
}
