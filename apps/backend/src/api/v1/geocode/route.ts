import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { loadMapsProvider } from "../../../modules/route-planning/repository.js";

function queryParam(req: AppRouteRequest, key: string): string | null {
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  return url.searchParams.get(key);
}

/**
 * GET /api/v1/geocode?q=<address>        → forward geocode (address → coordinate)
 * GET /api/v1/geocode?lat=<>&lng=<>      → reverse geocode (coordinate → address)
 *
 * Lets the UI offer address search / "drop a pin" instead of asking users to type
 * raw latitude/longitude. Uses the org's configured maps provider (Google / Mapbox /
 * OSRM+Nominatim), so it respects the same routing/geocoding source as everything else.
 * Any signed-in user may call it (it's a stateless utility, not org data).
 */
export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  authenticateRequest(req);

  const q = queryParam(req, "q");
  const latStr = queryParam(req, "lat");
  const lngStr = queryParam(req, "lng");

  let provider;
  try {
    provider = await loadMapsProvider();
  } catch (err) {
    res.status(503).json({ code: "geocoder_unavailable", message: err instanceof Error ? err.message : "Geocoding is not configured." });
    return;
  }

  try {
    if (q && q.trim()) {
      const r = await provider.geocodeAddress(q.trim());
      res.status(200).json({
        latitude: r.coordinate.latitude,
        longitude: r.coordinate.longitude,
        label: r.formattedAddress,
        confidence: r.confidence,
        provider: r.provider
      });
      return;
    }

    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const r = await provider.reverseGeocode({ latitude: lat, longitude: lng });
      res.status(200).json({
        latitude: r.coordinate.latitude,
        longitude: r.coordinate.longitude,
        label: r.formattedAddress,
        provider: r.provider
      });
      return;
    }

    res.status(400).json({ code: "validation_error", message: "Provide ?q=<address> for search, or ?lat=&lng= for reverse lookup." });
  } catch (err) {
    res.status(502).json({ code: "geocode_failed", message: err instanceof Error ? err.message : "Could not look up that location." });
  }
}
