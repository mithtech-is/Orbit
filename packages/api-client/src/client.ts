export interface ApiClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  headers?: Record<string, string>;
  token?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  organisationId: string;
}

/** Access area derived from role: "admin" = back-office console, "field" = rep app. */
export type AppArea = "admin" | "field";

export interface LoginResponse {
  token: string;
  userId: string;
  organisationId: string;
  name: string;
  email: string;
  role: string;
  area: AppArea;
  permissions: string[];
}

export interface SessionResponse {
  userId: string;
  organisationId: string;
  role: string;
  area: AppArea;
  permissions: string[];
}

export interface OrganisationStatusResponse {
  organisationId: string;
  status: "ready";
}

export interface ListResponse<T> {
  organisationId: string;
  dataSource: string;
  items: T[];
}

export interface OutletSummary {
  id: string;
  organisationId: string;
  name: string;
  latitude: number;
  longitude: number;
  lastVisitedAt?: string | null;
  visitCount?: number;
}

export interface LeadSummary {
  id: string;
  organisationId: string;
  outletId: string;
  name: string;
  status: string;
  priority: number;
  assignedUserId: string;
  /** Resolved display name of the assigned rep (null when unassigned). */
  assignedUserName: string | null;
  /** Optional pinned location captured on the map (null when unset). */
  latitude: number | null;
  longitude: number | null;
}

export interface TerritorySummary {
  id: string;
  organisationId: string;
  name: string;
  bounds: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
}

