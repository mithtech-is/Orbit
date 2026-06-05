import type {
  Coordinate,
  DistanceMatrixCell,
  DistanceMatrixResult,
  GeocodeResult,
  MapsProvider,
  OptimiseRouteInput,
  OptimisedRoute,
  ReverseGeocodeResult,
  RouteStop
} from "./provider.js";

export interface GoogleMapsProviderOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
}

const EARTH_RADIUS_METERS = 6_371_000;
function toRad(v: number): number { return (v * Math.PI) / 180; }
function haversineMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function coord(c: Coordinate): string {
  return `${c.latitude},${c.longitude}`;
}

/**
 * Real Google Maps Platform-backed MapsProvider. Calls:
 *   - Geocoding API (forward + reverse)
 *   - Directions API with `optimize:true` waypoints (route optimisation)
 *   - Distance Matrix API (matrix)
 *
 * Reads `apiKey` (required). Pass a custom `fetcher` for tests.
 */
export function createGoogleMapsProvider(opts: GoogleMapsProviderOptions): MapsProvider {
  if (!opts.apiKey) throw new Error("Google Maps provider requires apiKey");
  const fetcher = opts.fetcher ?? fetch;
  const base = (opts.baseUrl ?? "https://maps.googleapis.com").replace(/\/$/, "");

  async function getJson(url: string): Promise<Record<string, unknown>> {
    const response = await fetcher(url);
    if (!response.ok) {
      throw new Error(`Google Maps request failed: ${response.status} ${url}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.status === "string" && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Google Maps API status=${data.status}: ${data.error_message ?? ""}`);
    }
    return data;
  }

  return {
    calculateDistanceMeters: haversineMeters,

    generateNavigationLink(destination) {
      return `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`;
    },

    async optimiseRoute(input: OptimiseRouteInput): Promise<OptimisedRoute> {
      if (input.stops.length === 0) {
        return {
          orderedStops: [],
          totalDistanceMeters: 0,
          totalDurationMinutes: 0,
          provider: "google",
          providerReference: "empty"
        };
      }
      const origin = coord(input.start);
      const destination = coord(input.stops[input.stops.length - 1]);
      const middle = input.stops.slice(0, -1).map(coord).join("|");
      const waypoints = middle.length > 0 ? `optimize:true|${middle}` : "optimize:true";
      const url = `${base}/maps/api/directions/json?origin=${origin}&destination=${destination}` +
        `&waypoints=${encodeURIComponent(waypoints)}&key=${opts.apiKey}`;
      const data = await getJson(url);
      const routes = (data.routes ?? []) as Array<{
        waypoint_order?: number[];
        legs?: Array<{ distance?: { value: number }; duration?: { value: number } }>;
      }>;
      const route = routes[0];
      if (!route?.legs) throw new Error("Google returned no route");

      const middleStops = input.stops.slice(0, -1);
      const lastStop = input.stops[input.stops.length - 1];
      const orderedMiddle: RouteStop[] = (route.waypoint_order ?? middleStops.map((_, i) => i))
        .map((idx) => middleStops[idx])
        .filter((s): s is RouteStop => Boolean(s));
      const orderedStops = [...orderedMiddle, lastStop];

      const totalDistanceMeters = route.legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0);
      const totalDurationSeconds = route.legs.reduce((sum, l) => sum + (l.duration?.value ?? 0), 0);
      const visitDuration = orderedStops.reduce((sum, s) => sum + s.expectedDurationMinutes, 0);

      return {
        orderedStops,
        totalDistanceMeters: Math.round(totalDistanceMeters),
        totalDurationMinutes: visitDuration + Math.ceil(totalDurationSeconds / 60),
        provider: "google",
        providerReference: `google-directions-${Date.now()}`
      };
    },

    async geocodeAddress(address: string): Promise<GeocodeResult> {
      const url = `${base}/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${opts.apiKey}`;
      const data = await getJson(url);
      const results = (data.results ?? []) as Array<{
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number }; location_type?: string };
      }>;
      const first = results[0];
      if (!first?.geometry?.location) throw new Error(`Google geocode found no result for ${address}`);
      const confidence = first.geometry.location_type === "ROOFTOP" ? 1 :
                         first.geometry.location_type === "RANGE_INTERPOLATED" ? 0.8 :
                         first.geometry.location_type === "GEOMETRIC_CENTER" ? 0.6 : 0.4;
      return {
        formattedAddress: first.formatted_address ?? address,
        coordinate: { latitude: first.geometry.location.lat, longitude: first.geometry.location.lng },
        confidence,
        provider: "google"
      };
    },

    async reverseGeocode(coordinate: Coordinate): Promise<ReverseGeocodeResult> {
      const url = `${base}/maps/api/geocode/json?latlng=${coordinate.latitude},${coordinate.longitude}&key=${opts.apiKey}`;
      const data = await getJson(url);
      const results = (data.results ?? []) as Array<{ formatted_address?: string }>;
      return {
        formattedAddress: results[0]?.formatted_address ?? `(${coordinate.latitude}, ${coordinate.longitude})`,
        coordinate,
        provider: "google"
      };
    },

    async calculateDistanceMatrix(origins: Coordinate[], destinations: Coordinate[]): Promise<DistanceMatrixResult> {
      const url = `${base}/maps/api/distancematrix/json` +
        `?origins=${origins.map(coord).join("|")}&destinations=${destinations.map(coord).join("|")}&key=${opts.apiKey}`;
      const data = await getJson(url);
      const rows = (data.rows ?? []) as Array<{
        elements?: Array<{
          status?: string;
          distance?: { value: number };
          duration?: { value: number };
        }>;
      }>;
      const cells: DistanceMatrixCell[] = [];
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const element = rows[i]?.elements?.[j];
          const distance = element?.distance?.value ?? 0;
          const duration = element?.duration?.value ?? 0;
          cells.push({
            fromIndex: i,
            toIndex: j,
            distanceMeters: Math.round(distance),
            durationMinutes: Math.max(1, Math.ceil(duration / 60))
          });
        }
      }
      return { origins, destinations, cells, provider: "google" };
    }
  };
}
