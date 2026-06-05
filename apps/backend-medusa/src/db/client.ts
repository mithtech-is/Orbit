import pg from "pg";

let pool: pg.Pool | undefined;

export function getDatabasePool(): pg.Pool {
  if (!pool) {
    // Pool sizing is tunable from env (performance-audit C1). The pg default is
    // max=10, which caps total concurrent DB ops per process; raise it per
    // instance and size against Postgres max_connections (use pgBouncer for
    // many instances). Timeouts prevent a slow query from pinning a connection
    // forever and surface pool exhaustion as an error instead of a hang.
    const num = (name: string, fallback: number): number => {
      const v = Number(process.env[name]);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://fieldsales:fieldsales@localhost:15432/fieldsales",
      max: num("DB_POOL_MAX", 20),
      min: num("DB_POOL_MIN", 0),
      idleTimeoutMillis: num("DB_POOL_IDLE_MS", 30_000),
      connectionTimeoutMillis: num("DB_POOL_CONN_TIMEOUT_MS", 10_000)
    });
  }

  return pool;
}

export async function queryRows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await getDatabasePool().query(sql, values);
  return result.rows as T[];
}
