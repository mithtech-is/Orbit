# Product Requirements Document

## Personas

| Persona | Goals |
|---|---|
| Platform Admin | Manage tenant lifecycle and audited platform-level access. |
| Organisation Admin | Configure users, teams, permissions, tracking policy and retention. |
| Sales Manager | Plan routes, assign leads, monitor visits, review exceptions and coach reps. |
| Field Sales Representative | See assigned work, start/stop tracking, visit outlets, capture orders and sync offline work. |
| Operations User | Manage lead/outlet/order/report workflows and bulk actions without changing sensitive policy. |
| Read-only Analyst | View tenant-scoped dashboards and exports without mutation rights. |

## MVP User Stories

- As an organisation admin, I can create teams, invite users and assign roles so access matches job responsibility.
- As a manager, I can assign leads/outlets to reps and generate daily route plans.
- As a rep, I can see today’s route, next stop and required tasks even without network coverage.
- As a rep, I can accept tracking consent, start my work session and visibly see that tracking is active.
- As a rep, I can check in only when inside the configured geofence or submit an exception with evidence.
- As a rep, I can capture visit outcome, notes, photos and a field order.
- As a manager, I can see permitted team locations and route progress in real time.
- As operations, I can review failed syncs, orders, leads, territories and export reports.
- As an admin, I can audit sensitive actions and configure location retention.

## Success Metrics

- Route adherence percentage.
- Visits completed versus planned.
- Field order value and order sync success rate.
- Location ingestion latency and live-map freshness.
- Offline mutation failure rate and average recovery time.
- Geofence exception rate and review time.
- Tenant isolation and RBAC test pass rate.

## Non-Functional Requirements

- Tenant isolation for every business record.
- Strict TypeScript where compatible.
- Validated external input.
- No hardcoded secrets.
- Durable writes before real-time broadcast.
- Offline-first mobile behaviour for assigned work and mutations.
- Secure Electron renderer isolation.
- Documented local development without paid external services.
