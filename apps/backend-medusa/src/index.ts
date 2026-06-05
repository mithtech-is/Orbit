export const backendScaffold = {
  service: "backend-medusa",
  medusaCompatibility: "v2",
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
