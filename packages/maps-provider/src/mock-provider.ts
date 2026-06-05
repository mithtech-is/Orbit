import type {
  Coordinate,
  DistanceMatrixCell,
  DistanceMatrixResult,
  GeocodeResult,
  MapsProvider,
  OptimiseRouteInput,
  OptimisedRoute,
  ReverseGeocodeResult,
  RouteLeg
} from "./provider.js";
import { greatCircleMeters, orderStopsNearestFirst, totalTourDistanceMeters } from "./route-ordering.js";

/**
 * Deterministic mock provider used in local dev and tests. Returns reproducible
 * results derived from the input — never makes a network call and never reads
 * provider credentials, so it is safe to use when MAP_PROVIDER=mock or when no
 * upstream provider is configured.
 *
 * Ordering is the shared nearest-first heuristic (see {@link orderStopsNearestFirst}):
 * the nearest outlet is pinned to stop #1 and the remainder is 2-opt/or-opt
 * refined. For real road distances + traffic, switch MAP_PROVIDER to
 * mapbox/google/osrm.
 */
export function createMockMapsProvider(): MapsProvider {
  return {
    calculateDistanceMeters: greatCircleMeters,

    generateNavigationLink(destination) {
      return `https://maps.example.local/navigate?lat=${destination.latitude}&lng=${destination.longitude}`;
    },

    async optimiseRoute(input: OptimiseRouteInput): Promise<OptimisedRoute> {
      const refined = orderStopsNearestFirst(input.start, input.stops);
      // Distance of the visiting chain start → stop[0] → … → last stop.
      const chainDistanceMeters = totalTourDistanceMeters(input.start, refined);

      // Per-leg drive INTO each stop. No road network here, so estimate from the
      // great-circle distance at ~30 km/h city speed (≈ 500 m/min). Gives the
      // client real per-stop ETAs instead of generic placeholder text.
      const legs: RouteLeg[] = refined.map((stop, idx) => {
        const prev: Coordinate = idx === 0 ? input.start : refined[idx - 1];
        const d = greatCircleMeters(prev, stop);
        return { driveMinutes: Math.max(1, Math.ceil(d / 500)), distanceMeters: Math.round(d) };
      });

      // Round trip: close the loop back to start (the rep's home), so the final
      // leg brings them home. This is what lets a rep finish the day near home
      // instead of stranded at the last (possibly far) outlet.
      let returnHome: RouteLeg | undefined;
      let totalDistanceMeters = chainDistanceMeters;
      if (input.returnToStart && refined.length > 0) {
        const last = refined[refined.length - 1];
        const back = greatCircleMeters(last, input.start);
        returnHome = { driveMinutes: Math.max(1, Math.ceil(back / 500)), distanceMeters: Math.round(back) };
        totalDistanceMeters += back;
      }

      const visitDuration = refined.reduce((sum, stop) => sum + stop.expectedDurationMinutes, 0);
      const travelDuration = Math.ceil(totalDistanceMeters / 500);

      return {
        orderedStops: refined,
        totalDistanceMeters: Math.round(totalDistanceMeters),
        totalDurationMinutes: visitDuration + travelDuration,
        provider: "mock",
        providerReference: `mock-${refined.map((stop) => stop.id).join("-")}`,
        legs,
        returnHome
      };
    },

    async geocodeAddress(address): Promise<GeocodeResult> {
      const hash = simpleHash(address);
      const latitude = 12.9 + ((hash & 0xff) / 0xff) * 0.12;
      const longitude = 77.55 + (((hash >>> 8) & 0xff) / 0xff) * 0.15;
      return {
        formattedAddress: address,
        coordinate: { latitude: round(latitude, 6), longitude: round(longitude, 6) },
        confidence: 0.5,
        provider: "mock"
      };
    },

    async reverseGeocode(coordinate): Promise<ReverseGeocodeResult> {
      return {
        formattedAddress: `Mock address near (${round(coordinate.latitude, 4)}, ${round(coordinate.longitude, 4)})`,
        coordinate,
        provider: "mock"
      };
    },

    async calculateDistanceMatrix(origins, destinations): Promise<DistanceMatrixResult> {
      const cells: DistanceMatrixCell[] = [];
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const meters = greatCircleMeters(origins[i], destinations[j]);
          cells.push({
            fromIndex: i,
            toIndex: j,
            distanceMeters: Math.round(meters),
            durationMinutes: Math.max(1, Math.ceil(meters / 500))
          });
        }
      }
      return { origins, destinations, cells, provider: "mock" };
    }
  };
}

function simpleHash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
