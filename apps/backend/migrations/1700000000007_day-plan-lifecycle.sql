-- Phase 4: day plan lifecycle — per-stop planning fields.
-- Mirrors db/ensure-feature-schema.ts (boot-time self-heal).

-- Up
ALTER TABLE route_stop ADD COLUMN IF NOT EXISTS visit_type text;
ALTER TABLE route_stop ADD COLUMN IF NOT EXISTS objective text;
ALTER TABLE route_stop ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
