import { randomBytes } from "node:crypto";
import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission, AuthorisationError } from "../../../auth/tenant-auth.js";
import { createUserWithPassword, getUserPermissions, signToken } from "../../../auth/auth-service.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { queryRows, getDatabasePool } from "../../../db/client.js";
import { syncSalesRepToErp } from "../../../integrations/erp-sync.js";

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  // The user *directory* (names/roles, for assigning leads/visits & showing who
  // owns what) is readable by anyone who manages leads or reports within the
  // tenant — not only full user-admins. Creating/editing users still needs
  // user:manage (see POST/PUT below).
  const canReadDirectory = ["user:manage", "team:manage", "lead:write", "report:read"]
    .some((p) => actor.permissions.includes(p as typeof actor.permissions[number]));
  if (actor.organisationId == null || !canReadDirectory) {
    throw new AuthorisationError();
  }

  const rows = await queryRows<{
    id: string;
    email: string;
    name: string;
    role: string;
    active: boolean;
    password_change_required: boolean;
    vehicle_type_id: string | null;
    fuel_rate_per_km_cents: number | null;
  }>(
    `SELECT id, email, name, role, active, password_change_required,
            vehicle_type_id, fuel_rate_per_km_cents
     FROM app_user
     WHERE organisation_id = $1
     ORDER BY name ASC`,
    [actor.organisationId]
  );

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "app_user",
    items: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      active: r.active,
      passwordChangeRequired: r.password_change_required,
      vehicleTypeId: r.vehicle_type_id,
      fuelRatePerKmCents: r.fuel_rate_per_km_cents
    }))
  });
}

export async function POST_IMPERSONATE(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "User id is required." });
    return;
  }
  if (id === actor.userId) {
    res.status(400).json({ code: "validation_error", message: "You cannot impersonate yourself." });
    return;
  }

  const rows = await queryRows<{ id: string; email: string; name: string; role: string; active: boolean }>(
    `SELECT id, email, name, role, active FROM app_user WHERE id = $1 AND organisation_id = $2`,
    [id, actor.organisationId]
  );
  if (rows.length === 0) {
    res.status(404).json({ code: "not_found", message: "User not found." });
    return;
  }
  const target = rows[0];
  if (!target.active) {
    res.status(400).json({ code: "validation_error", message: "Cannot impersonate a deactivated user." });
    return;
  }

  const permissions = await getUserPermissions(actor.organisationId, target.role);

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "user.impersonated",
    targetType: "app_user",
    targetId: target.id,
    metadata: { targetEmail: target.email, targetRole: target.role }
  });

  const token = signToken(
    {
      userId: target.id,
      organisationId: actor.organisationId,
      role: target.role,
      permissions
    },
    "1h"
  );

  res.status(200).json({
    token,
    userId: target.id,
    organisationId: actor.organisationId,
    name: target.name,
    email: target.email,
    role: target.role,
    permissions,
    impersonatedBy: { userId: actor.userId }
  });
}

