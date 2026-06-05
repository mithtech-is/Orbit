import { describe, expect, it, vi } from "vitest";
import { createMapboxMapsProvider } from "./mapbox-provider.js";

function makeResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("mapbox maps provider", () => {
  it("requires an access token", () => {
    expect(() => createMapboxMapsProvider({ accessToken: "" })).toThrow(/accessToken/);
  });

  it("forward geocodes via /geocoding/v5/mapbox.places", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      features: [{ center: [77.5946, 12.9716], place_name: "Bengaluru, KA", relevance: 0.9 }]
    }));
    const provider = createMapboxMapsProvider({ accessToken: "tk_test", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.geocodeAddress("Bengaluru");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/geocoding/v5/mapbox.places/Bengaluru.json")
    );
    expect(String((fetcher.mock.calls[0] as unknown as [string])[0])).toContain("access_token=tk_test");
    expect(result.coordinate).toEqual({ latitude: 12.9716, longitude: 77.5946 });
    expect(result.confidence).toBe(0.9);
    expect(result.provider).toBe("mapbox");
  });

  it("reverse geocodes via lng,lat order", async () => {
    const fetcher = vi.fn(async () => makeResponse({ features: [{ place_name: "MG Road, Bengaluru" }] }));
    const provider = createMapboxMapsProvider({ accessToken: "tk_test", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.reverseGeocode({ latitude: 12.9716, longitude: 77.5946 });
    expect(String((fetcher.mock.calls[0] as unknown as [string])[0])).toContain("/geocoding/v5/mapbox.places/77.5946,12.9716.json");
    expect(result.formattedAddress).toBe("MG Road, Bengaluru");
  });

  it("optimiseRoute returns stops in waypoint_index order, excluding start", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      trips: [{ distance: 5000, duration: 1200 }],
      waypoints: [
        { waypoint_index: 0, trips_index: 0 },
        { waypoint_index: 2, trips_index: 0 },
        { waypoint_index: 1, trips_index: 0 }
      ]
    }));
    const provider = createMapboxMapsProvider({ accessToken: "tk_test", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.optimiseRoute({
      start: { latitude: 12.97, longitude: 77.59 },
      stops: [
        { id: "a", latitude: 12.98, longitude: 77.6, expectedDurationMinutes: 10, priority: 1 },
        { id: "b", latitude: 12.99, longitude: 77.61, expectedDurationMinutes: 15, priority: 1 }
      ],
      workingWindow: { startsAt: "2026-05-28T09:00:00Z", endsAt: "2026-05-28T18:00:00Z" }
    });
    expect(result.orderedStops.map((s) => s.id)).toEqual(["b", "a"]);
    expect(result.totalDistanceMeters).toBe(5000);
    expect(result.totalDurationMinutes).toBe(10 + 15 + 20);
    expect(result.provider).toBe("mapbox");
  });

  it("calculateDistanceMatrix flattens API response into origin x destination cells", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      distances: [[0, 1000], [2000, 0]],
      durations: [[0, 60], [120, 0]]
    }));
    const provider = createMapboxMapsProvider({ accessToken: "tk_test", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.calculateDistanceMatrix(
      [{ latitude: 12.97, longitude: 77.59 }, { latitude: 12.98, longitude: 77.6 }],
      [{ latitude: 13.0, longitude: 77.62 }, { latitude: 13.01, longitude: 77.63 }]
    );
    expect(result.cells).toHaveLength(4);
    expect(result.cells[1]).toEqual({ fromIndex: 0, toIndex: 1, distanceMeters: 1000, durationMinutes: 1 });
  });
});
