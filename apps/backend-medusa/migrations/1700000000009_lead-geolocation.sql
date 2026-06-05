-- Lead geolocation: an optional map pin (lat/lng) captured for a lead, separate
-- from the outlet's location so a lead can be placed before an outlet exists.
-- Mirrors db/ensure-feature-schema.ts (boot-time self-heal) for canonical/prod.

-- Up
ALTER TABLE lead ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS longitude double precision;
