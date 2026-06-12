-- Product SKU must be unique within an organisation so the admin product CRUD
-- (create/restock) can't introduce duplicate catalogue entries.
-- Mirrors db/ensure-feature-schema.ts (boot-time self-heal) for canonical/prod.

-- Up
CREATE UNIQUE INDEX IF NOT EXISTS field_product_org_sku_uniq ON field_product (organisation_id, sku);
