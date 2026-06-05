# Research Alignment and Implementation Contract

## Documents Reviewed

| Document | Path | Relevance | Decision |
|---|---|---:|---|
| Field sales executive summary and architecture report | `D:/Users/KillerKoli/Downloads/deep-research-report (3).md` | Primary | Source of truth for MVP, stack and roadmap. |
| Field sales core features and workflow report | `D:/Users/KillerKoli/Downloads/deep-research-report (4).md` | Primary | Source of truth for feature behaviour, maps, offline and security. |
| Duplicate field sales report | `D:/Users/KillerKoli/Downloads/deep-research-report (2).md` | Supporting | Same field-sales content as `(3)`; used to confirm no divergence. |
| Polemarch launch marketing plan | `D:/Users/KillerKoli/Downloads/deep-research-report.md` | Not relevant | Excluded because it is fintech launch marketing, not field sales SaaS. |
| Google review SaaS overview | `D:/Users/KillerKoli/Downloads/deep-research-report (1).md` | Not relevant | Excluded because it specifies a different product. |

## Repository State Found

The workspace at `C:/Users/KillerKoli/ayush/Orbit` was empty and not a Git repository. No existing package manifests, README, application code, CI, database schema, or design system were present. Because no repository conventions exist, this implementation will create the requested monorepo foundation.

## Executive Summary Requirements

The product is a multi-tenant field sales SaaS platform for sales representatives, managers, operations users and administrators. It must combine mobile field execution, manager visibility, operations workflows and Medusa-backed commerce. The platform must be privacy-first because it handles employee location data, customer data and commercial transactions.

The required stack is:

- Medusa.js v2-compatible backend on Node.js and TypeScript.
- Next.js manager dashboard.
- React Native mobile application.
- Electron desktop operations application.
- PostgreSQL with PostGIS for tenant data, geofencing, territories and distance queries.
- Redis for cache, queues and real-time horizontal scaling.
- WebSockets for live operational updates, with PostgreSQL as durable source of truth.
- Mapbox-compatible routing abstraction, with future ability to swap Google Maps, HERE, GraphHopper or OSRM.
- Offline-first mobile persistence using SQLite or an approved equivalent.

## Mandatory MVP Features

1. Authentication, organisation setup and tenant isolation.
2. Role-based access for Platform Admin, Organisation Admin, Sales Manager, Field Sales Representative, Operations User and Read-only Analyst.
3. Rep, manager, team and operations user management.
4. Lead, outlet and customer-location management.
5. Territory polygons and territory assignment.
6. Daily route assignment and route optimisation through a provider abstraction.
7. Mobile daily route, route stops and next-visit workflow.
8. Consent-based foreground/background location permission flow.
9. Explicit work-session tracking; no tracking outside active sessions.
10. Live manager map with tenant/team-filtered location updates.
11. Geo-fenced check-in/check-out and exception workflow.
12. Visit notes, outcomes and proof attachments.
13. Medusa product, inventory, cart/order linkage for field orders.
14. Offline mobile data, mutation queue, idempotency keys, retry and conflict tracking.
15. Basic reports, dashboards and exports.
16. Notifications for assignments, route updates, sync failures and review items.
17. Audit logs, consent logs, retention controls, data export and deletion workflows.
18. Seeded demo tenant, users, outlets, leads, products, routes, visits, orders and audit events.
19. Automated validation for tenant isolation, RBAC, geofence rules, sync/idempotency and retention cleanup.

## Later-Phase Features

The following are designed for but not blocking MVP:

- AI route recommendations and lead allocation.
- Advanced territory optimisation and balancing.
- CRM and ERP connectors.
- Payment collection in the field.
- Gamification, leaderboards and badges.
- Advanced reporting studio.
- Attendance/payroll integration.
- Multi-language operation.
- Sophisticated GPS spoofing/fraud detection.
- Multi-warehouse inventory and advanced stock reservation.
- Chat or rich rep-manager messaging.

## Required Technical Decisions

