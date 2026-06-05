import type { Permission, Role, WorkSessionState } from "@orbit/shared-types";

export interface ActorContext {
  organisationId: string;
  role: Role;
  permissions: Permission[];
  userId?: string;
  managedTeamIds?: string[];
}

export interface RecordContext {
  organisationId: string;
  ownerUserId?: string;
  assignedTeamIds?: string[];
}

export interface AccessCheck {
  actor: ActorContext;
  record: RecordContext;
  action: Permission;
}

export function canAccessRecord({ actor, record, action }: AccessCheck): boolean {
  if (actor.role !== "platform_admin" && actor.organisationId !== record.organisationId) {
    return false;
  }

  if (!actor.permissions.includes(action)) {
    return false;
  }

  // Rep scope: enforce owner-only ONLY when an owner is named. Tenant-scoped
  // operations (no ownerUserId) rely on the permission grant alone.
  if (actor.role === "field_sales_representative" && record.ownerUserId !== undefined) {
    return record.ownerUserId === actor.userId;
  }

  if (actor.role === "sales_manager" && record.assignedTeamIds?.length && actor.managedTeamIds?.length) {
    return record.assignedTeamIds.some((teamId) => actor.managedTeamIds?.includes(teamId));
  }

  return true;
}

export interface LocationSendContext {
  role: Role;
  consentAccepted: boolean;
  workSessionState: WorkSessionState;
}

export function canSendLocation(context: LocationSendContext): boolean {
  return (
    context.role === "field_sales_representative" &&
    context.consentAccepted &&
    context.workSessionState === "active"
  );
}
