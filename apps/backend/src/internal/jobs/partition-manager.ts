import { getDatabasePool } from "../../db/client.js";

/**
 * location_ping is monthly RANGE-partitioned (performance-audit C5). These
 * helpers keep partitions provisioned and drop expired ones — turning retention
 * from a giant DELETE into an instant DROP TABLE.
 *
 * The SQL functions ensure_location_ping_partition() and
 * drop_expired_location_ping_partitions() are created by migration
 * 1700000000003_partition-location-ping.sql. These wrappers call them and no-op
 * cleanly if the table hasn't been partitioned yet (so the scaffold still runs
 * against an un-migrated DB).
 */

async function partitioned(): Promise<boolean> {
  const pool = getDatabasePool();
  const r = await pool.query(
    `SELECT 1 FROM pg_partitioned_table pt
     JOIN pg_class c ON c.oid = pt.partrelid
     WHERE c.relname = 'location_ping' LIMIT 1`
  );
  return (r.rowCount ?? 0) > 0;
}

/** Ensure the current + next 2 months of partitions exist. Safe to call often. */
export async function ensureLocationPingPartitions(): Promise<void> {
  if (!(await partitioned())) return;
  const pool = getDatabasePool();
  try {
    await pool.query(`SELECT ensure_location_ping_partition(now())`);
    await pool.query(`SELECT ensure_location_ping_partition(now() + interval '1 month')`);
    await pool.query(`SELECT ensure_location_ping_partition(now() + interval '2 months')`);
  } catch (err) {
    process.stderr.write(`[partition] ensure failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

/** Drop month partitions whose whole range is older than keepDays. Returns count. */
export async function dropExpiredLocationPingPartitions(keepDays: number): Promise<number> {
  if (!(await partitioned())) return 0;
  const pool = getDatabasePool();
  try {
    const r = await pool.query<{ drop_expired_location_ping_partitions: number }>(
      `SELECT drop_expired_location_ping_partitions($1) AS drop_expired_location_ping_partitions`,
      [keepDays]
    );
    return r.rows[0]?.drop_expired_location_ping_partitions ?? 0;
  } catch (err) {
    process.stderr.write(`[partition] drop failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 0;
  }
}
