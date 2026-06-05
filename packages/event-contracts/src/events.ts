import { z } from "zod";

export const domainEventTypes = [
  "tracking.session.started",
  "tracking.session.stopped",
  "tracking.location.recorded",
  "visit.checked_in",
  "visit.checked_out",
  "route.plan.created",
  "route.plan.assigned",
  "route.stop.completed",
  "order.field_created",
  "order.sync_failed",
  "lead.assigned",
  "notification.requested"
] as const;

export const trackingLocationRecordedSchema = z.object({
  type: z.literal("tracking.location.recorded"),
  organisationId: z.string().min(1),
  repUserId: z.string().min(1),
  workSessionId: z.string().min(1),
  locationEventId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative(),
  recordedAt: z.string().datetime()
});

export type TrackingLocationRecorded = z.infer<typeof trackingLocationRecordedSchema>;
