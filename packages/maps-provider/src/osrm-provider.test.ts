import { describe, expect, it, vi } from "vitest";
import { createOsrmMapsProvider } from "./osrm-provider.js";

function makeResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("osrm + nominatim provider", () => {
  it("requires userAgent for Nominatim compliance", () => {
    expect(() => createOsrmMapsProvider({ userAgent: "" })).toThrow(/userAgent/);
  });

  it("sends a User-Agent header on Nominatim geocode", async () => {
    const fetcher = vi.fn(async () => makeResponse([
      { lat: "12.9716", lon: "77.5946", display_name: "Bengaluru, India", importance: 0.7 }
    ]));
    const provider = createOsrmMapsProvider({ userAgent: "OrbitTest/1.0", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.geocodeAddress("Bengaluru");
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(firstCall[0])).toContain("/search?q=Bengaluru");
    expect(firstCall[1].headers).toMatchObject({ "User-Agent": "OrbitTest/1.0" });
    expect(result.coordinate).toEqual({ latitude: 12.9716, longitude: 77.5946 });
    expect(result.provider).toBe("osrm");
  });

  it("orders stops nearest-first (not OSRM's time-optimal order) and routes them via /route", async () => {
    // "b" is passed first but is farther; the provider must still lead with the
    // NEAREST stop "a" and request a fixed-order /route (no /trip re-optimisation).
    const fetcher = vi.fn(async () => makeResponse({
      routes: [{
        distance: 8000,
        duration: 900,
        geometry: { coordinates: [[77.59, 12.97], [77.6, 12.98], [77.61, 12.99]] },
        legs: [
          { distance: 1500, duration: 300 }, // start → a
          { distance: 1600, duration: 320 }  // a → b
        ]
      }]
    }));
    const provider = createOsrmMapsProvider({ userAgent: "OrbitTest/1.0", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.optimiseRoute({
      start: { latitude: 12.97, longitude: 77.59 },
      stops: [
        { id: "b", latitude: 12.99, longitude: 77.61, expectedDurationMinutes: 15, priority: 1 }, // farther
        { id: "a", latitude: 12.98, longitude: 77.6, expectedDurationMinutes: 10, priority: 1 }   // nearer
      ],
      workingWindow: { startsAt: "2026-05-28T09:00:00Z", endsAt: "2026-05-28T18:00:00Z" }
    });
    expect(result.orderedStops.map((s) => s.id)).toEqual(["a", "b"]);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/route/v1/driving/");
    expect(result.totalDistanceMeters).toBe(8000);
    expect(result.legs).toHaveLength(2);
    expect(result.returnHome).toBeUndefined();
    expect(result.provider).toBe("osrm");
  });

  it("appends the drive home and exposes returnHome on a round trip", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      routes: [{
        distance: 22800,
        duration: 2100,
        geometry: { coordinates: [[77.59, 12.97], [77.591, 12.971], [77.7, 13.05], [77.59, 12.97]] },
        legs: [
          { distance: 100, duration: 60 },    // start → a (near)
          { distance: 9000, duration: 1040 }, // a → b (far)
          { distance: 13700, duration: 1000 } // b → home
        ]
      }]
    }));
    const provider = createOsrmMapsProvider({ userAgent: "OrbitTest/1.0", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.optimiseRoute({
      start: { latitude: 12.97, longitude: 77.59 },
      stops: [
        { id: "b", latitude: 13.05, longitude: 77.7, expectedDurationMinutes: 10, priority: 0 },   // far
        { id: "a", latitude: 12.971, longitude: 77.591, expectedDurationMinutes: 10, priority: 0 } // near start
      ],
      workingWindow: { startsAt: "2026-05-28T09:00:00Z", endsAt: "2026-05-28T18:00:00Z" },
      returnToStart: true
    });
    // Nearest ("a") first, then "b", with the home leg captured separately.
    expect(result.orderedStops.map((s) => s.id)).toEqual(["a", "b"]);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/route/v1/driving/");
    expect(result.legs).toHaveLength(2);
    expect(result.returnHome).toBeDefined();
    expect(result.returnHome!.distanceMeters).toBe(13700);
  });

  it("table endpoint returns distance matrix cells", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      distances: [[0, 1234]],
      durations: [[0, 100]]
    }));
    const provider = createOsrmMapsProvider({ userAgent: "OrbitTest/1.0", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.calculateDistanceMatrix(
      [{ latitude: 12.97, longitude: 77.59 }],
      [{ latitude: 12.97, longitude: 77.59 }, { latitude: 12.99, longitude: 77.61 }]
    );
    expect(result.cells).toHaveLength(2);
    expect(result.cells[1].distanceMeters).toBe(1234);
  });
});
