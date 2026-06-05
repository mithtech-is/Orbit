import { getDatabasePool } from "./client.js";

/**
 * Boot-time, idempotent application of the additive DDL introduced by the
 * feature phases (notifications, uploads, password reset, payments, beat plans,
 * attendance, surveys). Every statement is `IF NOT EXISTS`, so this is safe to
 * run on every start and self-heals a database that was seeded before these
 * tables/columns existed — without requiring a manual migration step.
 *
 * Mirrors the additions in db/schema.sql and migrations 1700000000004/5.
 */
const STATEMENTS: string[] = [
  // Notifications feed columns
  `ALTER TABLE notification ADD COLUMN IF NOT EXISTS body text`,
  `ALTER TABLE notification ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'`,
  `ALTER TABLE notification ADD COLUMN IF NOT EXISTS read_at timestamptz`,

  // Attachments (visit photos / uploads)
  `CREATE TABLE IF NOT EXISTS attachment (
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
   )`,
  `CREATE INDEX IF NOT EXISTS attachment_visit_idx ON attachment (organisation_id, visit_id, created_at DESC)`,

  // Password reset tokens
  `CREATE TABLE IF NOT EXISTS password_reset_token (
     id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     token_hash text NOT NULL,
     expires_at timestamptz NOT NULL,
     used_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS password_reset_token_hash_idx ON password_reset_token (token_hash)`,
  `CREATE INDEX IF NOT EXISTS password_reset_token_user_idx ON password_reset_token (organisation_id, user_id, created_at DESC)`,

  // Payments / ledger
  `CREATE TABLE IF NOT EXISTS payment (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
     order_id text REFERENCES field_order(id) ON DELETE SET NULL,
     collected_by text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     amount_cents integer NOT NULL,
     method text NOT NULL DEFAULT 'cash',
     note text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS payment_outlet_idx ON payment (organisation_id, outlet_id, created_at DESC)`,

  // Beat plans (PJP)
  `CREATE TABLE IF NOT EXISTS beat_plan (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     rep_user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     outlet_id text NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
     weekdays text NOT NULL DEFAULT '1,2,3,4,5',
     active boolean NOT NULL DEFAULT true,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS beat_plan_rep_idx ON beat_plan (organisation_id, rep_user_id, active)`,

  // Attendance
  `CREATE TABLE IF NOT EXISTS attendance (
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
   )`,
  `CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (organisation_id, attendance_date)`,

  // Surveys
  `CREATE TABLE IF NOT EXISTS survey (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     name text NOT NULL,
     definition jsonb NOT NULL DEFAULT '{}',
     active boolean NOT NULL DEFAULT true,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS survey_tenant_idx ON survey (organisation_id, active)`,
  `CREATE TABLE IF NOT EXISTS survey_response (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     survey_id text NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
     submitted_by text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     outlet_id text REFERENCES outlet(id) ON DELETE SET NULL,
     answers jsonb NOT NULL DEFAULT '{}',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS survey_response_idx ON survey_response (organisation_id, survey_id, created_at DESC)`,

  // --- Phase 3: richer visit capture ---
  // Customer feedback / NPS + a typed customer acknowledgement (signature stand-in
  // until a drawn-signature canvas native dep is added).
  `ALTER TABLE visit ADD COLUMN IF NOT EXISTS feedback_rating integer`,
  `ALTER TABLE visit ADD COLUMN IF NOT EXISTS nps_score integer`,
  `ALTER TABLE visit ADD COLUMN IF NOT EXISTS feedback_text text`,
  `ALTER TABLE visit ADD COLUMN IF NOT EXISTS signed_by text`,
  `ALTER TABLE visit ADD COLUMN IF NOT EXISTS signature_path text`,

  `CREATE TABLE IF NOT EXISTS visit_expense (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
     category text NOT NULL,
     amount_cents integer NOT NULL,
     kms double precision,
     note text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS visit_expense_idx ON visit_expense (organisation_id, visit_id)`,

  `CREATE TABLE IF NOT EXISTS visit_competitor_intel (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
     competitor_name text NOT NULL,
     product_name text,
     price_cents integer,
     promo text,
     note text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS visit_competitor_idx ON visit_competitor_intel (organisation_id, visit_id)`,

  `CREATE TABLE IF NOT EXISTS visit_sample (
     id text PRIMARY KEY,
     organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
     visit_id text NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
     item_name text NOT NULL,
     quantity double precision NOT NULL DEFAULT 1,
     recipient_name text,
     note text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS visit_sample_idx ON visit_sample (organisation_id, visit_id)`,

  // --- Phase 4: day plan lifecycle — per-stop planning fields ---
  `ALTER TABLE route_stop ADD COLUMN IF NOT EXISTS visit_type text`,
  `ALTER TABLE route_stop ADD COLUMN IF NOT EXISTS objective text`,
  `ALTER TABLE route_stop ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0`,

  // --- Lead geolocation: an optional pin captured on the map for a lead ---
  `ALTER TABLE lead ADD COLUMN IF NOT EXISTS latitude double precision`,
  `ALTER TABLE lead ADD COLUMN IF NOT EXISTS longitude double precision`,

  // --- Product catalogue: SKU must be unique within an organisation so the
  // admin "add product" flow can't create duplicates (server-enforced). ---
  `CREATE UNIQUE INDEX IF NOT EXISTS field_product_org_sku_uniq ON field_product (organisation_id, sku)`
];

export async function ensureFeatureSchema(): Promise<{ applied: number; failed: number }> {
  const pool = getDatabasePool();
  let applied = 0;
  let failed = 0;
  for (const sql of STATEMENTS) {
    try {
      await pool.query(sql);
      applied += 1;
    } catch (error) {
      failed += 1;
      process.stderr.write(
        `[schema] feature DDL failed (non-fatal): ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
  return { applied, failed };
}
