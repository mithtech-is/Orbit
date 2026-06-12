/**
 * Effective fuel rate (₹/km, stored as cents) resolution.
 *
 * Precedence (highest → lowest):
 *   1. Rep override            — app_user.fuel_rate_per_km_cents (per-individual)
 *   2. Rep's vehicle type      — vehicle_type.fuel_rate_per_km_cents (per-vehicle)
 *   3. Org-wide default        — organisation_setting.mileage_rate_per_km_cents
 *
 * NULL or 0 at a higher level falls through to the next. Returns 0 if no rate
 * is configured anywhere — callers MUST treat 0 as "no fuel expense should be
 * computed" rather than as a free trip.
 */

import { queryRows } from "../../db/client.js";

export interface ResolvedFuelRate {
  ratePerKmCents: number;
  /** Where the winning rate came from — useful for the rep-facing audit "why this rate?". */
  source: "rep_override" | "vehicle_type" | "org_default" | "none";
  /** Details so the UI can show "Bike @ ₹3.50/km" (or just the override). */
  vehicleTypeId: string | null;
  vehicleTypeName: string | null;
  /** Rep override raw value (cents) — useful for debugging when source≠rep_override. */
  repOverrideCents: number | null;
}

interface RateRow {
  rep_override: number | null;
  vehicle_id: string | null;
  vehicle_name: string | null;
  vehicle_rate: number | null;
  org_default: number | null;
}

/**
 * Single-query resolver that joins app_user → vehicle_type → organisation_setting
 * so we make exactly one DB round-trip per session-stop.
 */
export async function resolveFuelRate(organisationId: string, userId: string): Promise<ResolvedFuelRate> {
  const rows = await queryRows<RateRow>(
    `SELECT u.fuel_rate_per_km_cents      AS rep_override,
            v.id                          AS vehicle_id,
            v.name                        AS vehicle_name,
            v.fuel_rate_per_km_cents      AS vehicle_rate,
            s.mileage_rate_per_km_cents   AS org_default
     FROM app_user u
     LEFT JOIN vehicle_type v ON v.id = u.vehicle_type_id AND v.organisation_id = u.organisation_id
     LEFT JOIN organisation_setting s ON s.organisation_id = u.organisation_id
     WHERE u.organisation_id = $1 AND u.id = $2`,
    [organisationId, userId]
  );

  const row = rows[0];
  if (!row) {
    return { ratePerKmCents: 0, source: "none", vehicleTypeId: null, vehicleTypeName: null, repOverrideCents: null };
  }

  // Treat 0 as "unset" at each level so an admin can intentionally null-out a
  // vehicle rate and fall through to the org default, without having to set
  // the column to NULL via raw SQL.
  if (row.rep_override !== null && row.rep_override > 0) {
    return {
      ratePerKmCents: row.rep_override,
      source: "rep_override",
      vehicleTypeId: row.vehicle_id,
      vehicleTypeName: row.vehicle_name,
      repOverrideCents: row.rep_override
    };
  }
  if (row.vehicle_rate !== null && row.vehicle_rate > 0) {
    return {
      ratePerKmCents: row.vehicle_rate,
      source: "vehicle_type",
      vehicleTypeId: row.vehicle_id,
      vehicleTypeName: row.vehicle_name,
      repOverrideCents: row.rep_override
    };
  }
  if (row.org_default !== null && row.org_default > 0) {
    return {
      ratePerKmCents: row.org_default,
      source: "org_default",
      vehicleTypeId: row.vehicle_id,
      vehicleTypeName: row.vehicle_name,
      repOverrideCents: row.rep_override
    };
  }
  return {
    ratePerKmCents: 0,
    source: "none",
    vehicleTypeId: row.vehicle_id,
    vehicleTypeName: row.vehicle_name,
    repOverrideCents: row.rep_override
  };
}
