export interface MedusaRouteRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  scope?: unknown;
}

export interface MedusaRouteResponse {
  status(code: number): MedusaRouteResponse;
  json(payload: unknown): void;
}
