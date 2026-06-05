import { describe, expect, it } from "vitest";
import { createMockMapsProvider } from "./mock-provider.js";

describe("mock maps provider", () => {
  it("preserves priority order across the 2-opt pass", async () => {
    // The optimiser should never let 2-opt swap a high-priority stop after a
    // low-priority one — priority is a hard constraint in this provider.
    // Original assertion before 2-opt landed: [high_near, high_far, low_near].
    // After 2-opt, the high-priority block is unchanged (only 2 stops, nothing
    // to reorder) so the order stays exactly the same.
    const provider = createMockMapsProvider();

    const result = await provider.optimiseRoute({
      start: { latitude: 12.9716, longitude: 77.5946 },
      stops: [
        { id: "low_near", latitude: 12.972, longitude: 77.595, expectedDurationMinutes: 20, priority: 1 },
        { id: "high_far", latitude: 12.981, longitude: 77.61, expectedDurationMinutes: 20, priority: 5 },
        { id: "high_near", latitude: 12.974, longitude: 77.596, expectedDurationMinutes: 20, priority: 5 }
      ],
      workingWindow: {
        startsAt: "2026-05-27T09:00:00.000Z",
        endsAt: "2026-05-27T18:00:00.000Z"
      }
    });

    expect(result.orderedStops.map((stop) => stop.id)).toEqual(["high_near", "high_far", "low_near"]);
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
    expect(result.provider).toBe("mock");
  });

  it("never swaps across priority boundaries", async () => {
    // Force a configuration where the optimal-distance ordering would put a
    // low-priority stop BEFORE a high-priority one. 2-opt must NOT discover
    // this — priority blocks are independent.
    const provider = createMockMapsProvider();

    const result = await provider.optimiseRoute({
      start: { latitude: 0, longitude: 0 },
      stops: [
        // Low-priority cluster sits right next to the start (would be visited
        // first by a pure distance-minimising solver) ...
        { id: "low_a", latitude: 0.001, longitude: 0,     expectedDurationMinutes: 5, priority: 1 },
        { id: "low_b", latitude: 0.001, longitude: 0.001, expectedDurationMinutes: 5, priority: 1 },
        // ... but the high-priority cluster is far away.
        { id: "high_x", latitude: 0.05, longitude: 0.05, expectedDurationMinutes: 5, priority: 5 },
        { id: "high_y", latitude: 0.05, longitude: 0.06, expectedDurationMinutes: 5, priority: 5 }
      ],
      workingWindow: {
        startsAt: "2026-05-27T09:00:00.000Z",
        endsAt: "2026-05-27T18:00:00.000Z"
      }
    });

    const ids = result.orderedStops.map((s) => s.id);
    // Both high-priority stops must come before either low-priority stop,
    // regardless of how much shorter the alternative would be.
    const highIndices = [ids.indexOf("high_x"), ids.indexOf("high_y")];
    const lowIndices = [ids.indexOf("low_a"), ids.indexOf("low_b")];
    expect(Math.max(...highIndices)).toBeLessThan(Math.min(...lowIndices));
  });

  it("strictly improves over nearest-neighbour on a known counterexample", async () => {
    // Hand-computed configuration where greedy nearest-neighbour produces a
    // suboptimal tour and 2-opt removes the inefficiency. Four corners around
    // the origin plus an outlier far north (E at lat=5). A and B share the
    // northern row (lat=1) and are close to E; C and D are on the southern
    // row (lat=-1) and are far from E.
    //
    // NN walks A (north-east) → B (north-west? wait, B is north-east of
    // origin too) → D → C → E. The trap: NN ends the cluster at C, then has
    // to make the long 6°-latitude jump to E. 2-opt finds that reversing
    // [B,D,C] gives [C,D,B], ending at B instead — and B is right next to E,
    // saving ~218 km on the final leg.
    //
    // Computed by hand:
    //   NN tour:    [A, B, D, C, E]  ≈ 1,500,895 m
    //   2-opt tour: [A, C, D, B, E]  ≈ 1,283,039 m  (~14.5% shorter)
    const provider = createMockMapsProvider();
    const stops = [
      { id: "A", latitude: 1,  longitude: 1,  priority: 0 },
      { id: "B", latitude: 1,  longitude: -1, priority: 0 },
      { id: "C", latitude: -1, longitude: 1,  priority: 0 },
      { id: "D", latitude: -1, longitude: -1, priority: 0 },
      { id: "E", latitude: 5,  longitude: 0,  priority: 0 } // outlier far north
    ];
    const result = await provider.optimiseRoute({
      start: { latitude: 0, longitude: 0 },
      stops: stops.map((s) => ({ ...s, expectedDurationMinutes: 10 })),
      workingWindow: {
        startsAt: "2026-05-27T09:00:00.000Z",
        endsAt: "2026-05-27T18:00:00.000Z"
      }
    });

    // Compute the NN-only baseline using the same priority+distance rules so
    // the comparison is apples-to-apples. If 2-opt regresses, this fails.
    const nnOnly = computeNnDistance(
      { latitude: 0, longitude: 0 },
      stops,
      provider.calculateDistanceMeters
    );

    expect(result.totalDistanceMeters).toBeLessThan(nnOnly);
    // Sanity check: the improvement should be material (>5%), not floating-
    // point noise. With these inputs the actual delta is ~14.5%.
    expect(result.totalDistanceMeters / nnOnly).toBeLessThan(0.95);
  });

  it("starts at the nearest stop and closes the loop home on a round trip", async () => {
    // The rep expects their day to BEGIN with the outlet closest to where they
    // are, then fan outward, and END back home. Even though a pure distance
    // solver might bury the nearest stop mid-route, we pin it to first.
    const provider = createMockMapsProvider();
    const result = await provider.optimiseRoute({
      start: { latitude: 12.97, longitude: 77.59 },
      stops: [
        { id: "far", latitude: 13.05, longitude: 77.70, expectedDurationMinutes: 10, priority: 0 },
        { id: "near", latitude: 12.971, longitude: 77.591, expectedDurationMinutes: 10, priority: 0 },
        { id: "mid", latitude: 12.99, longitude: 77.62, expectedDurationMinutes: 10, priority: 0 }
      ],
      workingWindow: { startsAt: "2026-05-28T09:00:00Z", endsAt: "2026-05-28T18:00:00Z" },
      returnToStart: true
    });
    // Nearest outlet to the start is visited first ...
    expect(result.orderedStops[0].id).toBe("near");
    // ... the round trip closes with a drive back home ...
    expect(result.returnHome).toBeDefined();
    expect(result.returnHome!.distanceMeters).toBeGreaterThan(0);
    // ... and per-leg timing is exposed so the client can show ETAs.
    expect(result.legs).toHaveLength(3);
  });

  it("omits the drive-home leg when the route is one-way (no returnToStart)", async () => {
    const provider = createMockMapsProvider();
    const result = await provider.optimiseRoute({
      start: { latitude: 12.97, longitude: 77.59 },
      stops: [
        { id: "near", latitude: 12.971, longitude: 77.591, expectedDurationMinutes: 10, priority: 0 },
        { id: "far", latitude: 13.05, longitude: 77.70, expectedDurationMinutes: 10, priority: 0 }
      ],
      workingWindow: { startsAt: "2026-05-28T09:00:00Z", endsAt: "2026-05-28T18:00:00Z" }
    });
    expect(result.orderedStops[0].id).toBe("near");
    expect(result.returnHome).toBeUndefined();
  });

  it("is deterministic — the same input always produces the same tour", async () => {
    const provider = createMockMapsProvider();
    const input = {
      start: { latitude: 12.96, longitude: 77.59 },
      stops: [
        { id: "s1", latitude: 12.97, longitude: 77.60, expectedDurationMinutes: 15, priority: 1 },
        { id: "s2", latitude: 12.98, longitude: 77.61, expectedDurationMinutes: 15, priority: 1 },
        { id: "s3", latitude: 12.99, longitude: 77.62, expectedDurationMinutes: 15, priority: 1 },
        { id: "s4", latitude: 12.965, longitude: 77.605, expectedDurationMinutes: 15, priority: 1 }
      ],
      workingWindow: { startsAt: "2026-05-27T09:00:00.000Z", endsAt: "2026-05-27T18:00:00.000Z" }
    };
    const a = await provider.optimiseRoute(input);
    const b = await provider.optimiseRoute(input);
    expect(a.orderedStops.map((s) => s.id)).toEqual(b.orderedStops.map((s) => s.id));
    expect(a.totalDistanceMeters).toBe(b.totalDistanceMeters);
  });

  it("geocodeAddress is deterministic for the same address", async () => {
    const provider = createMockMapsProvider();
    const a = await provider.geocodeAddress("100 MG Road, Bengaluru");
    const b = await provider.geocodeAddress("100 MG Road, Bengaluru");
    expect(a).toEqual(b);
    expect(a.coordinate.latitude).toBeGreaterThanOrEqual(12.9);
    expect(a.coordinate.latitude).toBeLessThanOrEqual(13.02);
    expect(a.provider).toBe("mock");
  });

  it("reverseGeocode echoes the coordinate with a formatted address", async () => {
    const provider = createMockMapsProvider();
    const result = await provider.reverseGeocode({ latitude: 12.9716, longitude: 77.5946 });
    expect(result.coordinate).toEqual({ latitude: 12.9716, longitude: 77.5946 });
    expect(result.formattedAddress).toContain("12.9716");
  });

  it("calculateDistanceMatrix returns origins×destinations cells", async () => {
    const provider = createMockMapsProvider();
    const result = await provider.calculateDistanceMatrix(
      [
        { latitude: 12.97, longitude: 77.59 },
        { latitude: 12.95, longitude: 77.62 }
      ],
      [
        { latitude: 12.98, longitude: 77.6 },
        { latitude: 12.93, longitude: 77.58 },
        { latitude: 13.0, longitude: 77.55 }
      ]
    );

    expect(result.cells).toHaveLength(6);
    expect(result.cells.every((c) => c.distanceMeters >= 0)).toBe(true);
    expect(result.cells.every((c) => c.durationMinutes >= 1)).toBe(true);
  });
});

/**
 * Replicates the nearest-neighbour walk from the production code so the
 * 2-opt-improvement test has a baseline to compare against. We intentionally
 * keep this in the test file rather than exporting from the provider — the
 * production code should only ever return the 2-opt-refined tour.
 */
function computeNnDistance(
  start: { latitude: number; longitude: number },
  stops: Array<{ id: string; latitude: number; longitude: number; priority: number }>,
  distanceFn: (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => number
): number {
  const remaining = [...stops];
  let current = start;
  let total = 0;
  while (remaining.length > 0) {
    remaining.sort((a, b) => {
      const priorityDelta = b.priority - a.priority;
      if (priorityDelta !== 0) return priorityDelta;
      return distanceFn(current, a) - distanceFn(current, b);
    });
    const next = remaining.shift()!;
    total += distanceFn(current, next);
    current = next;
  }
  return total;
}
