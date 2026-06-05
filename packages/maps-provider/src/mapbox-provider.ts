import type {
  Coordinate,
  DistanceMatrixCell,
  DistanceMatrixResult,
  GeocodeResult,
  MapsProvider,
  OptimiseRouteInput,
  OptimisedRoute,
  ReverseGeocodeResult
} from "./provider.js";

export interface MapboxProviderOptions {
  accessToken: string;
  fetcher?: typeof fetch;
  /** Override base URL for tests. */
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

function coords(list: Coordinate[]): string {
  return list.map((c) => `${c.longitude},${c.latitude}`).join(";");
}

/**
 * Real Mapbox-backed MapsProvider. Calls:
 *   - Geocoding v5 (forward + reverse)
 *   - Optimized Trips v1 (route optimisation)
 *   - Directions Matrix v1 (distance / duration matrix)
 *
 * Reads `accessToken` (required). Pass a custom `fetcher` for tests.
 */
export function createMapboxMapsProvider(opts: MapboxProviderOptions): MapsProvider {
  if (!opts.accessToken) throw new Error("Mapbox provider requires accessToken");
  const fetcher = opts.fetcher ?? fetch;
  const base = (opts.baseUrl ?? "https://api.mapbox.com").replace(/\/$/, "");

  async function getJson(url: string): Promise<unknown> {
    const response = await fetcher(url);
    if (!response.ok) {
      throw new Error(`Mapbox request failed: ${response.status} ${url}`);
    }
    return response.json();
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
          provider: "mapbox",
          providerReference: "empty"
        };
      }
      const allCoords = [input.start, ...input.stops];
      const url = `${base}/optimized-trips/v1/mapbox/driving/${coords(allCoords)}` +
        `?source=first&roundtrip=false&access_token=${opts.accessToken}`;
      const data = (await getJson(url)) as {
        trips?: Array<{ distance: number; duration: number }>;
        waypoints?: Array<{ waypoint_index: number; trips_index: number }>;
      };
      const trip = data.trips?.[0];
      const waypoints = data.waypoints ?? [];
      if (!trip || waypoints.length === 0) {
        throw new Error("Mapbox returned no trip");
      }
      // Each entry in `waypoints` is in INPUT order; its `waypoint_index` is the
      // position in the OPTIMISED trip. Drop the start (input index 0), then
      // order the remaining waypoints by trip position ascending.
      const orderedStops = waypoints
        .map((wp, inputIdx) => ({ ...wp, inputIdx }))
        .filter((wp) => wp.inputIdx > 0)
        .sort((a, b) => a.waypoint_index - b.waypoint_index)
        .map((wp) => input.stops[wp.inputIdx - 1])
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      const visitDuration = orderedStops.reduce((sum, s) => sum + s.expectedDurationMinutes, 0);
      return {
        orderedStops,
        totalDistanceMeters: Math.round(trip.distance),
        totalDurationMinutes: visitDuration + Math.ceil(trip.duration / 60),
        provider: "mapbox",
        providerReference: `mapbox-trip-${Date.now()}`
      };
    },

    async geocodeAddress(address: string): Promise<GeocodeResult> {
      const url = `${base}/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
        `?limit=1&access_token=${opts.accessToken}`;
      const data = (await getJson(url)) as {
        features?: Array<{ center?: [number, number]; place_name?: string; relevance?: number }>;
      };
      const first = data.features?.[0];
      if (!first?.center) throw new Error(`Mapbox geocode found no result for ${address}`);
      const [longitude, latitude] = first.center;
      return {
        formattedAddress: first.place_name ?? address,
        coordinate: { latitude, longitude },
        confidence: typeof first.relevance === "number" ? first.relevance : 0.5,
        provider: "mapbox"
      };
    },

    async reverseGeocode(coordinate: Coordinate): Promise<ReverseGeocodeResult> {
      const url = `${base}/geocoding/v5/mapbox.places/${coordinate.longitude},${coordinate.latitude}.json` +
        `?limit=1&access_token=${opts.accessToken}`;
      const data = (await getJson(url)) as {
        features?: Array<{ place_name?: string }>;
      };
      const first = data.features?.[0];
      return {
        formattedAddress: first?.place_name ?? `(${coordinate.latitude}, ${coordinate.longitude})`,
        coordinate,
        provider: "mapbox"
      };
    },

    async calculateDistanceMatrix(origins: Coordinate[], destinations: Coordinate[]): Promise<DistanceMatrixResult> {
      const all = [...origins, ...destinations];
      const sources = origins.map((_, i) => i).join(";");
      const destIdx = destinations.map((_, i) => i + origins.length).join(";");
      const url = `${base}/directions-matrix/v1/mapbox/driving/${coords(all)}` +
        `?sources=${sources}&destinations=${destIdx}&annotations=distance,duration&access_token=${opts.accessToken}`;
      const data = (await getJson(url)) as {
        distances?: number[][];
        durations?: number[][];
      };
      const cells: DistanceMatrixCell[] = [];
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const distance = data.distances?.[i]?.[j] ?? 0;
          const duration = data.durations?.[i]?.[j] ?? 0;
          cells.push({
            fromIndex: i,
            toIndex: j,
            distanceMeters: Math.round(distance),
            durationMinutes: Math.max(1, Math.ceil(duration / 60))
          });
        }
      }
      return { origins, destinations, cells, provider: "mapbox" };
    }
  };
}
