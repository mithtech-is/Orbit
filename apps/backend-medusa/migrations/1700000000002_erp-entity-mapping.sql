-- Up Migration
-- ERP integration mapping table (ERPNext and future ERP providers).
-- Matches src/db/schema.sql; safe to re-run.
CREATE TABLE IF NOT EXISTS erp_entity_mapping (
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'erpnext',
  entity_type text NOT NULL,
  local_id text NOT NULL,
  erp_id text NOT NULL,
  hash text,
  direction text NOT NULL DEFAULT 'push',
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, provider, entity_type, local_id)
);

CREATE INDEX IF NOT EXISTS erp_entity_mapping_erp_idx
  ON erp_entity_mapping (organisation_id, provider, entity_type, erp_id);

-- Down Migration
DROP TABLE IF EXISTS erp_entity_mapping;
