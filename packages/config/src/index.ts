export const defaultTenantPolicy = {
  geofenceRadiusMeters: 100,
  normalTrackingDistanceMeters: 100,
  activeVisitTrackingDistanceMeters: 25,
  rawLocationRetentionDays: 90,
  workingHours: {
    startsAt: "09:00",
    endsAt: "18:00"
  }
} as const;
