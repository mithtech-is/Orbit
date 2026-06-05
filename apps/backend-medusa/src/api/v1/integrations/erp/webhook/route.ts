/**
 * Inbound ERP/CRM webhook — the CRM→app half of two-way lead sync.
 *
 * Frappe CRM is configured (Webhook doctype on the routepilot-crm instance) to
 * POST a CRM Lead's fields here on update. We reverse-map the CRM docname
 * (e.g. CRM-LEAD-2026-00001) to the local lead via erp_entity_mapping and apply
 * the CRM-owned fields (status, name) back to Orbit.
 *
 * Security: gated by a shared secret header (X-Orbit-Webhook-Secret ===
 * ERPNEXT_WEBHOOK_SECRET). Fail-closed — if the secret env is unset, every call
 * is rejected. This endpoint is intentionally UNAUTHENTICATED (no JWT) because
 * the caller is the CRM server, not a user.
 *
 * No echo loop: this handler writes straight to the lead repo and does NOT call
 * syncLeadToErp, so an inbound update never bounces back out to the CRM.
 */
import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../../types.js";
import { getErpMappingByErpId } from "../../../../../integrations/erp-mapping-repository.js";
import { updateLeadFromErp } from "../../../../../modules/lead-and-outlet/repository.js";
import { writeAuditLog } from "../../../../../modules/audit-and-compliance/repository.js";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST_WEBHOOK(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const expected = process.env.ERPNEXT_WEBHOOK_SECRET ?? "";
  if (!expected) {
    res.status(503).json({ code: "not_configured", message: "ERPNEXT_WEBHOOK_SECRET is not set." });
    return;
  }
  const provided = (req.headers["x-routepilot-webhook-secret"] as string) ?? "";
  if (!timingSafeEqual(provided, expected)) {
    res.status(401).json({ code: "unauthorized", message: "Invalid webhook secret." });
    return;
  }

  // Frappe sends the doc fields at the top level; tolerate a {data:{...}} wrap.
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const doc = (typeof raw.data === "object" && raw.data ? raw.data : raw) as Record<string, unknown>;

  const erpId = typeof doc.name === "string" ? doc.name : "";
  if (!erpId) {
    res.status(400).json({ code: "validation_error", message: "payload missing 'name' (CRM Lead id)." });
    return;
  }

  const mapping = await getErpMappingByErpId("lead", erpId);
  if (!mapping) {
    // Lead originated in the CRM (no Orbit mapping) — we can't resolve a
    // tenant/outlet for it here, so we acknowledge and ignore rather than guess.
    res.status(202).json({ applied: false, reason: "no mapping for this CRM Lead", erpId });
    return;
  }

  const crmStatus = typeof doc.status === "string" ? doc.status : undefined;
  const crmName =
    (typeof doc.lead_name === "string" && doc.lead_name) ||
    (typeof doc.first_name === "string" && doc.first_name) ||
    undefined;
  // CRM statuses (New, Contacted, Converted, …) → app's lowercase convention.
  const status = crmStatus ? crmStatus.trim().toLowerCase() : undefined;

  const applied = await updateLeadFromErp({
    id: mapping.local_id,
    organisationId: mapping.organisation_id,
    name: crmName,
    status
  });

  if (applied) {
    await writeAuditLog({
      organisationId: mapping.organisation_id,
      actorUserId: "erp-webhook",
      action: "lead.synced_from_crm",
      targetType: "lead",
      targetId: mapping.local_id,
      metadata: { erpId, status: status ?? null, name: crmName ?? null }
    });
  }

  res.status(200).json({ applied, leadId: mapping.local_id, erpId });
}
