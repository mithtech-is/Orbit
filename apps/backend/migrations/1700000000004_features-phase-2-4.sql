-- Up Migration
-- Phase 2-4 feature tables: notification body/data/read_at, attachments, and
-- single-use password reset tokens. All idempotent so it is safe on a DB that
-- was bootstrapped from schema.sql (which already contains these).

ALTER TABLE notification ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE notification ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE notification ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE TABLE IF NOT EXISTS attachment (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  uploaded_by text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  category text NOT NULL,
  visit_id text REFERENCES visit(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  caption text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachment_visit_idx ON attachment (organisation_id, visit_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_token (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_token_hash_idx ON password_reset_token (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_token_user_idx ON password_reset_token (organisation_id, user_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS password_reset_token;
DROP TABLE IF EXISTS attachment;
ALTER TABLE notification DROP COLUMN IF EXISTS read_at;
ALTER TABLE notification DROP COLUMN IF EXISTS data;
ALTER TABLE notification DROP COLUMN IF EXISTS body;
