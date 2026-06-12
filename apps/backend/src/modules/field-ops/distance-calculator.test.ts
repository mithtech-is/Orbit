import { describe, it, expect } from "vitest";
import { sumPingDistance } from "./distance-calculator.js";

describe("sumPingDistance", () => {
  it("returns 0 for fewer than 2 pings", () => {
    expect(sumPingDistance([])).toBe(0);
    expect(sumPingDistance([{ latitude: 0, longitude: 0, recordedAt: "2026-01-01T00:00:00Z" }])).toBe(0);
  });

  it("sums haversine between consecutive pings", () => {
    const pings = [
      { latitude: 12.9716, longitude: 77.5946, recordedAt: "2026-01-01T09:00:00Z" },
      { latitude: 12.9352, longitude: 77.6245, recordedAt: "2026-01-01T09:15:00Z" },
      { latitude: 12.9340, longitude: 77.6100, recordedAt: "2026-01-01T09:30:00Z" }
    ];
    const total = sumPingDistance(pings);
    expect(total).toBeGreaterThan(0);
    expect(Number.isFinite(total)).toBe(true);
  });

  it("returns 0 for identical consecutive pings", () => {
    const pings = [
      { latitude: 12.9716, longitude: 77.5946, recordedAt: "2026-01-01T09:00:00Z" },
      { latitude: 12.9716, longitude: 77.5946, recordedAt: "2026-01-01T09:15:00Z" },
      { latitude: 12.9716, longitude: 77.5946, recordedAt: "2026-01-01T09:30:00Z" }
    ];
    expect(sumPingDistance(pings)).toBe(0);
  });
});
