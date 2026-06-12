-- Pilot baseline schema.
-- Apply with: pnpm migrate up
-- Roll back with: pnpm migrate down

-- Up
-- /////////////////////////////////////////////////////////////////////////

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
  working_hours_end text NOT NULL DEFAULT '18:00'
);

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
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_tenant_status_idx ON lead (organisation_id, status);
CREATE INDEX IF NOT EXISTS lead_assignee_idx ON lead (organisation_id, assigned_user_id);

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
CREATE INDEX IF NOT EXISTS route_plan_tenant_date_idx
  ON route_plan (organisation_id, route_date DESC, created_at DESC);

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
CREATE INDEX IF NOT EXISTS visit_assignee_status_idx
  ON visit (organisation_id, assigned_user_id, status);

CREATE TABLE IF NOT EXISTS field_product (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  inventory_available integer NOT NULL,
  unit_price_cents integer NOT NULL
);

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

CREATE TABLE IF NOT EXISTS notification (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
CREATE INDEX IF NOT EXISTS audit_log_tenant_time_idx
  ON audit_log (organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS consent_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  device_info jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS consent_log_user_idx
  ON consent_log (organisation_id, user_id, granted_at DESC);

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
CREATE INDEX IF NOT EXISTS work_session_active_idx
  ON work_session (organisation_id, user_id, status)
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
  PRIMARY KEY (organisation_id, id)
);
CREATE INDEX IF NOT EXISTS location_ping_session_idx
  ON location_ping (organisation_id, work_session_id, recorded_at DESC);

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
CREATE INDEX IF NOT EXISTS device_registration_user_idx
  ON device_registration (organisation_id, user_id);

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
CREATE INDEX IF NOT EXISTS mutation_record_user_idx
  ON mutation_record (organisation_id, user_id, received_at DESC);

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
CREATE INDEX IF NOT EXISTS sync_conflict_tenant_time_idx
  ON sync_conflict (organisation_id, created_at DESC);

-- Down
-- /////////////////////////////////////////////////////////////////////////

DROP TABLE IF EXISTS sync_conflict;
DROP TABLE IF EXISTS mutation_record;
DROP TABLE IF EXISTS sync_cursor;
DROP TABLE IF EXISTS device_registration;
DROP TABLE IF EXISTS location_ping;
DROP TABLE IF EXISTS work_session;
DROP TABLE IF EXISTS consent_log;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS notification;
DROP TABLE IF EXISTS field_order;
DROP TABLE IF EXISTS field_product;
DROP TABLE IF EXISTS visit;
DROP TABLE IF EXISTS route_stop;
DROP TABLE IF EXISTS route_plan;
DROP TABLE IF EXISTS lead;
DROP TABLE IF EXISTS territory;
DROP TABLE IF EXISTS outlet;
DROP TABLE IF EXISTS team_member;
DROP TABLE IF EXISTS team;
DROP TABLE IF EXISTS role_permission;
DROP TABLE IF EXISTS app_user;
DROP TABLE IF EXISTS organisation_setting;
DROP TABLE IF EXISTS organisation;
