/**
 * Pure field-ops math: outlet ledger, beat scheduling, reorder cadence, and
 * mileage expense. No DB / clock — unit tested.
 */

/** Outstanding balance for an outlet = ordered total − collected payments (never negative shown as-is). */
export function outstandingCents(orderedCents: number, paidCents: number): number {
  return orderedCents - paidCents;
}

/** Parse a "1,3,5" weekday CSV (0=Sun..6=Sat) into a set. Ignores junk. */
export function parseWeekdays(csv: string): Set<number> {
  const out = new Set<number>();
  for (const part of csv.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out;
}

/** Whether a beat with these weekdays is due on the given JS weekday (0=Sun..6=Sat). */
export function isBeatDueOn(weekdaysCsv: string, weekday: number): boolean {
  return parseWeekdays(weekdaysCsv).has(weekday);
}

/**
 * Reorder-due score for an outlet from its order timestamps (ms). Higher = more
 * overdue. Score = daysSinceLastOrder / medianCadenceDays. >= 1 means "due".
 * Returns 0 when there's too little history to judge.
 */
export function reorderDueScore(orderTimesMs: number[], nowMs: number): number {
  if (orderTimesMs.length < 2) return 0;
  const sorted = [...orderTimesMs].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / 86_400_000);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!median || median <= 0) return 0;
  const daysSinceLast = (nowMs - sorted[sorted.length - 1]) / 86_400_000;
  return daysSinceLast / median;
}

/** Mileage expense in cents given distance and a per-km reimbursement rate. */
export function mileageExpenseCents(distanceMeters: number, ratePerKmCents: number): number {
  if (distanceMeters <= 0 || ratePerKmCents <= 0) return 0;
  return Math.round((distanceMeters / 1000) * ratePerKmCents);
}
