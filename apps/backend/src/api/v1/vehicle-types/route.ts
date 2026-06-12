/**
 * /api/v1/vehicle-types — admin CRUD for vehicle types (bike/car/etc. + ₹/km).
 * Used by the per-rep vehicle assignment + the daily fuel rate cascade.
 */

import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { queryRows } from "../../../db/client.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

interface VehicleTypeRow {
  id: string;
  organisation_id: string;
  name: string;
  fuel_rate_per_km_cents: number;
  active: boolean;
  created_at: string;
}

function toResponse(r: VehicleTypeRow) {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    name: r.name,
    fuelRatePerKmCents: r.fuel_rate_per_km_cents,
    active: r.active,
    createdAt: r.created_at
  };
}

function resourceId(req: AppRouteRequest): string {
  return typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  // Reps need to know their own vehicle/rate context (mobile shows "Bike @ ₹4/km"),
  // but they don't need to mutate. outlet:read is held by both reps and admins,
  // making it the right "everyone in the org" gate here.
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "outlet:read");

  const rows = await queryRows<VehicleTypeRow>(
    `SELECT id, organisation_id, name, fuel_rate_per_km_cents, active, created_at
     FROM vehicle_type WHERE organisation_id = $1 ORDER BY active DESC, name ASC`,
    [actor.organisationId]
  );
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "vehicle_type",
    items: rows.map(toResponse)
  });
}

export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");

  const body = (req.body ?? {}) as { name?: unknown; fuelRatePerKmCents?: unknown; active?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rate = Number(body.fuelRatePerKmCents);
  const active = body.active === undefined ? true : Boolean(body.active);
  if (name.length === 0 || name.length > 64) {
    res.status(400).json({ code: "validation_error", message: "name is required (1-64 chars)" });
    return;
  }
  if (!Number.isInteger(rate) || rate < 0 || rate > 100_000) {
    res.status(400).json({ code: "validation_error", message: "fuelRatePerKmCents must be 0-100000" });
    return;
  }

  const id = `veh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await queryRows(
      `INSERT INTO vehicle_type (id, organisation_id, name, fuel_rate_per_km_cents, active)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, actor.organisationId, name, rate, active]
    );
  } catch (err) {
    // UNIQUE (organisation_id, name) collision.
    if (err instanceof Error && err.message.includes("vehicle_type")) {
      res.status(409).json({ code: "duplicate_name", message: `A vehicle type named "${name}" already exists.` });
      return;
    }
    throw err;
  }
  const rows = await queryRows<VehicleTypeRow>(
    `SELECT id, organisation_id, name, fuel_rate_per_km_cents, active, created_at
     FROM vehicle_type WHERE id = $1`,
    [id]
  );
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "vehicle_type.created",
    targetType: "vehicle_type",
    targetId: id,
    metadata: { name, fuelRatePerKmCents: rate, active }
  });
  res.status(201).json(toResponse(rows[0]));
}

export async function PUT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");

  const id = resourceId(req);
  const body = (req.body ?? {}) as { name?: unknown; fuelRatePerKmCents?: unknown; active?: unknown };

  const updates: string[] = [];
  const params: unknown[] = [actor.organisationId, id];
  function add(col: string, val: unknown) { params.push(val); updates.push(`${col} = $${params.length}`); }

  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (n.length === 0 || n.length > 64) {
      res.status(400).json({ code: "validation_error", message: "name 1-64 chars" });
      return;
    }
    add("name", n);
  }
  if (body.fuelRatePerKmCents !== undefined) {
    const r = Number(body.fuelRatePerKmCents);
    if (!Number.isInteger(r) || r < 0 || r > 100_000) {
      res.status(400).json({ code: "validation_error", message: "fuelRatePerKmCents must be 0-100000" });
      return;
    }
    add("fuel_rate_per_km_cents", r);
  }
  if (body.active !== undefined) add("active", Boolean(body.active));

  if (updates.length === 0) {
    res.status(400).json({ code: "validation_error", message: "no fields to update" });
    return;
  }

  await queryRows(
    `UPDATE vehicle_type SET ${updates.join(", ")} WHERE organisation_id = $1 AND id = $2`,
    params
  );
  const rows = await queryRows<VehicleTypeRow>(
    `SELECT id, organisation_id, name, fuel_rate_per_km_cents, active, created_at
     FROM vehicle_type WHERE organisation_id = $1 AND id = $2`,
    [actor.organisationId, id]
  );
  if (!rows[0]) {
    res.status(404).json({ code: "not_found", message: "vehicle type not found" });
    return;
  }
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "vehicle_type.updated",
    targetType: "vehicle_type",
    targetId: id
  });
  res.status(200).json(toResponse(rows[0]));
}

export async function DEL(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");

  const id = resourceId(req);
  // Soft-delete by deactivating — preserves historical references and lets reps
  // assigned to it gracefully fall through to the org-default rate.
  await queryRows(
    `UPDATE vehicle_type SET active = false WHERE organisation_id = $1 AND id = $2`,
    [actor.organisationId, id]
  );
  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "vehicle_type.deactivated",
    targetType: "vehicle_type",
    targetId: id
  });
  res.status(204).json({});
}
