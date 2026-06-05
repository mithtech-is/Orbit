export interface SubscriberContext {
  /** Stable user ID of the connected client — used for rep self-targeting on route events. */
  userId: string;
  organisationId: string;
  role: string;
  permissions: string[];
  managedTeamIds: string[] | undefined;
}

export interface TrackingPingEvent {
  type: "tracking.location.recorded";
  organisationId: string;
  repUserId: string;
  workSessionId: string;
  locationEventId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
  /** Team(s) the rep belongs to — used for team-scoped manager filtering. */
  repTeamIds?: string[];
}

/**
 * Emitted when a new route plan is inserted via POST /api/v1/route-plans.
 * Subscribers should refresh their route-plan list on receipt rather than
 * rebuilding state from the payload — this keeps the wire format thin and
 * lets the existing GET endpoint own the canonical projection.
 */
export interface RoutePlanCreatedEvent {
  type: "route.plan.created";
  organisationId: string;
  planId: string;
  assignedUserId: string;
  routeDate: string;
  stopCount: number;
  plannedDistanceMeters: number;
  plannedDurationMinutes: number;
}

/**
 * Emitted when an existing route plan is (re)assigned to a different rep.
 * Currently fired alongside `route.plan.created` because plans are created
 * with an assignee in the same call; will fire alone once a dedicated
 * PUT /api/v1/route-plans/:id/assignee endpoint lands.
 */
export interface RoutePlanAssignedEvent {
  type: "route.plan.assigned";
  organisationId: string;
  planId: string;
  assignedUserId: string;
  routeDate: string;
  stopCount: number;
  plannedDistanceMeters: number;
  plannedDurationMinutes: number;
}

export type RealtimeEvent = TrackingPingEvent | RoutePlanCreatedEvent | RoutePlanAssignedEvent;

/**
 * Decides whether a subscriber should receive a given realtime event. Pure
 * function so the rule can be unit-tested without a WS connection.
 *
 * Tracking events (`tracking.location.recorded`):
 *   - Cross-tenant: never.
 *   - Subscriber must hold `tracking:view_live`.
 *   - `platform_admin` / `organisation_admin`: receive within tenant.
 *   - `sales_manager`: only when the rep is on one of the manager's teams.
 *   - Anyone else: blocked.
 *
 * Route-plan events (`route.plan.created`, `route.plan.assigned`):
 *   - Cross-tenant: never.
 *   - Subscriber holds `route:plan` (managers / admins / ops): receives.
 *   - Subscriber is the assigned rep (`visit:write` + matching userId): receives.
 *   - Anyone else: blocked.
 *
 * The route-plan rule mirrors the GET /api/v1/route-plans authorisation logic
 * (route.ts:47-58) — anyone with `route:plan` sees all plans; anyone with
 * `visit:write` sees only their own. Keep these in sync if either changes.
 */
export function canSubscriberReceive(
  subscriber: SubscriberContext,
  event: RealtimeEvent
): boolean {
  if (subscriber.organisationId !== event.organisationId) return false;

  if (event.type === "tracking.location.recorded") {
    if (!subscriber.permissions.includes("tracking:view_live")) return false;
    switch (subscriber.role) {
      case "platform_admin":
      case "organisation_admin":
        return true;
      case "sales_manager": {
        const managed = subscriber.managedTeamIds ?? [];
        if (managed.length === 0) return false;
        if (!event.repTeamIds || event.repTeamIds.length === 0) return false;
        return event.repTeamIds.some((t) => managed.includes(t));
      }
      default:
        return false;
    }
  }

  if (event.type === "route.plan.created" || event.type === "route.plan.assigned") {
    if (subscriber.permissions.includes("route:plan")) return true;
    if (
      subscriber.permissions.includes("visit:write") &&
      subscriber.userId === event.assignedUserId
    ) {
      return true;
    }
    return false;
  }

  return false;
}
