type Role =
  | "platform_admin"
  | "organisation_admin"
  | "sales_manager"
  | "field_sales_representative"
  | "operations_user"
  | "readonly_analyst";

type Permission =
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

export interface AuthenticatedActor {
  userId: string;
  organisationId: string;
  role: Role;
  permissions: Permission[];
  managedTeamIds?: string[];
}

export interface TenantRecordScope {
  organisationId: string;
  ownerUserId?: string;
  assignedTeamIds?: string[];
}

export class AuthorisationError extends Error {
  readonly statusCode = 403;

  constructor(message = "Forbidden") {
    super(message);
  }
}

export function requireTenantPermission(
  actor: AuthenticatedActor,
  record: TenantRecordScope,
  permission: Permission
): void {
  const allowed = canAccessRecord(actor, record, permission);

  if (!allowed) {
    throw new AuthorisationError();
  }
}

function canAccessRecord(actor: AuthenticatedActor, record: TenantRecordScope, action: Permission): boolean {
  if (actor.role !== "platform_admin" && actor.organisationId !== record.organisationId) {
    return false;
  }

  if (!actor.permissions.includes(action)) {
    return false;
  }

  // Rep scope: when the caller names an explicit owner, enforce rep-owned-only.
  // When `ownerUserId` is omitted the record is tenant-scoped (e.g. listing
  // outlets or leads inside the rep's org) — the permission grant alone is
  // sufficient. This matches the RBAC matrix: reps with `outlet:read` see
  // outlets across the tenant; the per-row "assigned" filter is applied by
  // the query layer, not the auth gate.
  if (actor.role === "field_sales_representative" && record.ownerUserId !== undefined) {
    return record.ownerUserId === actor.userId;
  }

  if (actor.role === "sales_manager" && record.assignedTeamIds?.length && actor.managedTeamIds?.length) {
    return record.assignedTeamIds.some((teamId) => actor.managedTeamIds?.includes(teamId));
  }

  return true;
}

export function actorFromHeaders(headers: Record<string, string | string[] | undefined>): AuthenticatedActor {
  const role = headerValue(headers["x-field-sales-role"]) as Role;
  const userId = headerValue(headers["x-field-sales-user-id"]);
  const organisationId = headerValue(headers["x-field-sales-organisation-id"]);
  const permissions = headerValue(headers["x-field-sales-permissions"])
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean) as Permission[];

  if (!role || !userId || !organisationId) {
    throw new AuthorisationError("Missing authentication context");
  }

  return {
    role,
    userId,
    organisationId,
    permissions
  };
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
