import { getDatabasePool, queryRows } from "../db/client.js";
import { sumPingDistance } from "../modules/field-ops/distance-calculator.js";

async function backfillCalculatedKms(batchSize = 50): Promise<void> {
  const pool = getDatabasePool();

  const expenses = await queryRows<{
    id: string; organisation_id: string; visit_id: string;
  }>(
    `SELECT ve.id, ve.organisation_id, ve.visit_id
     FROM visit_expense ve
     WHERE ve.calculated_kms IS NULL AND LOWER(ve.category) = 'mileage'
     LIMIT $1`,
    [batchSize]
  );

  if (expenses.length === 0) {
    console.log("No rows to backfill.");
    await pool.end();
    return;
  }

  let updated = 0;
  for (const exp of expenses) {
    const visits = await queryRows<{
      assigned_user_id: string; checked_in_at: string | null; checked_out_at: string | null;
    }>(
      `SELECT assigned_user_id, checked_in_at, checked_out_at
       FROM visit WHERE organisation_id = $1 AND id = $2`,
      [exp.organisation_id, exp.visit_id]
    );
    const v = visits[0];
    if (!v?.checked_in_at) continue;

    const windowEnd = v.checked_out_at ?? new Date().toISOString();
    const rows = await queryRows<{ latitude: number; longitude: number; recorded_at: string }>(
      `SELECT latitude, longitude, recorded_at
       FROM location_ping
       WHERE organisation_id = $1 AND user_id = $2
         AND recorded_at >= $3 AND recorded_at <= $4
       ORDER BY recorded_at ASC`,
      [exp.organisation_id, v.assigned_user_id, v.checked_in_at, windowEnd]
    );

    const pings = rows.map((r) => ({ latitude: r.latitude, longitude: r.longitude, recordedAt: r.recorded_at }));
    const distanceMeters = sumPingDistance(pings);
    const calculatedKm = pings.length >= 2 ? Math.round(distanceMeters / 10) / 100 : null;

    await pool.query(
      `UPDATE visit_expense SET calculated_kms = $1 WHERE id = $2 AND calculated_kms IS NULL`,
      [calculatedKm, exp.id]
    );
    updated += 1;
  }

  console.log(`Backfilled ${updated} / ${expenses.length} expense rows.`);
  console.log("Run again to process remaining rows (if any).");
  await pool.end();
}

backfillCalculatedKms().catch((err: unknown) => {
  console.error("Backfill failed:", err);
  process.exitCode = 1;
});
