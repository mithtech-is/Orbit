export const backendScaffold = {
  service: "orbit-backend",
  modules: [
    "organisation",
    "identity-and-access",
    "territory",
    "lead-and-outlet",
    "visit",
    "tracking",
    "route-planning",
    "sync",
    "notification",
    "audit-and-compliance"
  ]
} as const;
