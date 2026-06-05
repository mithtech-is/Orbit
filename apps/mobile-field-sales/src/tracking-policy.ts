export const mobileTrackingPolicy = {
  requestForegroundBeforeBackground: true,
  requireExplicitWorkSession: true,
  useExpoGoForBackgroundTracking: false,
  offlineQueueStorage: "sqlite"
} as const;
