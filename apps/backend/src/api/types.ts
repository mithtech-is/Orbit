export interface AppRouteRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  scope?: unknown;
}

export interface AppRouteResponse {
  status(code: number): AppRouteResponse;
  json(payload: unknown): void;
}
