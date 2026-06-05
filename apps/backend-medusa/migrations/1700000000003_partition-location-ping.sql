-- Up Migration
-- Convert location_ping into a monthly RANGE-partitioned table (performance-audit C5).
-- Retention becomes DROP PARTITION (instant, no bloat) instead of a giant DELETE.
-- The partition key (recorded_at) must be part of the PK, so the PK becomes
-- (organisation_id, id, recorded_at). Inserts use ON CONFLICT on that triple.
--
-- Safe to run once. If location_ping is already partitioned, this is a no-op-ish
-- guard (the rename will fail if location_ping_old already exists — drop it first).

DO $$
BEGIN
  -- Only convert if location_ping exists and is NOT already partitioned.
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'location_ping')
     AND NOT EXISTS (
       SELECT 1 FROM pg_partitioned_table pt
       JOIN pg_class c ON c.oid = pt.partrelid
       WHERE c.relname = 'location_ping'
     )
  THEN
    ALTER TABLE location_ping RENAME TO location_ping_old;
    -- Indexes keep their names on the renamed table, which would collide with the
    -- new partitioned table's indexes below. Move them aside; they're dropped
    -- with location_ping_old at the end of this migration.
    ALTER INDEX IF EXISTS location_ping_session_idx RENAME TO location_ping_old_session_idx;
    ALTER INDEX IF EXISTS location_ping_user_idx RENAME TO location_ping_old_user_idx;

    CREATE TABLE location_ping (
      id text NOT NULL,
      organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
      work_session_id text NOT NULL REFERENCES work_session(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      latitude double precision NOT NULL,
      longitude double precision NOT NULL,
      accuracy_meters double precision,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organisation_id, id, recorded_at)
    ) PARTITION BY RANGE (recorded_at);

    CREATE INDEX location_ping_session_idx ON location_ping (organisation_id, work_session_id, recorded_at DESC);
    CREATE INDEX location_ping_user_idx    ON location_ping (organisation_id, user_id, recorded_at DESC);

    -- Catch-all so inserts never fail even if a month partition is missing.
    CREATE TABLE location_ping_default PARTITION OF location_ping DEFAULT;
  END IF;
END $$;

-- Idempotently create the partition for the month containing `target`.
CREATE OR REPLACE FUNCTION ensure_location_ping_partition(target timestamptz)
RETURNS void AS $$
DECLARE
  start_ts date := date_trunc('month', target)::date;
  end_ts   date := (date_trunc('month', target) + interval '1 month')::date;
  part     text := format('location_ping_y%sm%s', to_char(start_ts, 'YYYY'), to_char(start_ts, 'MM'));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF location_ping FOR VALUES FROM (%L) TO (%L)',
      part, start_ts, end_ts
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop month partitions whose entire range is older than `keep_days`.
-- Returns the number of partitions dropped.
CREATE OR REPLACE FUNCTION drop_expired_location_ping_partitions(keep_days integer)
RETURNS integer AS $$
DECLARE
  r record;
  dropped integer := 0;
  cutoff date := (now() - make_interval(days => keep_days))::date;
BEGIN
  FOR r IN
    SELECT c.relname AS part,
           pg_get_expr(c.relpartbound, c.oid) AS bound
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'location_ping' AND c.relname <> 'location_ping_default'
  LOOP
    -- bound looks like: FOR VALUES FROM ('2026-04-01') TO ('2026-05-01')
    IF (substring(r.bound from 'TO \(''([0-9-]+)''\)'))::date <= cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I', r.part);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END;
$$ LANGUAGE plpgsql;

-- Create current + next month, then migrate old rows back in (if converting).
SELECT ensure_location_ping_partition(now());
SELECT ensure_location_ping_partition(now() + interval '1 month');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'location_ping_old') THEN
    INSERT INTO location_ping (id, organisation_id, work_session_id, user_id, latitude, longitude, accuracy_meters, recorded_at)
    SELECT id, organisation_id, work_session_id, user_id, latitude, longitude, accuracy_meters, recorded_at
    FROM location_ping_old
    ON CONFLICT DO NOTHING;
    DROP TABLE location_ping_old;
  END IF;
END $$;

-- Down Migration
-- (Irreversible-ish: collapse back to a plain table.)
DROP FUNCTION IF EXISTS ensure_location_ping_partition(timestamptz);
DROP FUNCTION IF EXISTS drop_expired_location_ping_partitions(integer);
