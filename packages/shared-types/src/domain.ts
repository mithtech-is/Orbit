export type Role =
  | "platform_admin"
  | "organisation_admin"
  | "sales_manager"
  | "field_sales_representative"
  | "operations_user"
  | "readonly_analyst";

export type Permission =
  | "organisation:manage"
  | "user:manage"
  | "team:manage"
  | "lead:read"
  | "lead:write"
  | "outlet:read"
  | "outlet:write"
  | "territory:manage"
  | "route:plan"
  | "visit:write"
  | "tracking:send"
  | "tracking:view_live"
  | "order:create"
  | "report:read"
  | "audit:read"
  | "policy:manage";

export type WorkSessionState = "not_started" | "active" | "paused" | "stopped";

export interface TenantScopedRecord {
  organisationId: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface RouteStopInput extends GeoPoint {
  id: string;
  expectedDurationMinutes: number;
  priority: number;
}

export interface DemoUser {
  id: string;
  organisationId: string;
  email: string;
  name: string;
  role: Role;
}
