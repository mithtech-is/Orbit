import type { Coordinate, RouteStop } from "./provider.js";

/**
 * Shared visiting-order heuristic used by every provider that needs to decide
 * the SEQUENCE of stops (mock + OSRM). The ordering goal is the one reps expect:
 *
 *   1. Start the day at the outlet PHYSICALLY NEAREST to where the rep is.
 *   2. Fan outward from there with a 2-opt/or-opt refined sweep.
 *
 * Crucially the nearest stop is PINNED to position #1 — a pure travel-time TSP
 * (what OSRM's /trip returns) will happily bury the closest shop in the middle
 * of the tour to shave a minute off the total, which reads as "why is the
 * farthest shop first?" to a rep looking at the map. We optimise everything
 * AFTER the first stop instead, so the route always begins with the shop next
 * door and the rest is de-tangled.
 *
 * Distances are great-circle (Haversine). Providers with a real road network
 * (OSRM) take this order and fetch road geometry / per-leg times for it, rather
 * than letting the engine re-order.
 */

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Great-circle distance in metres between two coordinates. */
export function greatCircleMeters(a: Coordinate, b: Coordinate): number {
  const latDelta = toRadians(b.latitude - a.latitude);
  const lonDelta = toRadians(b.longitude - a.longitude);
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function nextStop(current: Coordinate, candidates: RouteStop[]): RouteStop {
  return [...candidates].sort((a, b) => {
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return greatCircleMeters(current, a) - greatCircleMeters(current, b);
  })[0];
}

/**
 * Nearest-neighbour seed tour. Sorts candidates by priority (higher first),
 * breaks ties by great-circle distance from the current position, and walks the
 * list greedily.
 */
function nearestNeighbourTour(start: Coordinate, stops: RouteStop[]): RouteStop[] {
  const remaining = [...stops];
  const ordered: RouteStop[] = [];
  let current: Coordinate = start;

  while (remaining.length > 0) {
    const selected = nextStop(current, remaining);
    ordered.push(selected);
    current = selected;
    remaining.splice(
      remaining.findIndex((stop) => stop.id === selected.id),
      1
    );
  }

  return ordered;
}

/**
 * 2-opt local search on `[start, ordered...]` restricted to `[lo, hi]`. Reverses
 * the segment between every pair (i, j) and keeps the swap only when it shortens
 * the tour. The O(1) delta uses just the four affected vertices.
 */
function twoOptInRange(start: Coordinate, ordered: RouteStop[], lo: number, hi: number): RouteStop[] {
  const n = ordered.length;
  if (hi - lo < 1) return ordered;

  const stops = [...ordered];
  const prev = (idx: number): Coordinate => (idx === 0 ? start : stops[idx - 1]);

  let improved = true;
  const rangeLength = hi - lo + 1;
  let remainingPasses = Math.max(1, rangeLength * rangeLength);

  while (improved && remainingPasses > 0) {
    improved = false;
    remainingPasses -= 1;

    for (let i = lo; i < hi; i++) {
      for (let j = i + 1; j <= hi; j++) {
        const a = prev(i);
        const b = stops[i];
        const c = stops[j];
        const next = j + 1 < n ? stops[j + 1] : null;

        const before = greatCircleMeters(a, b) + (next ? greatCircleMeters(c, next) : 0);
        const after = greatCircleMeters(a, c) + (next ? greatCircleMeters(b, next) : 0);

        if (after + 1e-9 < before) {
          stops.splice(i, j - i + 1, ...stops.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return stops;
}

/**
 * Or-opt local search on `[start, ordered...]` restricted to `[lo, hi]`. Relocates
 * a short run of `segLen` consecutive stops (1–3) elsewhere in the range, keeping
 * the run's internal order — the moves 2-opt can't make.
 */
function orOptInRange(start: Coordinate, ordered: RouteStop[], lo: number, hi: number, segLen: number): RouteStop[] {
  const stops = [...ordered];
  const at = (idx: number): Coordinate => (idx < 0 ? start : stops[idx]);
  const edge = (i: number, j: number): number => greatCircleMeters(at(i), at(j));

  let improved = true;
  let budget = Math.max(1, (hi - lo + 1) * (hi - lo + 1));

  while (improved && budget-- > 0) {
    improved = false;
    for (let i = lo; i + segLen - 1 <= hi; i++) {
      const segStart = i;
      const segEnd = i + segLen - 1;
      const removed =
        edge(segStart - 1, segStart) +
        (segEnd + 1 <= hi ? edge(segEnd, segEnd + 1) : 0) -
        (segEnd + 1 <= hi ? greatCircleMeters(at(segStart - 1), at(segEnd + 1)) : 0);

      for (let k = lo - 1; k <= hi; k++) {
        if (k >= segStart - 1 && k <= segEnd) continue; // skip its own neighbourhood
        const afterNode = at(k);
        const succ = k + 1 <= hi && (k + 1 < segStart || k + 1 > segEnd) ? at(k + 1) : null;
        const added =
          greatCircleMeters(afterNode, at(segStart)) +
          (succ ? greatCircleMeters(at(segEnd), succ) : 0) -
          (succ ? greatCircleMeters(afterNode, succ) : 0);

        if (added + 1e-9 < removed) {
          const segment = stops.splice(segStart, segLen);
          let insertAt = k < segStart ? k + 1 : k + 1 - segLen;
          if (insertAt < lo) insertAt = lo;
          stops.splice(insertAt, 0, ...segment);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return stops;
}

/** Alternate 2-opt (reverse) and Or-opt (relocate runs of 1–3) until neither improves. */
function localSearchInRange(start: Coordinate, ordered: RouteStop[], lo: number, hi: number): RouteStop[] {
  if (hi - lo < 1) return ordered;
  let stops = ordered;
  let prevTotal = Infinity;
  for (let round = 0; round < 12; round++) {
    stops = twoOptInRange(start, stops, lo, hi);
    stops = orOptInRange(start, stops, lo, hi, 1);
    stops = orOptInRange(start, stops, lo, hi, 2);
    stops = orOptInRange(start, stops, lo, hi, 3);
    const total = totalTourDistanceMeters(start, stops);
    if (total + 1e-6 >= prevTotal) break; // converged
    prevTotal = total;
  }
  return stops;
}

/**
 * Apply local search within contiguous equal-priority spans, never crossing a
 * priority boundary. The very first stop overall is PINNED (the first block's
 * range starts at index 1) so the nearest outlet stays in pole position.
 */
function refineWithinPriorityBlocks(start: Coordinate, ordered: RouteStop[]): RouteStop[] {
  if (ordered.length < 2) return ordered;

  let stops = [...ordered];
  let i = 0;
  while (i < stops.length) {
    let j = i;
    while (j + 1 < stops.length && stops[j + 1].priority === stops[i].priority) {
      j += 1;
    }
    const lo = i === 0 ? 1 : i; // pin the global first stop (nearest to start)
    if (j > lo) {
      stops = localSearchInRange(start, stops, lo, j);
    }
    i = j + 1;
  }
  return stops;
}

/** Total great-circle distance of the chain start → ordered[0] → … → last. */
export function totalTourDistanceMeters(start: Coordinate, ordered: RouteStop[]): number {
  let total = 0;
  let prev: Coordinate = start;
  for (const stop of ordered) {
    total += greatCircleMeters(prev, stop);
    prev = stop;
  }
  return total;
}

/**
 * Order stops so the rep visits the NEAREST first (pinned), then a 2-opt/or-opt
 * refined sweep of the remainder. Priority-aware: higher-priority stops always
 * precede lower-priority ones. Returns a new array; never mutates the input.
 */
export function orderStopsNearestFirst(start: Coordinate, stops: RouteStop[]): RouteStop[] {
  if (stops.length <= 1) return [...stops];
  const seed = nearestNeighbourTour(start, stops);
  return refineWithinPriorityBlocks(start, seed);
}
