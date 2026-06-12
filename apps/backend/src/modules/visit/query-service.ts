import type { VisitRow } from "./repository.js";

export interface VisitSummary {
  id: string;
  organisationId: string;
  outletId: string;
  assignedUserId: string;
  visitDate: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  geofenceStatus: string | null;
}

export function toVisitSummary(row: VisitRow): VisitSummary {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    outletId: row.outlet_id,
    assignedUserId: row.assigned_user_id,
    visitDate: row.visit_date,
    status: row.status,
    outcome: row.outcome,
    notes: row.notes,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    geofenceStatus: row.geofence_status
  };
}