export async function POST_RESET_PASSWORD(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "User id is required." });
    return;
  }

  const rows = await queryRows<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM app_user WHERE id = $1 AND organisation_id = $2 AND active = true`,
    [id, actor.organisationId]
  );
  if (rows.length === 0) {
    res.status(404).json({ code: "not_found", message: "User not found." });
    return;
  }
  const target = rows[0];

  const temporaryPassword = generateTemporaryPassword();
  const { hashPassword } = await import("../../../auth/auth-service.js");
  const hash = await hashPassword(temporaryPassword);
  await getDatabasePool().query(
    `UPDATE app_user SET password_hash = $1, password_change_required = true WHERE id = $2 AND organisation_id = $3`,
    [hash, id, actor.organisationId]
  );

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "user.password_reset",
    targetType: "app_user",
    targetId: id
  });

  res.status(200).json({
    id: target.id,
    email: target.email,
    name: target.name,
    temporaryPassword,
    passwordChangeRequired: true,
    message: "Password reset. Share the temporary password securely — the user must change it on next sign-in."
  });
}

/**
 * Admin sets a rep's vehicle assignment and/or fuel rate override. Both fields
 * are nullable: passing `null` clears the setting so the fuel-rate cascade
 * falls through to the next layer (vehicle → org default).
 */
export async function PUT_VEHICLE(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "User id is required." });
    return;
  }
  const body = (req.body ?? {}) as { vehicleTypeId?: unknown; fuelRatePerKmCents?: unknown };

  const updates: string[] = [];
  const params: unknown[] = [actor.organisationId, id];
  function add(col: string, val: unknown) { params.push(val); updates.push(`${col} = $${params.length}`); }

  if (body.vehicleTypeId !== undefined) {
    if (body.vehicleTypeId === null) {
      add("vehicle_type_id", null);
    } else {
      const v = String(body.vehicleTypeId);
      // Sanity-check the vehicle exists within this org.
      const exists = await queryRows<{ id: string }>(
        `SELECT id FROM vehicle_type WHERE organisation_id = $1 AND id = $2`,
        [actor.organisationId, v]
      );
      if (exists.length === 0) {
        res.status(400).json({ code: "validation_error", message: "vehicleTypeId does not exist in this organisation" });
        return;
      }
      add("vehicle_type_id", v);
    }
  }
  if (body.fuelRatePerKmCents !== undefined) {
    if (body.fuelRatePerKmCents === null) {
      add("fuel_rate_per_km_cents", null);
    } else {
      const n = Number(body.fuelRatePerKmCents);
      if (!Number.isInteger(n) || n < 0 || n > 100_000) {
        res.status(400).json({ code: "validation_error", message: "fuelRatePerKmCents must be 0-100000 (or null to clear)" });
        return;
      }
      add("fuel_rate_per_km_cents", n);
    }
  }
  if (updates.length === 0) {
    res.status(400).json({ code: "validation_error", message: "no fields to update" });
    return;
  }

  const result = await getDatabasePool().query(
    `UPDATE app_user SET ${updates.join(", ")} WHERE organisation_id = $1 AND id = $2 RETURNING id`,
    params
  );
  if (result.rowCount === 0) {
    res.status(404).json({ code: "not_found", message: "User not found." });
    return;
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "user.vehicle_updated",
    targetType: "app_user",
    targetId: id,
    metadata: {
      vehicleTypeId: body.vehicleTypeId === undefined ? "(unchanged)" : body.vehicleTypeId,
      fuelRatePerKmCents: body.fuelRatePerKmCents === undefined ? "(unchanged)" : body.fuelRatePerKmCents
    }
  });

  // Echo the updated user row.
  const rows = await queryRows<{ id: string; email: string; name: string; role: string; active: boolean; vehicle_type_id: string | null; fuel_rate_per_km_cents: number | null }>(
    `SELECT id, email, name, role, active, vehicle_type_id, fuel_rate_per_km_cents
     FROM app_user WHERE organisation_id = $1 AND id = $2`,
    [actor.organisationId, id]
  );
  const r = rows[0];
  res.status(200).json({
    id: r.id, email: r.email, name: r.name, role: r.role, active: r.active,
    vehicleTypeId: r.vehicle_type_id, fuelRatePerKmCents: r.fuel_rate_per_km_cents
  });
}

export async function DEL(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "User id is required." });
    return;
  }
  if (id === actor.userId) {
    res.status(400).json({ code: "validation_error", message: "You cannot deactivate yourself." });
    return;
  }

  const result = await getDatabasePool().query(
    `UPDATE app_user SET active = false WHERE id = $1 AND organisation_id = $2 RETURNING id`,
    [id, actor.organisationId]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ code: "not_found", message: "User not found." });
    return;
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "user.deactivated",
    targetType: "app_user",
    targetId: id
  });

  res.status(200).json({ id, status: "deactivated" });
}

const ROLE_ALLOWLIST = new Set([
  "organisation_admin",
  "sales_manager",
  "operations_user",
  "field_sales_representative",
  "readonly_analyst"
]);

function generateTemporaryPassword(): string {
  // 16 chars from a base-58-ish alphabet (no 0/O/l/1/I to avoid confusion).
  const alpha = "abcdefghjkmnopqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += alpha[bytes[i] % alpha.length];
  return out;
}

/**
 * POST /api/v1/users
 *
 * Organisation-admin only. Creates a user and returns a temporary password.
 * The invited user is flagged `password_change_required` and must reset on
 * first sign-in.
 *
 * Body:
 *   { email: string, name: string, role: string, temporaryPassword?: string }
 *
 * If `temporaryPassword` is omitted, the server generates one and returns it
 * in the response so an admin can hand it over via a private channel.
 */
export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const body = (req.body as Record<string, unknown>) ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  const supplied = typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";

  if (!email || !email.includes("@")) {
    res.status(400).json({ code: "validation_error", message: "A valid email is required." });
    return;
  }
  if (!name) {
    res.status(400).json({ code: "validation_error", message: "Name is required." });
    return;
  }
  if (!ROLE_ALLOWLIST.has(role)) {
    res.status(400).json({
      code: "validation_error",
      message: `Role must be one of: ${[...ROLE_ALLOWLIST].join(", ")}`
    });
    return;
  }

  const temporaryPassword = supplied || generateTemporaryPassword();

  try {
    const result = await createUserWithPassword({
      organisationId: actor.organisationId,
      email,
      name,
      role,
      password: temporaryPassword,
      forcePasswordChange: true
    });

    await writeAuditLog({
      organisationId: actor.organisationId,
      actorUserId: actor.userId,
      action: "user.invited",
      targetType: "app_user",
      targetId: result.id,
      metadata: { email, role }
    });

    // Best-effort mirror to ERPNext as a Sales Person (sales-facing roles only).
    // No-op when ERP is disabled or the role isn't a rep.
    await syncSalesRepToErp(actor.organisationId, result.id);

    res.status(201).json({
      id: result.id,
      organisationId: actor.organisationId,
      email,
      name,
      role,
      temporaryPassword,
      passwordChangeRequired: true,
      message:
        "User created. Share the temporary password securely — they will be required to change it on first sign-in."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create user.";
    res.status(400).json({ code: "user_create_error", message });
  }
}

/**
 * POST /api/v1/users/me/password — change the current user's password.
 * Required after sign-in if `passwordChangeRequired` is true.
 */
export async function POST_CHANGE_PASSWORD(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const body = (req.body as Record<string, unknown>) ?? {};
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!next || next.length < 12) {
    res.status(400).json({ code: "validation_error", message: "New password must be at least 12 characters." });
    return;
  }
  if (/^(admin|password|changeme|fieldsales|routepilot)/i.test(next)) {
    res.status(400).json({ code: "validation_error", message: "Password is too predictable." });
    return;
  }

  const { hashPassword } = await import("../../../auth/auth-service.js");
  const { getDatabasePool } = await import("../../../db/client.js");
  const hash = await hashPassword(next);
  await getDatabasePool().query(
    `UPDATE app_user SET password_hash = $1, password_change_required = false
     WHERE id = $2 AND organisation_id = $3`,
    [hash, actor.userId, actor.organisationId]
  );

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "user.password_changed",
    targetType: "app_user",
    targetId: actor.userId
  });

  res.status(200).json({ ok: true });
}
