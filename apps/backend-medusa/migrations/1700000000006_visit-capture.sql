-- Phase 3: richer visit capture — feedback/NPS, customer acknowledgement,
-- per-visit expenses, competitor intel, and samples distributed.
-- Mirrors db/ensure-feature-schema.ts (boot-time self-heal) for canonical/prod.

-- Up
ALTER TABLE visit ADD COLUMN IF NOT EXISTS feedback_rating integer;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS nps_score integer;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS feedback_text text;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS signed_by text;

CREATE TABLE IF NOT EXISTS visit_expense (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount_cents integer NOT NULL,
  kms double precision,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_expense_idx ON visit_expense (organisation_id, visit_id);

CREATE TABLE IF NOT EXISTS visit_competitor_intel (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  competitor_name text NOT NULL,
  product_name text,
  price_cents integer,
  promo text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_competitor_idx ON visit_competitor_intel (organisation_id, visit_id);

CREATE TABLE IF NOT EXISTS visit_sample (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity double precision NOT NULL DEFAULT 1,
  recipient_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_sample_idx ON visit_sample (organisation_id, visit_id);
