export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteStop extends Coordinate {
  id: string;
  expectedDurationMinutes: number;
  priority: number;
}

export interface OptimiseRouteInput {
  start: Coordinate;
  stops: RouteStop[];
  workingWindow: {
    startsAt: string;
    endsAt: string;
  };
  /**
   * When true, the route is a round trip that returns to `start` (the rep's
   * home base) after the last stop — so the final leg brings them home. The
   * returned {@link OptimisedRoute.returnHome} carries that leg.
   */
  returnToStart?: boolean;
}

/** Drive time/distance for a single leg of the route (between two points). */
export interface RouteLeg {
  driveMinutes: number;
  distanceMeters: number;
}

export interface OptimisedRoute {
  orderedStops: RouteStop[];
  totalDistanceMeters: number;
  totalDurationMinutes: number;
  provider: string;
  providerReference: string;
  /**
   * The actual driving path that follows roads, as an ordered list of points
   * (start → each stop in visiting order). Populated by real routing engines
   * (OSRM/Mapbox/Google); absent for the mock provider, in which case clients
   * fall back to drawing straight lines between stops.
   */
  routeGeometry?: Coordinate[];
  /**
   * Drive leg INTO each ordered stop — `legs[i]` is the travel from the previous
   * point to `orderedStops[i]`. Lets the client show per-stop ETA. Absent for
   * providers that don't return per-leg timing.
   */
  legs?: RouteLeg[];
  /** The final leg back to `start` when {@link OptimiseRouteInput.returnToStart} is set. */
  returnHome?: RouteLeg;
}

export interface GeocodeResult {
  formattedAddress: string;
  coordinate: Coordinate;
  /** 0–1, provider-specific confidence. */
  confidence: number;
  provider: string;
}

export interface ReverseGeocodeResult {
  formattedAddress: string;
  coordinate: Coordinate;
  provider: string;
}

export interface DistanceMatrixCell {
  fromIndex: number;
  toIndex: number;
  distanceMeters: number;
  durationMinutes: number;
}

export interface DistanceMatrixResult {
  origins: Coordinate[];
  destinations: Coordinate[];
  cells: DistanceMatrixCell[];
  provider: string;
}

export interface MapsProvider {
  /** Route optimisation. */
  optimiseRoute(input: OptimiseRouteInput): Promise<OptimisedRoute>;

  /** Forward geocoding: street address → coordinate. */
  geocodeAddress(address: string): Promise<GeocodeResult>;

  /** Reverse geocoding: coordinate → street address. */
  reverseGeocode(coordinate: Coordinate): Promise<ReverseGeocodeResult>;

  /** Many-to-many distance / duration matrix. */
  calculateDistanceMatrix(
    origins: Coordinate[],
    destinations: Coordinate[]
  ): Promise<DistanceMatrixResult>;

  /** Synchronous Haversine helper for ad-hoc distance work that doesn't need a network call. */
  calculateDistanceMeters(a: Coordinate, b: Coordinate): number;

  /** Deep link / URL that opens an external map app with the destination prefilled. */
  generateNavigationLink(destination: Coordinate): string;
}
