import { randomUUID } from "node:crypto";
import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { listProducts, insertProduct, updateProduct } from "../../../modules/commerce/repository.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { syncProductToErp } from "../../../integrations/erp-sync.js";

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:read");

  const rows = await listProducts(actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "field_product",
    items: rows.map((r) => ({
      id: r.id,
      organisationId: r.organisation_id,
      sku: r.sku,
      name: r.name,
      inventoryAvailable: r.inventory_available,
      unitPriceCents: r.unit_price_cents
    }))
  });
}

/** Parse + validate a product body. Returns null + writes a 400 on bad input. */
function parseProductBody(body: Record<string, unknown>, res: MedusaRouteResponse): { sku: string; name: string; inventoryAvailable: number; unitPriceCents: number } | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const inv = typeof body.inventoryAvailable === "number" ? body.inventoryAvailable : Number(body.inventoryAvailable);
  const price = typeof body.unitPriceCents === "number" ? body.unitPriceCents : Number(body.unitPriceCents);
  if (!name || !sku) { res.status(400).json({ code: "validation_error", message: "name and sku are required" }); return null; }
  if (!Number.isFinite(inv) || inv < 0) { res.status(400).json({ code: "validation_error", message: "inventoryAvailable must be >= 0" }); return null; }
  if (!Number.isFinite(price) || price < 0) { res.status(400).json({ code: "validation_error", message: "unitPriceCents must be >= 0" }); return null; }
  return { sku, name, inventoryAvailable: inv, unitPriceCents: price };
}

/** POST /api/v1/products — create a catalogue product (admin/ops: outlet:write). */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const parsed = parseProductBody((req.body as Record<string, unknown>) ?? {}, res);
  if (!parsed) return;

  const id = `prod_${randomUUID().slice(0, 12)}`;
  try {
    await insertProduct({ id, organisationId: actor.organisationId, ...parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/duplicate|unique/i.test(msg)) { res.status(409).json({ code: "conflict", message: `A product with SKU "${parsed.sku}" already exists.` }); return; }
    throw err;
  }
  await writeAuditLog({ organisationId: actor.organisationId, actorUserId: actor.userId, action: "product.created", targetType: "product", targetId: id, metadata: { sku: parsed.sku, name: parsed.name } });
  // Mirror the catalogue product to ERPNext as an Item (best-effort — never
  // blocks the local create; no-op when the ERP plugin is disabled).
  await syncProductToErp(actor.organisationId, id);
  res.status(201).json({ id, organisationId: actor.organisationId, ...parsed });
}

/** PUT /api/v1/products/:id — edit name/sku/price and set stock (restock). */
export async function PUT(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const body = (req.body as Record<string, unknown>) ?? {};
  const id = (req.headers["x-resource-id"] as string) ?? (body.id as string);
  if (!id) { res.status(400).json({ code: "validation_error", message: "id is required" }); return; }

  const parsed = parseProductBody(body, res);
  if (!parsed) return;

  const ok = await updateProduct({ id, organisationId: actor.organisationId, ...parsed });
  if (!ok) { res.status(404).json({ code: "not_found", message: "Product not found" }); return; }
  await writeAuditLog({ organisationId: actor.organisationId, actorUserId: actor.userId, action: "product.updated", targetType: "product", targetId: id, metadata: { sku: parsed.sku, stock: parsed.inventoryAvailable } });
  // Keep the ERPNext Item in sync on edits/restock (best-effort, no-op if disabled).
  await syncProductToErp(actor.organisationId, id);
  res.status(200).json({ id, organisationId: actor.organisationId, ...parsed });
}
