-- Mobile drawn-signature pad: store the captured customer signature as an SVG
-- path string on the visit row (alongside the typed `signed_by` acknowledgement).
-- Mirrors db/ensure-feature-schema.ts (boot-time self-heal) for canonical/prod.

-- Up
ALTER TABLE visit ADD COLUMN IF NOT EXISTS signature_path text;
