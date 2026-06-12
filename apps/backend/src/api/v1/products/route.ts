import { randomUUID } from "node:crypto";
import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { listProducts, insertProduct, updateProduct, upsertProductBySku } from "../../../modules/commerce/repository.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { syncProductToErp, pullProductsFromErp } from "../../../integrations/erp-sync.js";
import { getErpProvider } from "../../../integrations/erp-provider.js";
import { getErpMapping } from "../../../integrations/erp-mapping-repository.js";

async function erpEnabled(): Promise<boolean> {
  return getErpProvider().name !== "noop";
}

function productToJson(r: { id: string; organisation_id: string; sku: string; name: string; inventory_available: number; unit_price_cents: number }, erpId?: string) {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    sku: r.sku,
    name: r.name,
    inventoryAvailable: r.inventory_available,
    unitPriceCents: r.unit_price_cents,
    ...(erpId ? { erpId } : {})
  };
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:read");

  const body = (req.body as Record<string, unknown>) ?? {};
  const refresh = typeof req.headers["x-refresh"] === "string"
    ? req.headers["x-refresh"] === "true"
    : body.refresh === true;

  if (refresh && await erpEnabled()) {
    await pullProductsFromErp(actor.organisationId);
  }

  const rows = await listProducts(actor.organisationId);

  const items = [];
  for (const r of rows) {
    const mapping = await getErpMapping(actor.organisationId, "product", r.id);
    items.push(productToJson(r, mapping?.erp_id));
  }

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: refresh ? "erp_cached" : "field_product",
    items
  });
}

function parseProductBody(body: Record<string, unknown>, res: AppRouteResponse): { sku: string; name: string; inventoryAvailable: number; unitPriceCents: number } | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const inv = typeof body.inventoryAvailable === "number" ? body.inventoryAvailable : Number(body.inventoryAvailable);
  const price = typeof body.unitPriceCents === "number" ? body.unitPriceCents : Number(body.unitPriceCents);
  if (!name || !sku) { res.status(400).json({ code: "validation_error", message: "name and sku are required" }); return null; }
  if (!Number.isFinite(inv) || inv < 0) { res.status(400).json({ code: "validation_error", message: "inventoryAvailable must be >= 0" }); return null; }
  if (!Number.isFinite(price) || price < 0) { res.status(400).json({ code: "validation_error", message: "unitPriceCents must be >= 0" }); return null; }
  return { sku, name, inventoryAvailable: inv, unitPriceCents: price };
}

export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const parsed = parseProductBody((req.body as Record<string, unknown>) ?? {}, res);
  if (!parsed) return;

  const id = `prod_${randomUUID().slice(0, 12)}`;
  let erpId: string | undefined;

  if (await erpEnabled()) {
    try {
      const mapping = await getErpProvider().pushProduct(
        { fieldProductId: id, sku: parsed.sku, name: parsed.name, unitPriceCents: parsed.unitPriceCents },
        { organisationId: actor.organisationId }
      );
      erpId = mapping.erpId;
      await upsertProductBySku({ id, organisationId: actor.organisationId, ...parsed });
    } catch {
      await insertProduct({ id, organisationId: actor.organisationId, ...parsed });
    }
  } else {
    try {
      await insertProduct({ id, organisationId: actor.organisationId, ...parsed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/duplicate|unique/i.test(msg)) { res.status(409).json({ code: "conflict", message: `A product with SKU "${parsed.sku}" already exists.` }); return; }
      throw err;
    }
  }

  await writeAuditLog({ organisationId: actor.organisationId, actorUserId: actor.userId, action: "product.created", targetType: "product", targetId: id, metadata: { sku: parsed.sku, name: parsed.name, erpId } });
  res.status(201).json({ id, organisationId: actor.organisationId, ...parsed, erpId });
}

export async function PUT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const body = (req.body as Record<string, unknown>) ?? {};
  const id = (req.headers["x-resource-id"] as string) ?? (body.id as string);
  if (!id) { res.status(400).json({ code: "validation_error", message: "id is required" }); return; }

  const parsed = parseProductBody(body, res);
  if (!parsed) return;

  let erpId: string | undefined;

  if (await erpEnabled()) {
    try {
      const mapping = await getErpProvider().pushProduct(
        { fieldProductId: id, sku: parsed.sku, name: parsed.name, unitPriceCents: parsed.unitPriceCents },
        { organisationId: actor.organisationId }
      );
      erpId = mapping.erpId;
    } catch {
    }
  }

  const ok = await updateProduct({ id, organisationId: actor.organisationId, ...parsed });
  if (!ok) { res.status(404).json({ code: "not_found", message: "Product not found" }); return; }
  await writeAuditLog({ organisationId: actor.organisationId, actorUserId: actor.userId, action: "product.updated", targetType: "product", targetId: id, metadata: { sku: parsed.sku, stock: parsed.inventoryAvailable, erpId } });
  res.status(200).json({ id, organisationId: actor.organisationId, ...parsed, erpId });
}
