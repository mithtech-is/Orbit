import type { IncomingHttpHeaders } from "node:http";
import type { MedusaRouteRequest, MedusaRouteResponse } from "./types.js";

/**
 * Shim between Medusa v2's `MedusaRequest` / `MedusaResponse` (Express-shaped)
 * and our custom `MedusaRouteRequest` / `MedusaRouteResponse` used by
 * `dev-server.ts`.
 *
 * Same handler bodies can therefore mount under EITHER runtime:
 *
 *   // dev-server.ts (today)
 *   await getOutlets(routeRequest, routeResponse);
 *
 *   // src/api/v1/outlets/route.ts (when running under `medusa develop`)
 *   import { mountMedusaRoute } from "../../medusa-adapter";
 *   import { GET as legacyGet } from "./route.js";
 *   export const GET = mountMedusaRoute(legacyGet);
 *
 * Once the Medusa-native runtime is the production runtime, each
 * `src/api/v1/*` file's exports get wrapped via `mountMedusaRoute`. The
 * underlying handler bodies do not change.
 */

interface MinimalMedusaRequest {
  headers?: IncomingHttpHeaders;
  body?: unknown;
  url?: string;
  originalUrl?: string;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
}

interface MinimalMedusaResponse {
  status(code: number): MinimalMedusaResponse;
  json(payload: unknown): unknown;
  setHeader?(name: string, value: string): void;
}

export function mountMedusaRoute(
  handler: (req: MedusaRouteRequest, res: MedusaRouteResponse) => unknown | Promise<unknown>
) {
  return async (req: MinimalMedusaRequest, res: MinimalMedusaResponse): Promise<void> => {
    const rawUrl = req.url ?? req.originalUrl ?? "";

    const routeReq: MedusaRouteRequest = {
      headers: { ...(req.headers ?? {}), "x-request-url": rawUrl },
      body: req.body
    };

    // Pre-bake `x-resource-id` when Medusa already parsed a `:id` segment.
    if (req.params?.id) {
      routeReq.headers["x-resource-id"] = req.params.id;
    }

    let buffered: { status: number; payload: unknown } | undefined;
    const routeRes: MedusaRouteResponse = {
      status(code) {
        if (!buffered) buffered = { status: code, payload: undefined };
        else buffered.status = code;
        return this;
      },
      json(payload) {
        if (!buffered) buffered = { status: 200, payload };
        else buffered.payload = payload;
      }
    };

    await handler(routeReq, routeRes);

    if (!buffered) return; // handler responded directly to res
    res.status(buffered.status).json(buffered.payload ?? null);
  };
}
