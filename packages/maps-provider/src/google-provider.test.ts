import { describe, expect, it, vi } from "vitest";
import { createGoogleMapsProvider } from "./google-provider.js";

function makeResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("google maps provider", () => {
  it("requires an api key", () => {
    expect(() => createGoogleMapsProvider({ apiKey: "" })).toThrow(/apiKey/);
  });

  it("geocodes via /maps/api/geocode/json and maps location_type → confidence", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      status: "OK",
      results: [{
        formatted_address: "100 MG Road, Bengaluru, India",
        geometry: { location: { lat: 12.9716, lng: 77.5946 }, location_type: "ROOFTOP" }
      }]
    }));
    const provider = createGoogleMapsProvider({ apiKey: "key_test", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.geocodeAddress("100 MG Road");
    expect(String((fetcher.mock.calls[0] as unknown as [string])[0])).toContain("/maps/api/geocode/json?address=");
    expect(String((fetcher.mock.calls[0] as unknown as [string])[0])).toContain("&key=key_test");
    expect(result.coordinate).toEqual({ latitude: 12.9716, longitude: 77.5946 });
    expect(result.confidence).toBe(1);
    expect(result.provider).toBe("google");
  });

  it("throws when API status is REQUEST_DENIED", async () => {
    const fetcher = vi.fn(async () => makeResponse({ status: "REQUEST_DENIED", error_message: "bad key" }));
    const provider = createGoogleMapsProvider({ apiKey: "key_test", fetcher: fetcher as unknown as typeof fetch });
    await expect(provider.geocodeAddress("x")).rejects.toThrow(/REQUEST_DENIED/);
  });

  it("optimiseRoute reads waypoint_order to reorder middle stops, keeps last as destination", async () => {
    const fetcher = vi.fn(async () => makeResponse({
      status: "OK",
      routes: [{
        waypoint_order: [1, 0],
        legs: [
          { distance: { value: 1000 }, duration: { value: 300 } },
          { distance: { value: 2000 }, duration: { value: 600 } },
          { distance: { value: 1500 }, duration: { value: 400 } }
        ]
      }]
    }));
    const provider = createGoogleMapsProvider({ apiKey: "key_test", fetcher: fetcher as unknown as typeof fetch });
    const result = await provider.optimiseRoute({
      start: { latitude: 12.97, longitude: 77.59 },
      stops: [
        { id: "a", latitude: 12.98, longitude: 77.6, expectedDurationMinutes: 10, priority: 1 },
        { id: "b", latitude: 12.99, longitude: 77.61, expectedDurationMinutes: 15, priority: 1 },
        { id: "c", latitude: 13.0, longitude: 77.62, expectedDurationMinutes: 20, priority: 1 }
      ],
      workingWindow: { startsAt: "2026-05-28T09:00:00Z", endsAt: "2026-05-28T18:00:00Z" }
    });
    expect(result.orderedStops.map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(result.totalDistanceMeters).toBe(4500);
    expect(result.provider).toBe("google");
  });
});
