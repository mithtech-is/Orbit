import { describe, it, expect } from "vitest";
import { outstandingCents, parseWeekdays, isBeatDueOn, reorderDueScore, mileageExpenseCents } from "./calc.js";

describe("outstandingCents", () => {
  it("subtracts payments from orders", () => {
    expect(outstandingCents(10000, 4000)).toBe(6000);
    expect(outstandingCents(5000, 5000)).toBe(0);
  });
});

describe("weekday parsing / beat scheduling", () => {
  it("parses valid weekdays and ignores junk", () => {
    expect([...parseWeekdays("1,3,5")]).toEqual([1, 3, 5]);
    expect([...parseWeekdays("1, x, 9, 6")]).toEqual([1, 6]);
  });

  it("matches due weekdays", () => {
    expect(isBeatDueOn("1,3,5", 3)).toBe(true);
    expect(isBeatDueOn("1,3,5", 2)).toBe(false);
  });
});

describe("reorderDueScore", () => {
  const DAY = 86_400_000;
  const NOW = 1_700_000_000_000;

  it("returns 0 with insufficient history", () => {
    expect(reorderDueScore([], NOW)).toBe(0);
    expect(reorderDueScore([NOW], NOW)).toBe(0);
  });

  it("scores ~1 when exactly one cadence has elapsed", () => {
    // weekly cadence, last order 7 days ago → score ≈ 1
    const times = [NOW - 21 * DAY, NOW - 14 * DAY, NOW - 7 * DAY];
    expect(reorderDueScore(times, NOW)).toBeCloseTo(1, 1);
  });

  it("scores >1 when overdue", () => {
    const times = [NOW - 28 * DAY, NOW - 21 * DAY, NOW - 14 * DAY];
    expect(reorderDueScore(times, NOW)).toBeGreaterThan(1.5);
  });
});

describe("mileageExpenseCents", () => {
  it("computes km × rate and guards non-positive inputs", () => {
    expect(mileageExpenseCents(10_000, 50)).toBe(500); // 10km × 50c
    expect(mileageExpenseCents(0, 50)).toBe(0);
    expect(mileageExpenseCents(10_000, 0)).toBe(0);
  });
});
