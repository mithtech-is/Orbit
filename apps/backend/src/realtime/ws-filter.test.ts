import { describe, expect, it } from "vitest";
import {
  canSubscriberReceive,
  type RoutePlanCreatedEvent,
  type RoutePlanAssignedEvent,
  type SubscriberContext,
  type TrackingPingEvent
} from "./ws-filter.js";

const trackingEvent: TrackingPingEvent = {
  type: "tracking.location.recorded",
  organisationId: "org_acme",
  repUserId: "user_rep_1",
  workSessionId: "wses_1",
  locationEventId: "loc_1",
  latitude: 12.97,
  longitude: 77.59,
  accuracyMeters: 8,
  recordedAt: "2026-05-28T10:00:00.000Z",
  repTeamIds: ["team_bengaluru_central"]
};

const routeCreated: RoutePlanCreatedEvent = {
  type: "route.plan.created",
  organisationId: "org_acme",
  planId: "rp_1",
  assignedUserId: "user_rep_1",
  routeDate: "2026-05-28",
  stopCount: 5,
  plannedDistanceMeters: 9800,
  plannedDurationMinutes: 260
};

const routeAssigned: RoutePlanAssignedEvent = {
  ...routeCreated,
  type: "route.plan.assigned"
};

function subscriber(overrides: Partial<SubscriberContext> = {}): SubscriberContext {
  return {
    userId: "user_admin",
    organisationId: "org_acme",
    role: "organisation_admin",
    permissions: ["tracking:view_live", "route:plan"],
    managedTeamIds: [],
    ...overrides
  };
}

describe("canSubscriberReceive — tracking events", () => {
  it("blocks cross-tenant events", () => {
    expect(canSubscriberReceive(subscriber({ organisationId: "org_other" }), trackingEvent)).toBe(false);
  });

  it("requires the tracking:view_live permission", () => {
    expect(canSubscriberReceive(subscriber({ permissions: [] }), trackingEvent)).toBe(false);
  });

  it("admits organisation_admin within tenant", () => {
    expect(canSubscriberReceive(subscriber(), trackingEvent)).toBe(true);
  });

  it("admits a sales_manager only when the rep is on one of their teams", () => {
    expect(
      canSubscriberReceive(
        subscriber({
          role: "sales_manager",
          permissions: ["tracking:view_live"],
          managedTeamIds: ["team_bengaluru_central"]
        }),
        trackingEvent
      )
    ).toBe(true);

    expect(
      canSubscriberReceive(
        subscriber({
          role: "sales_manager",
          permissions: ["tracking:view_live"],
          managedTeamIds: ["team_other"]
        }),
        trackingEvent
      )
    ).toBe(false);
  });

  it("blocks roles outside the manager/admin set", () => {
    for (const role of ["field_sales_representative", "operations_user", "readonly_analyst"]) {
      expect(
        canSubscriberReceive(
          subscriber({ role, permissions: ["tracking:view_live"] }),
          trackingEvent
        )
      ).toBe(false);
    }
  });
});

describe("canSubscriberReceive — route-plan events", () => {
  it("blocks cross-tenant", () => {
    expect(canSubscriberReceive(subscriber({ organisationId: "org_other" }), routeCreated)).toBe(false);
    expect(canSubscriberReceive(subscriber({ organisationId: "org_other" }), routeAssigned)).toBe(false);
  });

  it("admits anyone with route:plan permission", () => {
    // Manager, ops, admin all hold route:plan per the seed permission matrix.
    expect(
      canSubscriberReceive(
        subscriber({ role: "sales_manager", permissions: ["route:plan"] }),
        routeCreated
      )
    ).toBe(true);
    expect(
      canSubscriberReceive(
        subscriber({ role: "operations_user", permissions: ["route:plan"] }),
        routeCreated
      )
    ).toBe(true);
    expect(canSubscriberReceive(subscriber(), routeAssigned)).toBe(true);
  });

  it("admits the assigned rep (visit:write + matching userId)", () => {
    expect(
      canSubscriberReceive(
        subscriber({
          userId: "user_rep_1",
          role: "field_sales_representative",
          permissions: ["visit:write"]
        }),
        routeAssigned
      )
    ).toBe(true);
  });

  it("blocks a rep when the event is for a different rep", () => {
    expect(
      canSubscriberReceive(
        subscriber({
          userId: "user_rep_2", // different rep
          role: "field_sales_representative",
          permissions: ["visit:write"]
        }),
        routeAssigned
      )
    ).toBe(false);
  });

  it("blocks a rep without visit:write even if userId matches", () => {
    expect(
      canSubscriberReceive(
        subscriber({
          userId: "user_rep_1",
          role: "field_sales_representative",
          permissions: [] // missing visit:write
        }),
        routeCreated
      )
    ).toBe(false);
  });

  it("blocks readonly_analyst — no route:plan, no visit:write", () => {
    expect(
      canSubscriberReceive(
        subscriber({
          userId: "user_analyst",
          role: "readonly_analyst",
          permissions: ["report:read"]
        }),
        routeCreated
      )
    ).toBe(false);
  });
});
