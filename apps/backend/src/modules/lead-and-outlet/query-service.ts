export interface OutletSummary {
  id: string;
  organisationId: string;
  name: string;
  latitude: number;
  longitude: number;
  lastVisitedAt?: string | null;
  visitCount?: number;
}

export interface OutletRow {
  id: string;
  organisation_id: string;
  name: string;
  latitude: string | number;
  longitude: string | number;
  last_visited_at?: string | null;
  visit_count?: string | number | null;
}

export interface LeadSummary {
  id: string;
  organisationId: string;
  outletId: string;
  name: string;
  status: string;
  priority: number;
  assignedUserId: string;
  /** Resolved display name of the assigned rep (null when unassigned) — so the
   *  UI never needs a separate user-directory fetch to show who owns the lead. */
  assignedUserName: string | null;
  /** Optional pinned location for the lead (null until captured on the map). */
  latitude: number | null;
  longitude: number | null;
}

export interface LeadRow {
  id: string;
  organisation_id: string;
  outlet_id: string;
  name: string;
  status: string;
  priority: number;
  assigned_user_id: string;
  assigned_user_name: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
}

export interface LeadAndOutletRepository {
  queryOutlets(organisationId: string): Promise<OutletRow[]>;
  queryLeads(organisationId: string): Promise<LeadRow[]>;
}

export function filterTenantOutlets(outlets: OutletSummary[], organisationId: string): OutletSummary[] {
  return outlets.filter((outlet) => outlet.organisationId === organisationId);
}

export async function listTenantOutlets(
  repository: Pick<LeadAndOutletRepository, "queryOutlets">,
  organisationId: string
): Promise<OutletSummary[]> {
  const rows = await repository.queryOutlets(organisationId);

  return rows.map((row) => ({
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    lastVisitedAt: row.last_visited_at ?? null,
    visitCount: row.visit_count !== null && row.visit_count !== undefined ? Number(row.visit_count) : 0
  }));
}

export async function listTenantLeads(
  repository: Pick<LeadAndOutletRepository, "queryLeads">,
  organisationId: string
): Promise<LeadSummary[]> {
  const rows = await repository.queryLeads(organisationId);

  return rows.map((row) => ({
    id: row.id,
    organisationId: row.organisation_id,
    outletId: row.outlet_id,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name ?? null,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null
  }));
}

export function assignLeadToRep(lead: LeadSummary, organisationId: string, repUserId: string): LeadSummary {
  if (lead.organisationId !== organisationId) {
    throw new Error("Cannot assign a lead outside the active organisation");
  }

  return {
    ...lead,
    assignedUserId: repUserId,
    status: "assigned"
  };
}
