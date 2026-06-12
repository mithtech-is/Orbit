-- Up Migration
-- Phase 7 commerce & field-ops tables. Idempotent (mirrors schema.sql).

CREATE TABLE IF NOT EXISTS payment (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  order_id text REFERENCES field_order(id) ON DELETE SET NULL,
  collected_by text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_outlet_idx ON payment (organisation_id, outlet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS beat_plan (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  rep_user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  weekdays text NOT NULL DEFAULT '1,2,3,4,5',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beat_plan_rep_idx ON beat_plan (organisation_id, rep_user_id, active);

CREATE TABLE IF NOT EXISTS attendance (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL DEFAULT 'present',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  note text,
  UNIQUE (organisation_id, user_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (organisation_id, attendance_date);

CREATE TABLE IF NOT EXISTS survey (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_tenant_idx ON survey (organisation_id, active);

CREATE TABLE IF NOT EXISTS survey_response (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  survey_id text NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
  submitted_by text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  outlet_id text REFERENCES outlet(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_response_idx ON survey_response (organisation_id, survey_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS survey_response;
DROP TABLE IF EXISTS survey;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS beat_plan;
DROP TABLE IF EXISTS payment;
