import { getDatabasePool, queryRows } from "../db/client.js";
import type { ErpEntityType } from "./erp-provider.js";

/**
 * Persistence for Orbit<->ERP id mappings. One row per
 * (organisation, provider, entity_type, local_id). Used to:
 *   - make pushes idempotent (skip if hash unchanged),
 *   - resolve foreign references when building a Sales Order
 *     (outlet -> ERPNext Customer, product -> ERPNext Item).
 */

export interface ErpMappingRow {
  organisation_id: string;
  provider: string;
  entity_type: string;
  local_id: string;
  erp_id: string;
  hash: string | null;
  direction: string;
  last_synced_at: string;
}

export async function getErpMapping(
  organisationId: string,
  entityType: ErpEntityType,
  localId: string,
  provider = "erpnext"
): Promise<ErpMappingRow | undefined> {
  const rows = await queryRows<ErpMappingRow>(
    `SELECT organisation_id, provider, entity_type, local_id, erp_id, hash, direction, last_synced_at
     FROM erp_entity_mapping
     WHERE organisation_id = $1 AND provider = $2 AND entity_type = $3 AND local_id = $4`,
    [organisationId, provider, entityType, localId]
  );
  return rows[0];
}

/**
 * Reverse lookup: find the local mapping for an ERP-side id (e.g. a Frappe CRM
 * `CRM-LEAD-2026-00001`). Used by the inbound webhook to route a CRM change back
 * to the right Orbit record + organisation. ERP ids are globally unique per
 * doctype, so we don't need the organisation up front.
 */
export async function getErpMappingByErpId(
  entityType: ErpEntityType,
  erpId: string,
  provider = "erpnext"
): Promise<ErpMappingRow | undefined> {
  const rows = await queryRows<ErpMappingRow>(
    `SELECT organisation_id, provider, entity_type, local_id, erp_id, hash, direction, last_synced_at
     FROM erp_entity_mapping
     WHERE provider = $1 AND entity_type = $2 AND erp_id = $3
     LIMIT 1`,
    [provider, entityType, erpId]
  );
  return rows[0];
}

export async function saveErpMapping(input: {
  organisationId: string;
  entityType: ErpEntityType;
  localId: string;
  erpId: string;
  hash?: string | null;
  direction?: string;
  provider?: string;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO erp_entity_mapping
       (organisation_id, provider, entity_type, local_id, erp_id, hash, direction, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (organisation_id, provider, entity_type, local_id)
     DO UPDATE SET erp_id = EXCLUDED.erp_id,
                   hash = EXCLUDED.hash,
                   direction = EXCLUDED.direction,
                   last_synced_at = now()`,
    [
      input.organisationId,
      input.provider ?? "erpnext",
      input.entityType,
      input.localId,
      input.erpId,
      input.hash ?? null,
      input.direction ?? "push"
    ]
  );
}

/** Remove a mapping after the ERP-side record has been deleted. */
export async function deleteErpMapping(
  organisationId: string,
  entityType: ErpEntityType,
  localId: string,
  provider = "erpnext"
): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `DELETE FROM erp_entity_mapping
     WHERE organisation_id = $1 AND provider = $2 AND entity_type = $3 AND local_id = $4`,
    [organisationId, provider, entityType, localId]
  );
}

export async function countErpMappings(
  organisationId: string,
  provider = "erpnext"
): Promise<Record<string, number>> {
  const rows = await queryRows<{ entity_type: string; n: string }>(
    `SELECT entity_type, count(*)::text AS n
     FROM erp_entity_mapping
     WHERE organisation_id = $1 AND provider = $2
     GROUP BY entity_type`,
    [organisationId, provider]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.entity_type] = Number(r.n);
  return out;
}
