/**
 * Tiny helpers for bounded list responses. We fetch `limit + 1` rows from the
 * DB, then `paginate` trims to `limit` and reports whether more exist — so a
 * list endpoint can never serialize an entire tenant's table into one response
 * (a real risk at 10k users) while still honestly signalling truncation via
 * `hasMore` instead of silently hiding rows.
 */

/** Clamp a caller-supplied page size into [1, max], defaulting when absent/invalid. */
export function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Given rows fetched with `LIMIT limit + 1`, return at most `limit` items and a
 * `hasMore` flag. Pass the raw rows; this slices the sentinel off.
 */
export function paginate<T>(rows: T[], limit: number): { items: T[]; hasMore: boolean } {
  if (rows.length > limit) {
    return { items: rows.slice(0, limit), hasMore: true };
  }
  return { items: rows, hasMore: false };
}
