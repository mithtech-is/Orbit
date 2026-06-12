CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organisation (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisation_setting (
  organisation_id text PRIMARY KEY REFERENCES organisation(id) ON DELETE CASCADE,
  geofence_radius_meters integer NOT NULL DEFAULT 100,
  raw_location_retention_days integer NOT NULL DEFAULT 90,
  normal_tracking_distance_meters integer NOT NULL DEFAULT 100,
  active_visit_tracking_distance_meters integer NOT NULL DEFAULT 25,
  working_hours_start text NOT NULL DEFAULT '09:00',
  working_hours_end text NOT NULL DEFAULT '18:00',
  timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  working_days text NOT NULL DEFAULT 'mon,tue,wed,thu,fri'
);

ALTER TABLE organisation_setting ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE organisation_setting ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE organisation_setting ADD COLUMN IF NOT EXISTS working_days text NOT NULL DEFAULT 'mon,tue,wed,thu,fri';
ALTER TABLE organisation_setting ADD COLUMN IF NOT EXISTS mileage_rate_per_km_cents integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS app_user (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  password_hash text,
  active boolean NOT NULL DEFAULT true,
  password_change_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, email)
);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS role_permission (
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (organisation_id, role, permission)
);

CREATE TABLE IF NOT EXISTS team (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS team_member (
  team_id text NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS outlet (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name text NOT NULL,
  location geography(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outlet_organisation_idx ON outlet (organisation_id);
CREATE INDEX IF NOT EXISTS outlet_location_gix ON outlet USING gist (location);
-- Perf (audit H1): delta-sync pull filters/sorts on created_at.
CREATE INDEX IF NOT EXISTS outlet_tenant_created_idx ON outlet (organisation_id, created_at);

CREATE TABLE IF NOT EXISTS territory (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name text NOT NULL,
  boundary geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS territory_organisation_idx ON territory (organisation_id);
CREATE INDEX IF NOT EXISTS territory_boundary_gix ON territory USING gist (boundary);

CREATE TABLE IF NOT EXISTS lead (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  outlet_id text REFERENCES outlet(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL,
  priority integer NOT NULL DEFAULT 1,
  assigned_user_id text REFERENCES app_user(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_tenant_status_idx ON lead (organisation_id, status);
CREATE INDEX IF NOT EXISTS lead_assignee_idx ON lead (organisation_id, assigned_user_id);
-- Perf (audit H1): delta-sync pull filters/sorts on created_at.
CREATE INDEX IF NOT EXISTS lead_tenant_created_idx ON lead (organisation_id, created_at);

CREATE TABLE IF NOT EXISTS route_plan (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  assigned_user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  route_date date NOT NULL,
  status text NOT NULL,
  planned_distance_meters integer NOT NULL,
  planned_duration_minutes integer NOT NULL,
  provider text NOT NULL,
  provider_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE route_plan ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS route_plan_tenant_date_idx ON route_plan (organisation_id, route_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS route_stop (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  route_plan_id text NOT NULL REFERENCES route_plan(id) ON DELETE CASCADE,
  outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  stop_order integer NOT NULL,
  status text NOT NULL,
  expected_duration_minutes integer NOT NULL
);

CREATE INDEX IF NOT EXISTS route_stop_plan_idx ON route_stop (route_plan_id, stop_order);

CREATE TABLE IF NOT EXISTS visit (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  assigned_user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  status text NOT NULL,
  outcome text,
  notes text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  geofence_status text
);

CREATE INDEX IF NOT EXISTS visit_tenant_date_idx ON visit (organisation_id, visit_date, status);
CREATE INDEX IF NOT EXISTS visit_assignee_status_idx ON visit (organisation_id, assigned_user_id, status);

CREATE TABLE IF NOT EXISTS field_product (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  inventory_available integer NOT NULL,
  unit_price_cents integer NOT NULL
);

-- Perf (audit C3): product catalog + the FOR UPDATE order lookup filter by tenant.
CREATE INDEX IF NOT EXISTS field_product_tenant_idx ON field_product (organisation_id);
-- SKU is unique within an organisation (admin product CRUD relies on this).
CREATE UNIQUE INDEX IF NOT EXISTS field_product_org_sku_uniq ON field_product (organisation_id, sku);

CREATE TABLE IF NOT EXISTS field_order (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  rep_user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status text NOT NULL,
  source text NOT NULL,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Perf (audit C3): Orders list (manager: tenant+created_at; rep: tenant+rep+created_at).
CREATE INDEX IF NOT EXISTS field_order_tenant_created_idx ON field_order (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS field_order_rep_idx ON field_order (organisation_id, rep_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Perf (audit C3): per-user notification feed.
CREATE INDEX IF NOT EXISTS notification_user_idx ON notification (organisation_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  actor_user_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_time_idx ON audit_log (organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS consent_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  -- Reason a rep gave when turning location sharing OFF during working hours
  -- (the "exception" path). Surfaced to admins on the Users page.
  revoke_reason text,
  device_info jsonb DEFAULT '{}'
);

-- Additive for existing databases.
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS revoke_reason text;

CREATE INDEX IF NOT EXISTS consent_log_user_idx ON consent_log (organisation_id, user_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS work_session (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  consent_id text REFERENCES consent_log(id),
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  started_latitude double precision,
  started_longitude double precision
);

CREATE INDEX IF NOT EXISTS work_session_active_idx ON work_session (organisation_id, user_id, status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS location_ping (
  id text NOT NULL,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  work_session_id text NOT NULL REFERENCES work_session(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters double precision,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- PK includes recorded_at so it matches insertLocationPings'
  -- `ON CONFLICT (organisation_id, id, recorded_at)`. Migration 1700000000003
  -- additionally RANGE-partitions this table by recorded_at; this plain-table
  -- definition (used by the seed-demo bootstrap) must keep the same PK shape or
  -- every ping insert fails with "no unique constraint matching ON CONFLICT".
  PRIMARY KEY (organisation_id, id, recorded_at)
);

CREATE INDEX IF NOT EXISTS location_ping_session_idx ON location_ping (organisation_id, work_session_id, recorded_at DESC);
-- Perf (audit M3): /tracking/latest does DISTINCT ON (user_id) ORDER BY user_id, recorded_at DESC.
CREATE INDEX IF NOT EXISTS location_ping_user_idx ON location_ping (organisation_id, user_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS device_registration (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  platform text NOT NULL,
  app_version text,
  push_token text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_registration_user_idx ON device_registration (organisation_id, user_id);

CREATE TABLE IF NOT EXISTS sync_cursor (
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES device_registration(id) ON DELETE CASCADE,
  resource text NOT NULL,
  cursor text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, device_id, resource)
);

CREATE TABLE IF NOT EXISTS mutation_record (
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  device_id text REFERENCES device_registration(id) ON DELETE SET NULL,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  mutation_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL,
  result jsonb,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (organisation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS mutation_record_user_idx ON mutation_record (organisation_id, user_id, received_at DESC);

CREATE TABLE IF NOT EXISTS sync_conflict (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  mutation_type text NOT NULL,
  reason text NOT NULL,
  client_payload jsonb NOT NULL DEFAULT '{}',
  server_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_conflict_tenant_time_idx ON sync_conflict (organisation_id, created_at DESC);

-- ERP integration: maps a Orbit record to its counterpart in an external
-- ERP (ERPNext today). `hash` is a payload fingerprint so we skip no-op updates.
-- PK keeps one mapping per (tenant, provider, entity_type, local_id) — idempotent
-- upserts even if the same outlet/order is pushed many times.
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

-- ===========================================================================
-- Notifications (Phase 2): richer body/data/read_at on the existing feed table.
-- ===========================================================================
ALTER TABLE notification ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE notification ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE notification ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- ===========================================================================
-- Uploads / visit attachments (Phase 4). The bytes live in object storage; this
-- row is the metadata + storage key. `visit_id` is nullable so the same table
-- can hold other attachment kinds later (outlet KYC, order proof).
-- ===========================================================================
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

-- ===========================================================================
-- Password reset tokens (Phase 3). We store only a SHA-256 hash of the token so
-- a DB leak can't be used to reset accounts. Single-use (used_at) + expiry.
-- ===========================================================================
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

-- ===========================================================================
-- Phase 7 — commerce & field ops
-- ===========================================================================

-- Payment collection against orders / outlets. Outstanding = sum(orders) - sum(payments).
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

-- Recurring beat plans (PJP): which outlets a rep should visit, on which weekdays.
-- weekdays is a comma list of 0-6 (0=Sun) e.g. 'mon' encoded as integers '1,3,5'.
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

-- Geofenced attendance (one row per rep per day).
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

-- Offline survey / form builder. `definition` is the form schema (questions);
-- responses store the rep's answers as jsonb, syncable via the offline engine.
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

-- ===========================================================================
-- Phase 3 — richer visit capture (feedback/NPS, customer acknowledgement,
-- per-visit expenses, competitor intel, samples distributed).
-- ===========================================================================
ALTER TABLE visit ADD COLUMN IF NOT EXISTS feedback_rating integer;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS nps_score integer;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS feedback_text text;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS signed_by text;
ALTER TABLE visit ADD COLUMN IF NOT EXISTS signature_path text;

CREATE TABLE IF NOT EXISTS visit_expense (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount_cents integer NOT NULL,
  kms double precision,
  calculated_kms double precision,
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
