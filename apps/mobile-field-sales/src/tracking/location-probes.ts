import * as Location from "expo-location";
import type { BackgroundPermission, ForegroundPermission } from "./consent-policy";

function mapStatus(status: Location.PermissionStatus): "granted" | "denied" | "unknown" {
  if (status === Location.PermissionStatus.GRANTED) return "granted";
  if (status === Location.PermissionStatus.DENIED) return "denied";
  return "unknown";
}

export async function probeForegroundLocationPermission(): Promise<ForegroundPermission> {
  const result = await Location.getForegroundPermissionsAsync();
  return mapStatus(result.status);
}

/**
 * Background probe: only checks current state. Never requests — the
 * `useTrackingConsent` policy decides when to ask, and the UI must explicitly
 * call `requestBackgroundLocationPermission` after consent + foreground are in place.
 */
export async function probeBackgroundLocationPermission(): Promise<BackgroundPermission> {
  const result = await Location.getBackgroundPermissionsAsync();
  if (result.status === Location.PermissionStatus.GRANTED) return "granted";
  if (result.status === Location.PermissionStatus.DENIED) return "denied";
  return "not_requested";
}

export async function requestForegroundLocationPermission(): Promise<ForegroundPermission> {
  const result = await Location.requestForegroundPermissionsAsync();
  return mapStatus(result.status);
}

export async function requestBackgroundLocationPermission(): Promise<BackgroundPermission> {
  const result = await Location.requestBackgroundPermissionsAsync();
  if (result.status === Location.PermissionStatus.GRANTED) return "granted";
  if (result.status === Location.PermissionStatus.DENIED) return "denied";
  return "not_requested";
}

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number; accuracy?: number }> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? undefined
  };
}
