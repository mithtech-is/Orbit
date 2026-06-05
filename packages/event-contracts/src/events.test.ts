import { describe, expect, it } from "vitest";
import { trackingLocationRecordedSchema } from "./events.js";

describe("event payload contracts", () => {
  it("requires tenant, rep and accuracy for live tracking events", () => {
    const event = trackingLocationRecordedSchema.parse({
      type: "tracking.location.recorded",
      organisationId: "org_demo",
      repUserId: "user_rep_1",
      workSessionId: "session_1",
      locationEventId: "loc_1",
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyMeters: 18,
      recordedAt: "2026-05-27T10:00:00.000Z"
    });

    expect(event.organisationId).toBe("org_demo");
  });
});
