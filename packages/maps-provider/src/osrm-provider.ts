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
import { orderStopsNearestFirst } from "./route-ordering.js";

export interface OsrmProviderOptions {
  /** OSRM HTTP base, e.g., http://router.project-osrm.org or a self-hosted node. */
  osrmBaseUrl?: string;
  /** Nominatim base for geocoding, e.g., https://nominatim.openstreetmap.org. */
  nominatimBaseUrl?: string;
  /** Required by Nominatim usage policy — your app's contact email or User-Agent. */
  userAgent: string;
  fetcher?: typeof fetch;
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
 * Real OSRM + Nominatim MapsProvider. No API key required — but if you use the
 * public hosts you must respect their usage policies (low QPS, real User-Agent,
 * no abuse). For production self-host OSRM + Nominatim and override the URLs.
 */
export function createOsrmMapsProvider(opts: OsrmProviderOptions): MapsProvider {
  if (!opts.userAgent) throw new Error("OSRM provider requires userAgent");
  const osrm = (opts.osrmBaseUrl ?? "https://router.project-osrm.org").replace(/\/$/, "");
  const nominatim = (opts.nominatimBaseUrl ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  const fetcher = opts.fetcher ?? fetch;
  const headers = { "User-Agent": opts.userAgent, "Accept": "application/json" };

  async function getJson(url: string): Promise<unknown> {
    const response = await fetcher(url, { headers });
    if (!response.ok) throw new Error(`OSRM request failed: ${response.status} ${url}`);
    return response.json();
  }

  return {
    calculateDistanceMeters: haversineMeters,

    generateNavigationLink(destination) {
      return `https://www.openstreetmap.org/?mlat=${destination.latitude}&mlon=${destination.longitude}#map=18/${destination.latitude}/${destination.longitude}`;
    },

    async optimiseRoute(input: OptimiseRouteInput): Promise<OptimisedRoute> {
      if (input.stops.length === 0) {
        return {
          orderedStops: [],
          totalDistanceMeters: 0,
          totalDurationMinutes: 0,
          provider: "osrm",
          providerReference: "empty"
        };
      }
      // Decide the visiting ORDER ourselves: nearest-first with the closest stop
      // PINNED to #1 (see orderStopsNearestFirst). We deliberately do NOT use
      // OSRM's /trip optimiser for ordering — it minimises pure travel time and
      // routinely buries the shop closest to the rep in the middle of the tour,
      // which reads as "why is the farthest one first?". OSRM is used only to
      // draw the road-following path and TIME each leg of THIS fixed order.
      const ordered = orderStopsNearestFirst(input.start, input.stops);
      const roundtrip = input.returnToStart === true;
      // Round trip appends the start again so the final leg is the drive home.
      const path = [input.start, ...ordered, ...(roundtrip ? [input.start] : [])];
      // /route follows the coordinates IN ORDER (no re-optimisation). overview=full
      // + geometries=geojson → the full street-by-street polyline.
      const url = `${osrm}/route/v1/driving/${coords(path)}?overview=full&geometries=geojson`;
      const data = (await getJson(url)) as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry?: { coordinates?: [number, number][] };
          legs?: Array<{ distance: number; duration: number }>;
        }>;
      };
      const route = data.routes?.[0];
      if (!route) throw new Error("OSRM returned no route");
      // GeoJSON coordinates are [lng, lat]; convert to our {latitude, longitude}.
      const routeGeometry: Coordinate[] | undefined = Array.isArray(route.geometry?.coordinates)
        ? route.geometry!.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
        : undefined;
      // legs[i] is the drive from path[i] to path[i+1]: legs[0] = start → stop 0,
      // …, and (round trip only) the final leg = last stop → home.
      const legObjs = (route.legs ?? []).map((l) => ({
        driveMinutes: Math.max(1, Math.ceil(l.duration / 60)),
        distanceMeters: Math.round(l.distance)
      }));
      const legs = legObjs.slice(0, ordered.length);
      const returnHome = roundtrip ? legObjs[ordered.length] : undefined;
      const visitDuration = ordered.reduce((sum, s) => sum + s.expectedDurationMinutes, 0);
      return {
        orderedStops: ordered,
        totalDistanceMeters: Math.round(route.distance),
        totalDurationMinutes: visitDuration + Math.ceil(route.duration / 60),
        provider: "osrm",
        providerReference: `osrm-route-${Date.now()}`,
        routeGeometry,
        legs,
        returnHome
      };
    },

    async geocodeAddress(address: string): Promise<GeocodeResult> {
      const url = `${nominatim}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const data = (await getJson(url)) as Array<{
        lat: string; lon: string; display_name?: string; importance?: number;
      }>;
      const first = data[0];
      if (!first) throw new Error(`Nominatim found no result for ${address}`);
      return {
        formattedAddress: first.display_name ?? address,
        coordinate: { latitude: Number(first.lat), longitude: Number(first.lon) },
        confidence: typeof first.importance === "number" ? Math.min(1, first.importance) : 0.5,
        provider: "osrm"
      };
    },

    async reverseGeocode(coordinate: Coordinate): Promise<ReverseGeocodeResult> {
      const url = `${nominatim}/reverse?lat=${coordinate.latitude}&lon=${coordinate.longitude}&format=json`;
      const data = (await getJson(url)) as { display_name?: string };
      return {
        formattedAddress: data.display_name ?? `(${coordinate.latitude}, ${coordinate.longitude})`,
        coordinate,
        provider: "osrm"
      };
    },

    async calculateDistanceMatrix(origins: Coordinate[], destinations: Coordinate[]): Promise<DistanceMatrixResult> {
      const all = [...origins, ...destinations];
      const sources = origins.map((_, i) => i).join(";");
      const destIdx = destinations.map((_, i) => i + origins.length).join(";");
      const url = `${osrm}/table/v1/driving/${coords(all)}` +
        `?sources=${sources}&destinations=${destIdx}&annotations=distance,duration`;
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
      return { origins, destinations, cells, provider: "osrm" };
    }
  };
}
