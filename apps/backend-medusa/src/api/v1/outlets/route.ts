import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { createLeadAndOutletRepository, insertOutlet, updateOutlet, deleteOutlet } from "../../../modules/lead-and-outlet/repository.js";
import { listTenantOutlets } from "../../../modules/lead-and-outlet/query-service.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { syncOutletToErp } from "../../../integrations/erp-sync.js";

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:read");
  const items = await listTenantOutlets(createLeadAndOutletRepository(), actor.organisationId);

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "lead-and-outlet",
    items
  });
}

export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const body = req.body as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    res.status(400).json({ code: "validation_error", message: "name is required" });
    return;
  }
  if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
    res.status(400).json({ code: "validation_error", message: "latitude and longitude are required" });
    return;
  }

  const outlet = {
    id: (body.id as string) ?? `outlet_${Date.now()}`,
    organisationId: actor.organisationId,
    name: body.name as string,
    latitude: body.latitude as number,
    longitude: body.longitude as number
  };

  await insertOutlet(outlet);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "outlet.created",
    targetType: "outlet",
    targetId: outlet.id,
    metadata: { name: outlet.name, latitude: outlet.latitude, longitude: outlet.longitude }
  });

  // Best-effort mirror to ERP as a Customer. No-op when ERP is disabled.
  await syncOutletToErp(actor.organisationId, outlet.id);

  res.status(201).json(outlet);
}

function parseCsv(text: string): { rows: Array<Record<string, string>>; errors: string[] } {
  const errors: string[] = [];
  const rows: Array<Record<string, string>> = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows, errors: ["CSV is empty."] };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const required = ["name", "latitude", "longitude"];
  for (const r of required) {
    if (!header.includes(r)) errors.push(`Missing required column: ${r}`);
  }
  if (errors.length > 0) return { rows, errors };

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g);
    if (!cells) continue;
    const values = cells.map((c) =>
      c.replace(/,$/, "").trim().replace(/^"|"$/g, "").replace(/""/g, "\"")
    );
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
    rows.push(obj);
  }
  return { rows, errors };
}

export async function POST_IMPORT(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const body = (req.body as Record<string, unknown>) ?? {};
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    res.status(400).json({ code: "validation_error", message: "csv is required (text body with header row)." });
    return;
  }

  const { rows, errors: parseErrors } = parseCsv(csv);
  if (parseErrors.length > 0) {
    res.status(400).json({ code: "validation_error", message: parseErrors.join(" ") });
    return;
  }
  if (rows.length === 0) {
    res.status(400).json({ code: "validation_error", message: "CSV has no data rows." });
    return;
  }
  if (rows.length > 1000) {
    res.status(400).json({ code: "validation_error", message: "Maximum 1000 rows per import." });
    return;
  }

  const created: Array<{ id: string; name: string }> = [];
  const failed: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!row.name || row.name.trim().length === 0) {
      failed.push({ row: i + 2, reason: "name is empty" });
      continue;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      failed.push({ row: i + 2, reason: `invalid latitude "${row.latitude}"` });
      continue;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      failed.push({ row: i + 2, reason: `invalid longitude "${row.longitude}"` });
      continue;
    }
    const outlet = {
      id: `outlet_${Date.now()}_${i}`,
      organisationId: actor.organisationId,
      name: row.name.trim(),
      latitude: lat,
      longitude: lng
    };
    try {
      await insertOutlet(outlet);
      created.push({ id: outlet.id, name: outlet.name });
    } catch (err) {
      failed.push({ row: i + 2, reason: err instanceof Error ? err.message : "insert failed" });
    }
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "outlet.imported",
    targetType: "outlet",
    targetId: `import_${Date.now()}`,
    metadata: { createdCount: created.length, failedCount: failed.length }
  });

  res.status(200).json({
    createdCount: created.length,
    failedCount: failed.length,
    failures: failed.slice(0, 50)
  });
}

export async function PUT(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const body = req.body as Record<string, unknown>;
  const outletId = (req.headers["x-resource-id"] as string) ?? (body.id as string);

  if (!outletId || !body.name || typeof body.latitude !== "number" || typeof body.longitude !== "number") {
    res.status(400).json({ code: "validation_error", message: "id, name, latitude, and longitude are required" });
    return;
  }

  await updateOutlet({
    id: outletId,
    organisationId: actor.organisationId,
    name: body.name as string,
    latitude: body.latitude as number,
    longitude: body.longitude as number
  });
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "outlet.updated",
    targetType: "outlet",
    targetId: outletId,
    metadata: { name: body.name, latitude: body.latitude, longitude: body.longitude }
  });

  // Best-effort mirror to ERP as a Customer. No-op when ERP is disabled.
  await syncOutletToErp(actor.organisationId, outletId);

  res.status(200).json({ id: outletId, status: "updated" });
}

export async function DEL(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:write");

  const outletId = (req.headers["x-resource-id"] as string) ?? (req.body as Record<string, string> | undefined)?.id;

  if (!outletId) {
    res.status(400).json({ code: "validation_error", message: "id is required" });
    return;
  }

  await deleteOutlet(outletId, actor.organisationId);
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "outlet.deleted",
    targetType: "outlet",
    targetId: outletId
  });

  res.status(200).json({ id: outletId, status: "deleted" });
}
