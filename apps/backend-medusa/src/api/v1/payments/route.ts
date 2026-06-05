import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { requireArea } from "../../../auth/areas.js";
import { recordPayment, outletLedger, listPayments } from "../../../modules/field-ops/repository.js";
import { outstandingCents } from "../../../modules/field-ops/calc.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { syncPaymentToErp } from "../../../integrations/erp-sync.js";

let counter = 0;
function paymentId(): string {
  counter += 1;
  return `pay_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** POST /api/v1/payments — a rep records a collection in the field. */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireArea(actor, "field");
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "order:create");

  const body = (req.body as Record<string, unknown>) ?? {};
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : Number(body.amountCents);
  const method = typeof body.method === "string" ? body.method : "cash";
  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

  if (!outletId || !Number.isFinite(amountCents) || amountCents <= 0) {
    res.status(400).json({ code: "validation_error", message: "outletId and a positive amountCents are required" });
    return;
  }

  const id = paymentId();
  await recordPayment({ id, organisationId: actor.organisationId, outletId, orderId, collectedBy: actor.userId, amountCents, method, note });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "payment.collected",
    targetType: "payment",
    targetId: id,
    metadata: { outletId, amountCents, method }
  });
  // Best-effort mirror to ERPNext as a draft Payment Entry. No-op when disabled.
  await syncPaymentToErp(actor.organisationId, id);
  res.status(201).json({ id, outletId, amountCents, method });
}

/** GET /api/v1/payments?outletId=... — ledger (ordered/paid/outstanding) + recent payments. */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  const canRead = actor.permissions.includes("report:read") || actor.permissions.includes("order:create");
  if (!canRead) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
    return;
  }
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  const outletId = url.searchParams.get("outletId") ?? "";
  if (!outletId) {
    res.status(400).json({ code: "validation_error", message: "outletId query param is required" });
    return;
  }
  const ledger = await outletLedger(actor.organisationId, outletId);
  const payments = await listPayments(actor.organisationId, outletId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "payment",
    outletId,
    orderedCents: ledger.orderedCents,
    paidCents: ledger.paidCents,
    outstandingCents: outstandingCents(ledger.orderedCents, ledger.paidCents),
    items: payments.map((p) => ({
      id: p.id, orderId: p.order_id, collectedBy: p.collected_by, amountCents: p.amount_cents, method: p.method, note: p.note, createdAt: p.created_at
    }))
  });
}
