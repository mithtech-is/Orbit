import { describe, it, expect } from "vitest";
import { haversineMeters, speedKmh, detectImpossibleTravel, adherencePercent } from "./geo.js";

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters(12.97, 77.59, 12.97, 77.59)).toBeCloseTo(0, 5);
  });

  it("approximates a known short distance", () => {
    // ~1.11 km per 0.01 degree of latitude near the equator.
    const d = haversineMeters(12.97, 77.59, 12.98, 77.59);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });
});

describe("speedKmh", () => {
  it("computes km/h and treats zero time as infinite", () => {
    expect(speedKmh(1000, 3600)).toBeCloseTo(1, 5); // 1km in 1h = 1km/h
    expect(speedKmh(100, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("detectImpossibleTravel", () => {
  const NOW = 1_700_000_000_000;

  it("flags a 50km jump in 60s (~3000 km/h)", () => {
    const a = { latitude: 12.97, longitude: 77.59, recordedAtMs: NOW };
    const b = { latitude: 13.42, longitude: 77.59, recordedAtMs: NOW + 60_000 };
    const anomaly = detectImpossibleTravel(a, b);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.speedKmh).toBeGreaterThan(200);
  });

  it("does not flag normal driving (a few km over minutes)", () => {
    const a = { latitude: 12.97, longitude: 77.59, recordedAtMs: NOW };
    const b = { latitude: 12.99, longitude: 77.61, recordedAtMs: NOW + 10 * 60_000 };
    expect(detectImpossibleTravel(a, b)).toBeNull();
  });

  it("ignores GPS jitter under the minimum distance", () => {
    const a = { latitude: 12.97, longitude: 77.59, recordedAtMs: NOW };
    const b = { latitude: 12.9701, longitude: 77.5901, recordedAtMs: NOW + 1000 };
    expect(detectImpossibleTravel(a, b)).toBeNull();
  });
});

describe("adherencePercent", () => {
  it("computes visited/planned as a 0-100 integer", () => {
    expect(adherencePercent(4, 3)).toBe(75);
    expect(adherencePercent(0, 0)).toBe(0);
    expect(adherencePercent(5, 5)).toBe(100);
    expect(adherencePercent(5, 9)).toBe(100); // can't exceed 100
  });
});