| Area | Required Decision |
|---|---|
| Backend | Use Medusa as the backend application framework and commerce engine, not as a generic Express shell. |
| Field domains | Implement custom Medusa modules for organisation, identity/access, territory, lead/outlet, visit, tracking, route-planning, sync, notification and audit/compliance. |
| Workflows | Multi-step operations are Medusa workflows with typed input/output, validation, compensation where needed and audit events. |
| API routes | API routes validate, authorise, call workflows/query services and return consistent contracts. Business logic does not live in route handlers. |
| Data | All business records are tenant-scoped unless explicitly global. |
| Maps | Business logic uses provider interfaces; Mapbox-compatible mock/local implementation is default for local development. |
| Offline | Mobile uses SQLite-backed structured persistence and a mutation queue. |
| Real-time | WebSockets broadcast only authorised updates after durable storage and Redis pub/sub filtering. |
| Privacy | Location tracking requires consent and active work session. Raw location retention is configurable. Historical access is audited. |
| Desktop | Electron renderer has `nodeIntegration: false`, `contextIsolation: true` and a restricted preload bridge. |
| Package manager | `pnpm` workspaces are the desired monorepo standard. Local `pnpm` was not installed, but Corepack is available and can activate it. |

## Ambiguities, Contradictions and Resolutions

| Issue | Resolution |
|---|---|
| Research mentions Google Maps or Mapbox; user requires Mapbox-compatible default abstraction. | Implement provider interface and local mock provider first; Mapbox becomes default external implementation once credentials exist. |
| Research mentions Expo examples, while user warns not to rely on Expo Go for background location. | Scaffold React Native with TypeScript and document Expo development builds only if used later; do not make Expo Go a dependency for tracking. |
| Research includes optional payment capture, CRM/ERP, gamification and advanced analytics. | Keep these in roadmap and integration seams; do not block MVP foundation. |
| Workspace has no existing Medusa or Next.js app. | Create monorepo from scratch, preserving the requested architecture. |
| `pnpm` command is unavailable locally. | Use Corepack-managed `pnpm`; if activation fails, document it and keep scripts standard. |
| Medusa v2 package scaffolding can be heavy and version-sensitive. | Phase 1 creates a v2-compatible backend workspace and domain package contracts first, then Medusa package installation/configuration is completed as the next implementation step. |

## Implementation Decisions for Phase 0 and Phase 1

1. Create a monorepo with `apps/backend-medusa`, `apps/web-dashboard`, `apps/mobile-field-sales`, `apps/desktop-operations` and shared packages.
2. Start with shared domain contracts, validation schemas, event contracts, map-provider interface and sync-engine primitives because all apps depend on them.
3. Add baseline tests for RBAC, tenant isolation, route provider determinism and offline mutation queue before implementing those primitives.
4. Add Docker Compose for PostgreSQL/PostGIS and Redis.
5. Add `.env.example` with all required provider and local-development settings.
6. Seed demo data as TypeScript fixtures that can later be wired into Medusa seed workflows.
7. Document every unfinished Phase 1 item in `docs/engineering/implementation-progress.md`.

## Requirement-to-Module Traceability Matrix

| Requirement | Module / Package / App |
|---|---|
| Organisation setup and tenant settings | `apps/backend-medusa/src/modules/organisation`, `packages/shared-types` |
| Users, roles, permissions and devices | `apps/backend-medusa/src/modules/identity-and-access`, `packages/validation` |
| Territory polygons and assignments | `apps/backend-medusa/src/modules/territory`, `packages/maps-provider` |
| Leads, outlets and customer locations | `apps/backend-medusa/src/modules/lead-and-outlet`, `apps/web-dashboard` |
| Visits, check-ins and attachments | `apps/backend-medusa/src/modules/visit`, `apps/mobile-field-sales` |
| Consent, work sessions and location pings | `apps/backend-medusa/src/modules/tracking`, `packages/event-contracts` |
| Route planning and optimisation | `apps/backend-medusa/src/modules/route-planning`, `packages/maps-provider` |
| Offline sync, conflicts and idempotency | `apps/backend-medusa/src/modules/sync`, `packages/sync-engine` |
| Notifications | `apps/backend-medusa/src/modules/notification`, mobile/web clients |
| Audit, retention, export and deletion | `apps/backend-medusa/src/modules/audit-and-compliance` |
| Medusa commerce orders and inventory | `apps/backend-medusa` Medusa modules and workflows |
| Manager dashboard | `apps/web-dashboard` |
| Field rep mobile app | `apps/mobile-field-sales` |
| Operations desktop app | `apps/desktop-operations` |
| Shared API client | `packages/api-client` |
| Shared validation | `packages/validation` |
| Shared UI/domain types | `packages/shared-types`, `packages/ui` |
