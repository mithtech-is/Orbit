import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { requireArea } from "../../../auth/areas.js";
import {
  listFieldOrders,
  listFieldOrdersForRep,
  getFieldOrder,
  updateFieldOrderStatus
} from "../../../modules/commerce/repository.js";
import { canTransition, isOrderStatus, allowedTransitions } from "../../../modules/commerce/order-status.js";
import { runCreateFieldOrderWorkflow } from "../../../workflows/commerce/create-field-order.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { syncFieldOrderToErp } from "../../../integrations/erp-sync.js";

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  // Two-tier read scoping (same pattern as /visits):
  //   - Anyone with report:read (manager / admin / ops / analyst) sees ALL orders
  //   - Anyone with order:create (reps) sees only their OWN orders
  //   - Anyone with neither permission → 403
  const canSeeAll = actor.permissions.includes("report:read");
  const canSeeOwn = actor.permissions.includes("order:create");
  if (!canSeeAll && !canSeeOwn) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
    return;
  }

  // Scope in SQL, not in JS: reps read only their own rows (field_order_rep_idx)
  // rather than loading the whole org and filtering — see performance-audit C4.
  const rows = canSeeAll
    ? await listFieldOrders(actor.organisationId)
    : await listFieldOrdersForRep(actor.organisationId, actor.userId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "field_order",
    repScoped: !canSeeAll,
    items: rows.map((r) => ({
      id: r.id,
      organisationId: r.organisation_id,
      outletId: r.outlet_id,
      repUserId: r.rep_user_id,
      status: r.status,
      source: r.source,
      totalCents: r.total_cents,
      createdAt: r.created_at
    }))
  });
}

export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  // Creating a field order is a FIELD action — admins never do it.
  requireArea(actor, "field");
  // Order creation is rep-owned (rep_user_id = actor.userId in the workflow).
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "order:create");

  const body = (req.body as Record<string, unknown>) ?? {};
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const sourceCandidate = typeof body.source === "string" ? body.source : "online";
  const source: "online" | "offline" | "sync" = sourceCandidate === "offline" || sourceCandidate === "sync" ? sourceCandidate : "online";
  const linesRaw = Array.isArray(body.lines) ? body.lines : [];
  const lines = linesRaw
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      const productId = typeof r.productId === "string" ? r.productId : "";
      const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity ?? 0);
      return { productId, quantity };
    })
    .filter((l) => l.productId && l.quantity > 0);

  if (!outletId || lines.length === 0) {
    res.status(400).json({
      code: "validation_error",
      message: "outletId and at least one positive-quantity line are required"
    });
    return;
  }

  const id = typeof body.id === "string" && body.id ? body.id : `order_${Date.now()}`;

  try {
    const result = await runCreateFieldOrderWorkflow(
      {
        id,
        organisationId: actor.organisationId,
        outletId,
        repUserId: actor.userId,
        source,
        lines
      },
      {
        emit: async (event) => {
          await writeAuditLog({
            organisationId: actor.organisationId,
            actorUserId: actor.userId,
            action: event.name,
            targetType: "field_order",
            targetId: id,
            metadata: event.data
          });
        }
      }
    );

    // Sync to ERPNext. For online orders, wait for the result and include the
    // ERP Sales Order id in the response. For offline orders, the sync is
    // best-effort (errors are logged, never block the local response).
    const erpOrderId = source === "online"
      ? await syncFieldOrderToErp(actor.organisationId, {
          fieldOrderId: id,
          outletId,
          repUserId: actor.userId,
          totalCents: result.totalCents,
          lines
        })
      : (syncFieldOrderToErp(actor.organisationId, {
          fieldOrderId: id,
          outletId,
          repUserId: actor.userId,
          totalCents: result.totalCents,
          lines
        }), undefined);

    res.status(201).json({
      id,
      organisationId: actor.organisationId,
      outletId,
      repUserId: actor.userId,
      source,
      status: result.status,
      totalCents: result.totalCents,
      ...(erpOrderId ? { erpOrderId } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "order failed";
    res.status(400).json({ code: "order_error", message });
  }
}

/**
 * PUT /api/v1/field-orders/:id — transition an order's status (fulfil / cancel).
 * Managers/admins (report:read) can transition any order; the owning rep
 * (order:create) can transition only their own. Invalid transitions are rejected
 * by the state machine in order-status.ts.
 */
export async function PUT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  const body = (req.body as Record<string, unknown>) ?? {};
  const nextStatus = typeof body.status === "string" ? body.status : "";

  if (!id || !isOrderStatus(nextStatus)) {
    res.status(400).json({ code: "validation_error", message: "A valid order id and target status are required" });
    return;
  }

  const order = await getFieldOrder(actor.organisationId, id);
  if (!order) {
    res.status(404).json({ code: "not_found", message: "Order not found" });
    return;
  }

  // Authorisation: managers (report:read) manage any order; reps manage own.
  const canManageAll = actor.permissions.includes("report:read");
  const ownsIt = actor.permissions.includes("order:create") && order.rep_user_id === actor.userId;
  if (!canManageAll && !ownsIt) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
    return;
  }

  if (!canTransition(order.status, nextStatus)) {
    res.status(409).json({
      code: "invalid_transition",
      message: `Cannot move an order from '${order.status}' to '${nextStatus}'.`,
      allowed: allowedTransitions(order.status)
    });
    return;
  }

  await updateFieldOrderStatus(actor.organisationId, id, nextStatus);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "field_order.status_changed",
    targetType: "field_order",
    targetId: id,
    metadata: { from: order.status, to: nextStatus }
  });

  res.status(200).json({ id, status: nextStatus, previousStatus: order.status });
}
