import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { queryRows, getDatabasePool } from "../../../db/client.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

interface SettingsRow {
  organisation_id: string;
  geofence_radius_meters: number;
  raw_location_retention_days: number;
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  currency: string;
  working_days: string;
  mileage_rate_per_km_cents: number;
  daily_fuel_limit_cents: number;
}

function toResponse(row: SettingsRow) {
  return {
    organisationId: row.organisation_id,
    geofenceRadiusMeters: row.geofence_radius_meters,
    rawLocationRetentionDays: row.raw_location_retention_days,
    workingHoursStart: row.working_hours_start,
    workingHoursEnd: row.working_hours_end,
    timezone: row.timezone,
    currency: row.currency,
    workingDays: row.working_days.split(",").map((d) => d.trim()).filter(Boolean),
    // Org-wide default fuel rate (₹/km in cents). Effective rate cascade is
    // rep override → vehicle type → THIS default.
    mileageRatePerKmCents: row.mileage_rate_per_km_cents ?? 0,
    // 0 = no daily cap.
    dailyFuelLimitCents: row.daily_fuel_limit_cents ?? 0
  };
}

async function ensureRow(organisationId: string): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO organisation_setting (organisation_id) VALUES ($1) ON CONFLICT (organisation_id) DO NOTHING`,
    [organisationId]
  );
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");

  await ensureRow(actor.organisationId);
  const rows = await queryRows<SettingsRow>(
    `SELECT organisation_id, geofence_radius_meters, raw_location_retention_days,
            working_hours_start, working_hours_end, timezone, currency, working_days,
            mileage_rate_per_km_cents, daily_fuel_limit_cents
     FROM organisation_setting WHERE organisation_id = $1`,
    [actor.organisationId]
  );
  res.status(200).json(toResponse(rows[0]));
}

const TIME_REGEX = /^[0-2]\d:[0-5]\d$/;
const ALLOWED_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export async function PUT(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "organisation:manage");

  const body = (req.body as Record<string, unknown>) ?? {};

  const updates: string[] = [];
  const params: unknown[] = [actor.organisationId];

  function addUpdate(column: string, value: unknown) {
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  }

  if (body.geofenceRadiusMeters !== undefined) {
    const n = Number(body.geofenceRadiusMeters);
    if (!Number.isFinite(n) || n < 10 || n > 5000) {
      res.status(400).json({ code: "validation_error", message: "geofenceRadiusMeters must be between 10 and 5000." });
      return;
    }
    addUpdate("geofence_radius_meters", n);
  }
  if (body.rawLocationRetentionDays !== undefined) {
    const n = Number(body.rawLocationRetentionDays);
    if (!Number.isFinite(n) || n < 7 || n > 730) {
      res.status(400).json({ code: "validation_error", message: "rawLocationRetentionDays must be between 7 and 730." });
      return;
    }
    addUpdate("raw_location_retention_days", n);
  }
  if (body.workingHoursStart !== undefined) {
    const s = String(body.workingHoursStart);
    if (!TIME_REGEX.test(s)) { res.status(400).json({ code: "validation_error", message: "workingHoursStart must be HH:MM." }); return; }
    addUpdate("working_hours_start", s);
  }
  if (body.workingHoursEnd !== undefined) {
    const s = String(body.workingHoursEnd);
    if (!TIME_REGEX.test(s)) { res.status(400).json({ code: "validation_error", message: "workingHoursEnd must be HH:MM." }); return; }
    addUpdate("working_hours_end", s);
  }
  if (body.timezone !== undefined) {
    const s = String(body.timezone).trim();
    if (s.length === 0 || s.length > 64) { res.status(400).json({ code: "validation_error", message: "timezone is required (e.g. Asia/Kolkata)." }); return; }
    addUpdate("timezone", s);
  }
  if (body.currency !== undefined) {
    const s = String(body.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(s)) { res.status(400).json({ code: "validation_error", message: "currency must be a 3-letter ISO code (e.g. USD, INR)." }); return; }
    addUpdate("currency", s);
  }
  if (body.workingDays !== undefined) {
    const arr = Array.isArray(body.workingDays) ? body.workingDays.map(String) : [];
    if (arr.length === 0) { res.status(400).json({ code: "validation_error", message: "workingDays must include at least one day." }); return; }
    const clean = arr.map((d) => d.trim().toLowerCase());
    if (clean.some((d) => !ALLOWED_DAYS.has(d))) {
      res.status(400).json({ code: "validation_error", message: "workingDays values must be mon/tue/wed/thu/fri/sat/sun." });
      return;
    }
    addUpdate("working_days", clean.join(","));
  }
  if (body.mileageRatePerKmCents !== undefined) {
    const n = Number(body.mileageRatePerKmCents);
    if (!Number.isInteger(n) || n < 0 || n > 100_000) {
      res.status(400).json({ code: "validation_error", message: "mileageRatePerKmCents must be a non-negative integer (cents/km, max 100000)." });
      return;
    }
    addUpdate("mileage_rate_per_km_cents", n);
  }
  if (body.dailyFuelLimitCents !== undefined) {
    const n = Number(body.dailyFuelLimitCents);
    if (!Number.isInteger(n) || n < 0 || n > 100_000_000) {
      res.status(400).json({ code: "validation_error", message: "dailyFuelLimitCents must be a non-negative integer (cents, 0 = no limit)." });
      return;
    }
    addUpdate("daily_fuel_limit_cents", n);
  }

  if (updates.length === 0) {
    res.status(400).json({ code: "validation_error", message: "No fields to update." });
    return;
  }

  await ensureRow(actor.organisationId);
  await getDatabasePool().query(
    `UPDATE organisation_setting SET ${updates.join(", ")} WHERE organisation_id = $1`,
    params
  );

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "organisation_setting.updated",
    targetType: "organisation_setting",
    targetId: actor.organisationId,
    metadata: Object.fromEntries(updates.map((u, i) => [u.split(" = ")[0], params[i + 1]]))
  });

  const rows = await queryRows<SettingsRow>(
    `SELECT organisation_id, geofence_radius_meters, raw_location_retention_days,
            working_hours_start, working_hours_end, timezone, currency, working_days,
            mileage_rate_per_km_cents, daily_fuel_limit_cents
     FROM organisation_setting WHERE organisation_id = $1`,
    [actor.organisationId]
  );
  res.status(200).json(toResponse(rows[0]));
}
