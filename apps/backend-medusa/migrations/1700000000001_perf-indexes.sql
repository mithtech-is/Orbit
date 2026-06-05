-- Up Migration
-- Performance indexes from the 2026-05-29 scalability/performance audit.
-- See docs/engineering/performance-audit.md (findings C3, M3, H1).
-- All are IF NOT EXISTS so this is safe to re-run and matches src/db/schema.sql.

-- C3: three hot tables had no indexes -> seq scans + sorts.
CREATE INDEX IF NOT EXISTS field_product_tenant_idx        ON field_product (organisation_id);
CREATE INDEX IF NOT EXISTS field_order_tenant_created_idx   ON field_order   (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS field_order_rep_idx             ON field_order   (organisation_id, rep_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_user_idx           ON notification  (organisation_id, user_id, created_at DESC);

-- M3: /tracking/latest does DISTINCT ON (user_id) ORDER BY user_id, recorded_at DESC.
CREATE INDEX IF NOT EXISTS location_ping_user_idx          ON location_ping (organisation_id, user_id, recorded_at DESC);

-- H1: delta-sync pull filters/sorts on created_at for outlet + lead.
CREATE INDEX IF NOT EXISTS outlet_tenant_created_idx       ON outlet (organisation_id, created_at);
CREATE INDEX IF NOT EXISTS lead_tenant_created_idx         ON lead   (organisation_id, created_at);

-- Down Migration
DROP INDEX IF EXISTS field_product_tenant_idx;
DROP INDEX IF EXISTS field_order_tenant_created_idx;
DROP INDEX IF EXISTS field_order_rep_idx;
DROP INDEX IF EXISTS notification_user_idx;
DROP INDEX IF EXISTS location_ping_user_idx;
DROP INDEX IF EXISTS outlet_tenant_created_idx;
DROP INDEX IF EXISTS lead_tenant_created_idx;