export interface CreateOutletInput {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface GeocodeResponse {
  latitude: number;
  longitude: number;
  label: string;
  confidence?: number;
  provider: string;
}

export interface CreateLeadInput {
  id?: string;
  outletId: string;
  name: string;
  status?: string;
  priority?: number;
  assignedUserId?: string;
  /** Optional pinned location captured on the map. */
  latitude?: number | null;
  longitude?: number | null;
}

/** Richer-capture data attached to a visit (GET /api/v1/visits/:id/extras). */
export interface VisitExtras {
  organisationId: string;
  visitId: string;
  feedbackRating: number | null;
  npsScore: number | null;
  feedbackText: string | null;
  signedBy: string | null;
  signaturePath: string | null;
  proofPhotos: VisitProofPhoto[];
  totalExpenseCents: number;
  expenses: Array<{ id: string; category: string; amountCents: number; kms: number | null; note: string | null }>;
  competitorIntel: Array<{ id: string; competitorName: string; productName: string | null; priceCents: number | null; promo: string | null; note: string | null }>;
  samples: Array<{ id: string; itemName: string; quantity: number; recipientName: string | null; note: string | null }>;
}

export interface VisitProofPhoto {
  id: string;
  contentType: string;
  caption: string | null;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

/** Input for the richer-capture extras sent in a visit.check_out mutation payload. */
export interface VisitExtrasInput {
  feedbackRating?: number | null;
  npsScore?: number | null;
  feedbackText?: string | null;
  signedBy?: string | null;
  signaturePath?: string | null;
  proofPhotoIds?: string[];
  expenses?: Array<{ category: string; amountCents: number; kms?: number | null; note?: string | null }>;
  competitorIntel?: Array<{ competitorName: string; productName?: string | null; priceCents?: number | null; promo?: string | null; note?: string | null }>;
  samples?: Array<{ itemName: string; quantity: number; recipientName?: string | null; note?: string | null }>;
}

/** The authenticated user's own performance KPIs (GET /api/v1/me/analytics). */
export interface MyAnalytics {
  organisationId: string;
  userId: string;
  today: { visits: number; completed: number; offTarget: number };
  last7: { visits: number; completed: number; completionRate: number; activeDays: number };
  last30: { visits: number; completed: number; offTarget: number; ordersCount: number; orderValueCents: number; collectedCents: number };
  leads: { open: number; won: number };
  rank: { position: number; totalReps: number } | null;
  visitsPerDay: Array<{ date: string; visits: number; completed: number }>;
  /** Rich visit-detail roll-up for this rep over the last 30 days. */
  quality: { avgRating: number; ratedVisits: number; expensesCents: number; samples: number; competitorNotes: number };
}

/** Org-wide visit-quality roll-up (GET /api/v1/reports/visit-quality). */
export interface VisitQuality {
  organisationId: string;
  dataSource: "visit_quality";
  days: number;
  avgRating: number;
  ratedVisits: number;
  avgNps: number;
  npsResponses: number;
  expenseCents: number;
  samples: number;
  competitorNotes: number;
  topCompetitors: Array<{ name: string; mentions: number }>;
  expensesByCategory: Array<{ category: string; totalCents: number }>;
}

export interface CreateTerritoryInput {
  id?: string;
  name: string;
  /** WKT MultiPolygon in SRID 4326, e.g., "MULTIPOLYGON(((lng lat, ...)))". */
  boundaryWkt: string;
}

export interface OutletsInTerritoryResponse extends ListResponse<OutletSummary> {
  territoryId: string;
}

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

export interface CheckInInput {
  id?: string;
  outletId: string;
  latitude: number;
  longitude: number;
  outletLatitude?: number;
  outletLongitude?: number;
  geofenceRadiusMeters?: number;
}

export interface CheckInResponse {
  id: string;
  organisationId: string;
  outletId: string;
  assignedUserId: string;
  status: string;
  geofenceStatus: string;
  distanceFromOutletMeters: number;
}

export interface CheckOutInput {
  visitId: string;
  outcome?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export interface WorkSessionSummary {
  id: string;
  userId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  startedLatitude: number | null;
  startedLongitude: number | null;
}

export interface RecordConsentInput {
  granted: boolean;
}

export interface RecordConsentResponse {
  id: string;
  organisationId: string;
  userId: string;
  granted: boolean;
}

export interface StartSessionInput {
  latitude?: number;
  longitude?: number;
}

export interface StartSessionResponse {
  id: string;
  organisationId: string;
  userId: string;
  status: string;
  startedAt: string;
}

export interface LocationPingInput {
  id: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt?: string;
}

export interface RecordPingsResponse {
  organisationId: string;
  workSessionId: string;
  receivedCount: number;
  insertedCount: number;
  errors: Array<{ code: string; id?: string; value?: unknown }>;
}

export interface RevokeConsentResponse {
  organisationId: string;
  userId: string;
  consentRevoked: boolean;
  sessionStopped: boolean;
}

export interface SyncMutationInput {
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface SyncPushResponse {
  organisationId: string;
  deviceId: string;
  received: number;
  results: Array<{
    idempotencyKey: string;
    status: "applied" | "conflict" | "rejected" | string;
    result?: Record<string, unknown>;
    error?: string;
    conflictReason?: string;
  }>;
}

export interface SyncPullResponse<T = Record<string, unknown>> {
  organisationId: string;
  deviceId: string;
  resource: string;
  since: string;
  nextCursor: string;
  count: number;
  items: T[];
}

export interface SyncConflict {
  id: string;
  organisationId: string;
  idempotencyKey: string;
  mutationType: string;
  reason: string;
  clientPayload: Record<string, unknown>;
  serverState: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  status: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeedResponse extends ListResponse<NotificationItem> {
  unreadCount: number;
}

export interface UploadInput {
  category: string;
  visitId?: string;
  contentType: string;
  dataBase64: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
}

export interface UploadResponse {
  id: string;
  category: string;
  visitId: string | null;
  contentType: string;
  sizeBytes: number;
  url: string;
}

export interface UploadObjectResponse {
  id: string;
  contentType: string;
  caption: string | null;
  dataBase64: string;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  passwordChangeRequired: boolean;
  /** Vehicle assignment + per-rep fuel-rate override (null = inherit cascade). */
  vehicleTypeId?: string | null;
  fuelRatePerKmCents?: number | null;
}

export interface VehicleTypeSummary {
  id: string;
  organisationId: string;
  name: string;
  fuelRatePerKmCents: number;
  active: boolean;
  createdAt: string;
}

export interface FieldExpenseSummary {
  id: string;
  organisationId: string;
  repUserId: string;
  repName: string | null;
  workSessionId: string | null;
  expenseDate: string;
  category: string;
  actualDistanceKm: number;
  plannedDistanceKm: number;
  deviationKm: number;
  ratePerKmCents: number;
  amountCents: number;
  deviationAmountCents: number;
  overLimit: boolean;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface InviteUserInput {
  email: string;
  name: string;
  role: string;
  temporaryPassword?: string;
}

export interface InviteUserResponse {
  id: string;
  organisationId: string;
  email: string;
  name: string;
  role: string;
  temporaryPassword: string;
  passwordChangeRequired: boolean;
  message: string;
}

export interface OrganisationSettings {
  organisationId: string;
  geofenceRadiusMeters: number;
  rawLocationRetentionDays: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  currency: string;
  workingDays: string[];
  /** Org-wide default ₹/km in cents — the fallback in the rate cascade. */
  mileageRatePerKmCents: number;
  /** Daily fuel spend cap in cents (0 = no limit). */
  dailyFuelLimitCents: number;
}

export interface UpdateOrganisationSettingsInput {
  geofenceRadiusMeters?: number;
  rawLocationRetentionDays?: number;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  timezone?: string;
  currency?: string;
  workingDays?: string[];
  mileageRatePerKmCents?: number;
  dailyFuelLimitCents?: number;
}

export interface MyDayResponse {
  organisationId: string;
  userId: string;
  date: string;
  summary: {
    visitsAssigned: number;
    visitsCompleted: number;
    visitsRemaining: number;
    stopsPlanned: number;
    plannedDistanceMeters: number;
    plannedDurationMinutes: number;
    openLeads: number;
  };
  routePlans: RoutePlanDetail[];
  visits: Array<{
    id: string;
    outletId: string;
    outletName: string;
    outletLatitude: number | null;
    outletLongitude: number | null;
    status: string;
    visitDate: string;
    checkedInAt: string | null;
    checkedOutAt: string | null;
    geofenceStatus: string | null;
    outcome: string | null;
  }>;
  leads: Array<{
    id: string;
    name: string;
    status: string;
    priority: number;
    outletId: string;
    outletName: string;
  }>;
}

export interface ImpersonateResponse {
  token: string;
  userId: string;
  organisationId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  impersonatedBy: { userId: string };
}

export interface TeamSummary {
  id: string;
  name: string;
  memberIds: string[];
}

export interface ReportSummary {
  organisationId: string;
  outletCount: number;
  leadCount: number;
  visitCount: number;
  routePlanCount: number;
  orderCount: number;
  totalOrderCents: number;
  activeSessionCount: number;
  visitsPlannedToday: number;
  visitsCompletedToday: number;
  offTarget7d: number;
}

export interface OffTargetLeaderboard {
  organisationId: string;
  days: number;
  items: Array<{ userId: string; totalVisits: number; offTarget: number; offTargetPercent: number }>;
}
export interface ConversionFunnel {
  organisationId: string;
  stages: Array<{ key: string; label: string; count: number }>;
}
export interface TimeOnField {
  organisationId: string;
  date: string;
  items: Array<{ userId: string; visits: number; minutes: number }>;
}
export interface ReportTrends {
  organisationId: string;
  days: number;
  visitsPerDay: Array<{ date: string; visits: number; completed: number }>;
  visitsByOutcome: Array<{ outcome: string; count: number }>;
}

export interface RepActivityRow {
  repUserId: string;
  visitsTotal: number;
  visitsCompleted: number;
  geofenceExceptions: number;
  ordersTotal: number;
  orderTotalCents: number;
}

export interface ExpenseReport {
  organisationId: string;
  dataSource: string;
  from: string;
  to: string;
  totalExpenseCents: number;
  expenseCount: number;
  repTotals: Array<{
    repUserId: string;
    repName: string;
    totalExpenseCents: number;
    expenseCount: number;
    erpSyncedCount: number;
  }>;
  items: Array<{
    expenseId: string;
    visitId: string;
    visitDate: string;
    outletId: string;
    outletName: string;
    repUserId: string;
    repName: string;
    category: string;
    amountCents: number;
    kms: number | null;
    note: string | null;
    createdAt: string;
    erpSyncStatus: "synced" | "pending";
    erpId: string | null;
  }>;
}

export interface AuditEntry {
  id: string;
  organisationId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TrackingLocationRecordedEvent {
  type: "tracking.location.recorded";
  organisationId: string;
  repUserId: string;
  workSessionId: string;
  locationEventId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

export interface RouteStopDetail {
  id: string;
  outletId: string;
  outletName: string;
  outletLatitude: number;
  outletLongitude: number;
  stopOrder: number;
  status: string;
  expectedDurationMinutes: number;
  visitType?: string | null;
  objective?: string | null;
}

export interface RoutePlanDetail {
  id: string;
  organisationId: string;
  assignedUserId: string;
  routeDate: string;
  status: string;
  plannedDistanceMeters: number;
  plannedDurationMinutes: number;
  provider: string;
  stops: RouteStopDetail[];
}

export interface PreviewRouteInput {
  routeDate: string;
  repLatitude: number;
  repLongitude: number;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  stopIds: Array<{ outletId: string; expectedDurationMinutes?: number; priority?: number }>;
  /** Loop back to the start (home) after the last stop. */
  returnToStart?: boolean;
}

export interface PreviewedRouteResponse {
  provider: string;
  providerReference: string;
  totalDistanceMeters: number;
  totalDurationMinutes: number;
  startsAt: string;
  endsAt: string;
  orderedStops: Array<{
    outletId: string;
    outletName: string;
    latitude: number;
    longitude: number;
    stopOrder: number;
    expectedDurationMinutes: number;
    priority: number;
    /** Drive minutes from the previous point to this stop. */
    driveMinutes?: number;
    /** Minutes from route start until arriving here (drive + earlier visits). */
    etaMinutes?: number;
  }>;
  /** Road-following path points (start → stops). Present when a real routing provider (e.g. OSRM) is configured. */
  routeGeometry?: Array<{ latitude: number; longitude: number }>;
  /** Final drive home when a round trip was requested. */
  returnHome?: { driveMinutes: number; distanceMeters: number };
}

export interface CreateRoutePlanInput {
  routeDate: string;
  assignedUserId?: string;
  repLatitude?: number;
  repLongitude?: number;
  /** false → save as draft; otherwise released to the rep. */
  release?: boolean;
  stopIds: Array<{
    outletId: string;
    expectedDurationMinutes?: number;
    priority?: number;
    visitType?: string;
    objective?: string;
  }>;
}

export interface ProductSummary {
  id: string;
  organisationId: string;
  sku: string;
  name: string;
  inventoryAvailable: number;
  unitPriceCents: number;
}

export interface ProductInput {
  name: string;
  sku: string;
  inventoryAvailable: number;
  unitPriceCents: number;
}

export interface FieldOrderSummary {
  id: string;
  organisationId: string;
  outletId: string;
  repUserId: string;
  status: string;
  source: string;
  totalCents: number;
  createdAt: string;
  erpOrderId?: string | null;
}

export interface CreateFieldOrderInput {
  id?: string;
  outletId: string;
  source?: "online" | "offline" | "sync";
  lines: Array<{ productId: string; quantity: number }>;
}

export function createApiClient(options: ApiClientOptions) {
  const fetcher = options.fetcher ?? fetch;

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (options.token) {
      h["authorization"] = `Bearer ${options.token}`;
    }
    return { ...h, ...options.headers };
  }

  async function request<T>(path: string): Promise<T> {
    const response = await fetcher(`${options.baseUrl}${path}`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetcher(`${options.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API POST failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async function put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetcher(`${options.baseUrl}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`API PUT failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async function del<T>(path: string): Promise<T> {
    const response = await fetcher(`${options.baseUrl}${path}`, {
      method: "DELETE",
      headers: authHeaders()
    });

    if (!response.ok) {
      throw new Error(`API DELETE failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async function patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetcher(`${options.baseUrl}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`API PATCH failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    getSession() {
      return request<SessionResponse>("/api/v1/auth/session");
    },

    getOrganisationStatus() {
      return request<OrganisationStatusResponse>("/api/v1/organisations");
    },

    listOutlets() {
      return request<ListResponse<OutletSummary>>("/api/v1/outlets");
    },

    /** Address → coordinate (forward geocoding) via the org's configured maps provider. */
    geocode(query: string) {
      return request<GeocodeResponse>(`/api/v1/geocode?q=${encodeURIComponent(query)}`);
    },
    /** Coordinate → address (reverse geocoding) — used to label a pin dropped on the map. */
    reverseGeocode(latitude: number, longitude: number) {
      return request<GeocodeResponse>(`/api/v1/geocode?lat=${latitude}&lng=${longitude}`);
    },

    createOutlet(input: CreateOutletInput) {
      return post<OutletSummary>("/api/v1/outlets", input);
    },

    importOutletsCsv(csv: string) {
      return post<{ createdCount: number; failedCount: number; failures: Array<{ row: number; reason: string }> }>(
        "/api/v1/outlets/import",
        { csv }
      );
    },

    updateOutlet(id: string, input: Partial<CreateOutletInput>) {
      return put<{ id: string; status: string }>(`/api/v1/outlets/${id}`, { ...input, id });
    },

    deleteOutlet(id: string) {
      return del<{ id: string; status: string }>(`/api/v1/outlets/${id}`);
    },

    listLeads() {
      return request<ListResponse<LeadSummary>>("/api/v1/leads");
    },

    createLead(input: CreateLeadInput) {
      return post<LeadSummary>("/api/v1/leads", input);
    },

    updateLead(id: string, input: Partial<CreateLeadInput>) {
      return put<{ id: string; status: string }>(`/api/v1/leads/${id}`, { ...input, id });
    },

    deleteLead(id: string) {
      return del<{ id: string; status: string }>(`/api/v1/leads/${id}`);
    },

    /** Status-only update for a lead the caller owns (reps). Status-string only. */
    updateLeadStatus(id: string, status: string) {
      return post<{ id: string; status: string }>(`/api/v1/leads/${id}/status`, { status });
    },

    listTerritories() {
      return request<ListResponse<TerritorySummary>>("/api/v1/territories");
    },

    createTerritory(input: CreateTerritoryInput) {
      return post<{ id: string; organisationId: string; name: string }>("/api/v1/territories", input);
    },

    updateTerritory(id: string, input: Partial<CreateTerritoryInput>) {
      return put<{ id: string; status: string }>(`/api/v1/territories/${id}`, { ...input, id });
    },

    deleteTerritory(id: string) {
      return del<{ id: string; status: string }>(`/api/v1/territories/${id}`);
    },

    listOutletsInTerritory(territoryId: string) {
      return request<OutletsInTerritoryResponse>(`/api/v1/territories/${territoryId}/outlets`);
    },

    listVisits() {
      return request<ListResponse<VisitSummary>>("/api/v1/visits");
    },

    reassignVisit(id: string, assignedUserId: string) {
      return put<{ id: string; assignedUserId: string; status: string }>(`/api/v1/visits/${id}`, { assignedUserId });
    },

    checkIn(input: CheckInInput) {
      return post<CheckInResponse>("/api/v1/visits", { action: "check_in", ...input });
    },

    checkOut(input: CheckOutInput) {
      return post<{ id: string; status: string }>("/api/v1/visits", { action: "check_out", ...input });
    },

    listSessions() {
      return request<ListResponse<WorkSessionSummary>>("/api/v1/tracking");
    },

    /** Latest known position for every active session in the tenant. Used by /live-map on mount. */
    listLatestPositions() {
      return request<{
        organisationId: string;
        dataSource: string;
        items: Array<{
          repUserId: string;
          workSessionId: string;
          latitude: number;
          longitude: number;
          accuracyMeters: number | null;
          recordedAt: string;
        }>;
      }>("/api/v1/tracking/latest");
    },

    recordConsent(input: RecordConsentInput) {
      return post<RecordConsentResponse>("/api/v1/tracking", { action: "record_consent", ...input });
    },

    startSession(input: StartSessionInput) {
      return post<StartSessionResponse>("/api/v1/tracking", { action: "start_session", ...input });
    },

    stopSession() {
      // Server returns the just-computed daily fuel summary when applicable, so the
      // mobile UI can immediately surface "you went 12 km off-plan, tap to explain".
      return post<{
        id: string;
        status: string;
        stoppedAt: string;
        fuel: null | {
          expenseId: string;
          actualKm: number;
          plannedKm: number;
          deviationKm: number;
          amountCents: number;
          deviationAmountCents: number;
          overLimit: boolean;
          rateSource: string;
        };
      }>("/api/v1/tracking", { action: "stop_session" });
    },

    revokeConsent(reason?: string) {
      // `reason` is required by the backend only when the rep turns sharing off
      // DURING working hours (the 422 "reason_required" path). Outside working
      // hours it may be omitted.
      return post<RevokeConsentResponse>("/api/v1/tracking", { action: "revoke_consent", reason });
    },

    /** Admin: latest location-sharing consent + last off-reason per user. */
    listConsentStatus() {
      return request<{
        organisationId: string;
        items: Array<{
          userId: string;
          sharing: boolean;
          grantedAt: string;
          revokedAt: string | null;
          revokeReason: string | null;
        }>;
      }>("/api/v1/tracking/consent-status");
    },

    recordPings(pings: LocationPingInput[]) {
      return post<RecordPingsResponse>("/api/v1/tracking", { action: "record_pings", pings });
    },

    listRoutePlans(date?: string) {
      return request<ListResponse<RoutePlanDetail>>(`/api/v1/route-plans${date ? `?date=${date}` : ""}`);
    },

    syncPush(input: {
      deviceId: string;
      platform?: string;
      appVersion?: string;
      mutations: SyncMutationInput[];
    }) {
      return post<SyncPushResponse>("/api/v1/sync/push", input);
    },

    syncPull(input: { deviceId: string; resource: string; since?: string }) {
      const params = new URLSearchParams({ deviceId: input.deviceId, resource: input.resource });
      if (input.since) params.set("since", input.since);
      return request<SyncPullResponse>(`/api/v1/sync/pull?${params.toString()}`);
    },

    listProducts() {
      return request<ListResponse<ProductSummary>>("/api/v1/products");
    },

    createProduct(input: ProductInput) {
      return post<ProductSummary>("/api/v1/products", input);
    },

    updateProduct(id: string, input: ProductInput) {
      return put<ProductSummary>(`/api/v1/products/${id}`, { ...input, id });
    },

    listFieldOrders() {
      return request<ListResponse<FieldOrderSummary>>("/api/v1/field-orders");
    },

    createFieldOrder(input: CreateFieldOrderInput) {
      return post<FieldOrderSummary>("/api/v1/field-orders", input);
    },

    updateFieldOrderStatus(id: string, status: string) {
      return put<{ id: string; status: string; previousStatus: string }>(`/api/v1/field-orders/${id}`, { status });
    },

    listVisitAttachments(visitId: string) {
      return request<ListResponse<{ id: string; contentType: string; caption: string | null; sizeBytes: number; url: string; createdAt: string }>>(
        `/api/v1/visits/${visitId}/attachments`
      );
    },

    getReportSummary() {
      return request<ReportSummary>("/api/v1/reports/summary");
    },

    listRepActivity() {
      return request<ListResponse<RepActivityRow>>("/api/v1/reports/rep-activity");
    },

    getExpenseReport(input?: { from?: string; to?: string }) {
      const params = new URLSearchParams();
      if (input?.from) params.set("from", input.from);
      if (input?.to) params.set("to", input.to);
      const qs = params.toString();
      return request<ExpenseReport>(`/api/v1/reports/expenses${qs ? `?${qs}` : ""}`);
    },

    getOffTargetLeaderboard(days = 30) {
      return request<OffTargetLeaderboard>(`/api/v1/reports/off-target-leaderboard?days=${days}`);
    },

    getConversionFunnel() {
      return request<ConversionFunnel>("/api/v1/reports/funnel");
    },

    getTimeOnField(date?: string) {
      return request<TimeOnField>(`/api/v1/reports/time-on-field${date ? `?date=${date}` : ""}`);
    },

    getReportTrends(days = 14) {
      return request<ReportTrends>(`/api/v1/reports/trends?days=${days}`);
    },

    getVisitQuality(days = 30) {
      return request<VisitQuality>(`/api/v1/reports/visit-quality?days=${days}`);
    },

    getCoverage() {
      return request<ListResponse<{ outletId: string; name: string; latitude: number; longitude: number; visitCount: number; lastVisit: string | null }>>(
        "/api/v1/reports/coverage"
      );
    },

    getRouteAdherence(date?: string) {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      return request<{ organisationId: string; dataSource: string; date: string; items: Array<{ userId: string; plannedOutlets: number; visitedOutlets: number; adherencePercent: number }> }>(
        `/api/v1/reports/route-adherence${qs}`
      );
    },

    getReorderReport() {
      return request<{ items: Array<{ outletId: string; name: string; orderCount: number; lastOrderAt: string | null; dueScore: number }> }>(
        "/api/v1/reports/reorder"
      );
    },

    getMileageReport(date?: string, ratePerKmCents?: number) {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (ratePerKmCents) params.set("ratePerKmCents", String(ratePerKmCents));
      const qs = params.toString();
      return request<{ date: string; ratePerKmCents: number; items: Array<{ userId: string; distanceKm: number; expenseCents: number }> }>(
        `/api/v1/reports/mileage${qs ? `?${qs}` : ""}`
      );
    },

    // --- Payments / ledger ---
    recordPayment(input: { outletId: string; amountCents: number; method?: string; orderId?: string; note?: string }) {
      return post<{ id: string; outletId: string; amountCents: number; method: string }>("/api/v1/payments", input);
    },
    getOutletLedger(outletId: string) {
      return request<{ outletId: string; orderedCents: number; paidCents: number; outstandingCents: number; items: Array<{ id: string; amountCents: number; method: string; note: string | null; createdAt: string }> }>(
        `/api/v1/payments?outletId=${encodeURIComponent(outletId)}`
      );
    },

    // --- Beat plans (PJP) ---
    listBeatPlans(dueToday?: boolean) {
      return request<ListResponse<{ id: string; repUserId: string; outletId: string; weekdays: string; active: boolean }>>(
        `/api/v1/beat-plans${dueToday ? "?dueToday=1" : ""}`
      );
    },
    createBeatPlan(input: { repUserId: string; outletId: string; weekdays?: string }) {
      return post<{ id: string; repUserId: string; outletId: string; weekdays: string }>("/api/v1/beat-plans", input);
    },

    // --- Attendance ---
    listAttendance(date?: string) {
      return request<{ date: string; items: Array<{ userId: string; status: string; checkedInAt: string | null; checkedOutAt: string | null }> }>(
        `/api/v1/attendance${date ? `?date=${encodeURIComponent(date)}` : ""}`
      );
    },
    markAttendance(input: { action: "check_in" | "check_out"; latitude?: number; longitude?: number }) {
      return post<{ status: string; date: string }>("/api/v1/attendance", input);
    },

    // --- Surveys ---
    listSurveys() {
      return request<ListResponse<{ id: string; name: string; definition: Record<string, unknown>; active: boolean; createdAt: string }>>("/api/v1/surveys");
    },
    createSurvey(input: { name: string; definition?: Record<string, unknown> }) {
      return post<{ id: string; name: string }>("/api/v1/surveys", input);
    },
    submitSurveyResponse(surveyId: string, input: { answers: Record<string, unknown>; outletId?: string }) {
      return post<{ id: string; surveyId: string }>(`/api/v1/surveys/${surveyId}/responses`, input);
    },
    listSurveyResponses(surveyId: string) {
      return request<ListResponse<{ id: string; submittedBy: string; outletId: string | null; answers: Record<string, unknown>; createdAt: string }>>(
        `/api/v1/surveys/${surveyId}/responses`
      );
    },

    getFraudSignals(hours?: number) {
      const qs = hours ? `?hours=${hours}` : "";
      return request<{ organisationId: string; dataSource: string; windowHours: number; signalCount: number; items: Array<{ userId: string; from: { latitude: number; longitude: number; at: string }; to: { latitude: number; longitude: number; at: string }; distanceMeters: number; seconds: number; speedKmh: number }> }>(
        `/api/v1/reports/fraud-signals${qs}`
      );
    },

    listSyncConflicts(input?: { limit?: number }) {
      const params = new URLSearchParams();
      if (input?.limit) params.set("limit", String(input.limit));
      const qs = params.toString();
      return request<ListResponse<SyncConflict>>(`/api/v1/sync/conflicts${qs ? `?${qs}` : ""}`);
    },

    resolveSyncConflict(id: string, action: "apply_client" | "apply_server" | "dismiss") {
      return post<{ id: string; action: string; outcome: string }>(`/api/v1/sync/conflicts/${id}/resolve`, { action });
    },

    listAuditLog(input?: { actionPrefix?: string; limit?: number }) {
      const params = new URLSearchParams();
      if (input?.actionPrefix) params.set("actionPrefix", input.actionPrefix);
      if (input?.limit) params.set("limit", String(input.limit));
      const qs = params.toString();
      return request<ListResponse<AuditEntry>>(`/api/v1/audit-log${qs ? `?${qs}` : ""}`);
    },

    listNotifications(input?: { limit?: number }) {
      const params = new URLSearchParams();
      if (input?.limit) params.set("limit", String(input.limit));
      const qs = params.toString();
      return request<NotificationFeedResponse>(`/api/v1/notifications${qs ? `?${qs}` : ""}`);
    },

    markNotificationsRead(ids?: string[]) {
      return post<{ updated: number }>("/api/v1/notifications", { ids: ids ?? [] });
    },

    registerDevice(input: { deviceId: string; pushToken: string; platform?: string; appVersion?: string }) {
      return post<{ deviceId: string; registered: boolean }>("/api/v1/notifications/devices", input);
    },

    uploadFile(input: UploadInput) {
      return post<UploadResponse>("/api/v1/uploads", input);
    },

    getUpload(id: string) {
      return request<UploadObjectResponse>(`/api/v1/uploads/${id}`);
    },

    forgotPassword(input: { email: string; organisationId: string }) {
      return post<{ status: string; message: string }>("/api/v1/auth/forgot-password", input);
    },

    resetPassword(input: { organisationId: string; token: string; newPassword: string }) {
      return post<{ status: string; message: string }>("/api/v1/auth/reset-password", input);
    },

    logout() {
      return post<{ status: string }>("/api/v1/auth/logout", {});
    },

    createRoutePlan(input: CreateRoutePlanInput) {
      return post<RoutePlanDetail>("/api/v1/route-plans", input);
    },

    /** Apply a Day Plan lifecycle action: release | start | complete | cancel. */
    transitionRoutePlan(id: string, action: "release" | "start" | "complete" | "cancel") {
      return put<{ id: string; status: string }>(`/api/v1/route-plans/${id}`, { action });
    },

    /** Manager schedules a one-off visit for a rep. */
    scheduleVisit(input: { outletId: string; assignedUserId: string; visitDate?: string; objective?: string }) {
      return post<{ id: string; outletId: string; assignedUserId: string; visitDate: string; status: string }>(
        "/api/v1/visits/schedule",
        input
      );
    },

    previewRoutePlan(input: PreviewRouteInput) {
      return post<PreviewedRouteResponse>("/api/v1/route-plans/preview", input);
    },

    listUsers() {
      return request<ListResponse<UserSummary>>("/api/v1/users");
    },

    listTeams() {
      return request<ListResponse<TeamSummary>>("/api/v1/teams");
    },
    createTeam(name: string) {
      return post<{ id: string; name: string }>("/api/v1/teams", { name });
    },
    renameTeam(id: string, name: string) {
      return put<{ id: string; name: string }>(`/api/v1/teams/${id}`, { name });
    },
    deleteTeam(id: string) {
      return del<{ id: string; status: string }>(`/api/v1/teams/${id}`);
    },
    addTeamMember(teamId: string, userId: string) {
      return post<{ teamId: string; userId: string; status: string }>(`/api/v1/teams/${teamId}/members`, { userId });
    },
    removeTeamMember(teamId: string, userId: string) {
      return del<{ teamId: string; userId: string; status: string }>(`/api/v1/teams/${teamId}/members/${userId}`);
    },

    inviteUser(input: InviteUserInput) {
      return post<InviteUserResponse>("/api/v1/users", input);
    },

    deactivateUser(id: string) {
      return del<{ id: string; status: string }>(`/api/v1/users/${id}`);
    },

    resetUserPassword(id: string) {
      return post<InviteUserResponse>(`/api/v1/users/${id}/reset-password`, {});
    },

    exportUserData(id: string) {
      return request<Record<string, unknown>>(`/api/v1/compliance/users/${id}/export`);
    },

    eraseUserData(id: string) {
      return post<{ userId: string; anonymised: boolean; locationPingsDeleted: number; devicesDeleted: number; consentsRevoked: number }>(
        `/api/v1/compliance/users/${id}/erase`,
        {}
      );
    },

    getMyAnalytics() {
      return request<MyAnalytics>("/api/v1/me/analytics");
    },

    getVisitExtras(visitId: string) {
      return request<VisitExtras>(`/api/v1/visits/${visitId}/extras`);
    },

    getErpStatus() {
      return request<{ organisationId: string; provider: string; connection: { ok: boolean; message?: string }; mappings: Record<string, number> }>(
        "/api/v1/integrations/erp/status"
      );
    },

    backfillToErp() {
      return post<{ organisationId: string; backfilled: { outlets: number; products: number; leads: number; reps: number } }>(
        "/api/v1/integrations/erp/backfill",
        {}
      );
    },

    impersonateUser(id: string) {
      return post<ImpersonateResponse>(`/api/v1/users/${id}/impersonate`, {});
    },

    getMyToday() {
      return request<MyDayResponse>("/api/v1/me/today");
    },

    getOrganisationSettings() {
      return request<OrganisationSettings>("/api/v1/organisation-settings");
    },

    updateOrganisationSettings(input: UpdateOrganisationSettingsInput) {
      return put<OrganisationSettings>("/api/v1/organisation-settings", input);
    },

    // Vehicle types + per-rep vehicle assignment ----------------------------
    listVehicleTypes() {
      return request<ListResponse<VehicleTypeSummary>>("/api/v1/vehicle-types");
    },
    createVehicleType(input: { name: string; fuelRatePerKmCents: number; active?: boolean }) {
      return post<VehicleTypeSummary>("/api/v1/vehicle-types", input);
    },
    updateVehicleType(id: string, input: { name?: string; fuelRatePerKmCents?: number; active?: boolean }) {
      return put<VehicleTypeSummary>(`/api/v1/vehicle-types/${id}`, input);
    },
    deactivateVehicleType(id: string) {
      return del<{}>(`/api/v1/vehicle-types/${id}`);
    },
    updateUserVehicle(id: string, input: { vehicleTypeId?: string | null; fuelRatePerKmCents?: number | null }) {
      return put<UserSummary>(`/api/v1/users/${id}/vehicle`, input);
    },

    // Field expenses (daily auto-computed fuel) -----------------------------
    listFieldExpenses(opts?: { status?: "pending" | "approved" | "rejected" }) {
      const qs = opts?.status ? `?status=${encodeURIComponent(opts.status)}` : "";
      return request<{ organisationId: string; dataSource: string; repScoped: boolean; items: FieldExpenseSummary[] }>(
        `/api/v1/field-expenses${qs}`
      );
    },
    submitFieldExpenseReason(id: string, reason: string) {
      return patch<FieldExpenseSummary>(`/api/v1/field-expenses/${id}/reason`, { reason });
    },
    approveFieldExpense(id: string) {
      return patch<FieldExpenseSummary>(`/api/v1/field-expenses/${id}/approve`, {});
    },
    rejectFieldExpense(id: string, rejectionReason: string) {
      return patch<FieldExpenseSummary>(`/api/v1/field-expenses/${id}/reject`, { rejectionReason });
    },

    async login(input: LoginInput): Promise<LoginResponse> {
      const result = await post<LoginResponse>("/api/v1/auth/login", input);
      options.token = result.token;
      return result;
    },

    setToken(token: string) {
      options.token = token;
    },

    setBaseUrl(baseUrl: string) {
      options.baseUrl = baseUrl;
    },

    getBaseUrl() {
      return options.baseUrl;
    }
  };
}
