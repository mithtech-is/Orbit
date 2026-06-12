/**
 * Pure geospatial helpers for insights/fraud. No DB, no clock — unit tested.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in metres. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Speed in km/h given a distance (m) and elapsed time (s). 0 elapsed → Infinity. */
export function speedKmh(distanceMeters: number, seconds: number): number {
  if (seconds <= 0) return Number.POSITIVE_INFINITY;
  return (distanceMeters / seconds) * 3.6;
}

export interface PingPoint {
  latitude: number;
  longitude: number;
  recordedAtMs: number;
}

export interface TravelAnomaly {
  distanceMeters: number;
  seconds: number;
  speedKmh: number;
}

/**
 * Detects "impossible travel" between two consecutive pings — a jump too fast
 * for any ground vehicle (default 200 km/h), the classic GPS-spoofing / shared-
 * device signal. Returns the anomaly when over threshold, else null. A tiny
 * minimum distance avoids flagging GPS jitter while stationary.
 */
export function detectImpossibleTravel(
  a: PingPoint,
  b: PingPoint,
  maxKmh = 200,
  minDistanceMeters = 250
): TravelAnomaly | null {
  const distance = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  if (distance < minDistanceMeters) return null;
  const seconds = Math.abs(b.recordedAtMs - a.recordedAtMs) / 1000;
  const kmh = speedKmh(distance, seconds);
  if (kmh <= maxKmh) return null;
  return { distanceMeters: Math.round(distance), seconds: Math.round(seconds), speedKmh: Math.round(kmh) };
}

/** Route adherence = visited planned stops / total planned stops, as a 0–100 integer. */
export function adherencePercent(plannedStops: number, visitedStops: number): number {
  if (plannedStops <= 0) return 0;
  return Math.round((Math.min(visitedStops, plannedStops) / plannedStops) * 100);
}
