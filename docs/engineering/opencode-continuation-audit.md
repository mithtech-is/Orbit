# OpenCode Continuation Audit

## Audit Date
2026-05-27

## Repository State

### Git
Not a git repository. No `.git` directory exists.

### Package Manager
`pnpm` via Corepack (`pnpm@9.15.4`). Works correctly.

---

## Files and Folders That Exist

### Root
- `package.json` (pnpm workspace root, scripts, dependencies)
- `pnpm-workspace.yaml` (glob `apps/*`, `packages/*`)
- `pnpm-lock.yaml`
- `tsconfig.base.json`
- `tsconfig.build.json`
- `eslint.config.js`
- `.env.example`
- `.gitignore`
- `AGENTS.md`

### Apps (4)
- `apps/backend-medusa/` — Medusa v2 scaffold
- `apps/web-dashboard/` — Next.js dashboard
- `apps/mobile-field-sales/` — React Native scaffold
- `apps/desktop-operations/` — Electron scaffold

### Packages (8)
- `packages/shared-types/` — Domain types (Role, Permission, GeoPoint, etc.)
- `packages/validation/` — RBAC access checks, location eligibility
- `packages/event-contracts/` — Zod-validated event payloads
- `packages/maps-provider/` — Maps provider interface + mock impl
- `packages/sync-engine/` — Offline mutation queue
- `packages/api-client/` — Typed HTTP API client
- `packages/ui/` — Status tone constants
- `packages/config/` — Empty shell (package.json only, no src/)

### Docs (18 files across 6 directories)
- `docs/00-research-alignment-and-implementation-contract.md`
- `docs/01-executive-summary.md`
- `docs/02-prd.md`
- `docs/03-mvp-scope-and-roadmap.md`
- `docs/04-system-requirements-specification.md`
- `docs/architecture/high-level-architecture.md`
- `docs/architecture/backend-medusa-module-design.md`
- `docs/architecture/monorepo-structure.md`
- `docs/api/openapi.yaml`
- `docs/api/api-usage-examples.md`
- `docs/security/rbac-permission-matrix.md`
- `docs/security/tenant-isolation-policy.md`
- `docs/engineering/implementation-progress.md`
- `docs/engineering/local-development-guide.md`
- `docs/engineering/environment-variables.md`
- `docs/engineering/seed-data-and-demo-guide.md`
- `docs/diagrams/*.mmd` (6 sequence/architecture diagrams)
- `docs/engineering/opencode-continuation-audit.md` (this file)

### Infra
- `infra/docker/docker-compose.yml` (PostgreSQL/PostGIS 16 + Redis 7)
- `infra/docker/init-postgis.sql`

### Scripts
- `scripts/seed-demo-data.ts` (comprehensive demo seed)

---

## What Codex Completed

### Phase 0 (Complete)
- Research alignment document
- Executive summary
- PRD
- MVP scope and roadmap
- System requirements specification
- High-level architecture diagram
- Backend module design document
- Monorepo structure document
- OpenAPI spec
- API usage examples
- RBAC permission matrix
- Tenant isolation policy
- Sequence diagrams (6 Mermaid files)

### Phase 1 (Complete)
- Root pnpm workspace with `apps/*` and `packages/*`
- `tsconfig.base.json` with strict settings
- `eslint.config.js` with TypeScript rules
- `.gitignore`, `.env.example`
- Docker Compose with PostgreSQL/PostGIS + Redis
- Init PostGIS SQL script

**Shared packages built and tested:**
- `shared-types` — Domain types (Role, Permission, TenantScopedRecord, GeoPoint, DemoUser)
- `validation` — `canAccessRecord()` (tenant-scoped RBAC) + `canSendLocation()` (privacy-first) + tests
- `event-contracts` — Zod-validated `trackingLocationRecordedSchema` + tests
- `maps-provider` — `MapsProvider` interface + `createMockMapsProvider` (nearest-neighbour routing) + tests
- `sync-engine` — `createMutationQueue` with idempotency dedup + retry budget + tests
- `api-client` — Typed `createApiClient` with `getSession`, `getOrganisationStatus`, `listOutlets`, `listLeads`, `listTerritories` + tests
- `ui` — `statusTone` constants
- `config` — Empty package.json (no src)

**Apps scaffolded:**
- `backend-medusa`: Medusa v2 config, 10 custom modules registered, medusa-config.ts, medusa build compiles
- `web-dashboard`: Next.js pages (Overview, Leads, Outlets, Territories) with server components, layout, navigation, CSS
- `mobile-field-sales`: React Native App.tsx, tracking-policy.ts
- `desktop-operations`: Electron main.ts with secure prefs (contextIsolation, no nodeIntegration)

**Backend specifics:**
- `db/client.ts` (PG pool singleton)
- `db/schema.sql` (PostGIS-enabled schema: organisation, app_user, role_permission, team, team_member, outlet, territory, lead, route_plan, route_stop, visit, field_product, field_order, notification, audit_log)
- `auth/tenant-auth.ts` and `auth/tenant-auth.test.ts` (requireTenantPermission, actorFromHeaders)
- `api/types.ts` (MedusaRouteRequest/Response)
- `api/v1/auth/session/route.ts`
- `api/v1/organisations/route.ts`
- `api/v1/leads/route.ts` (database-backed via query-service)
- `api/v1/outlets/route.ts` (database-backed via query-service)
- `api/v1/territories/route.ts` (database-backed via query-service)
- `dev-server.ts` (HTTP server routing to all endpoints + /health)

**Module scaffolding (10 modules, each with Medusa Module entry + service.ts + README.md):**
- organisation, identity-and-access, territory, lead-and-outlet, visit, tracking, route-planning, sync, notification, audit-and-compliance

**Advanced module code:**
- `modules/territory/repository.ts` (PostGIS envelope queries)
- `modules/territory/query-service.ts` + test (listTenantTerritories, isOutletInsideTerritory)
- `modules/lead-and-outlet/repository.ts` (PostGIS point queries)
- `modules/lead-and-outlet/query-service.ts` + test (listTenantOutlets, listTenantLeads, assignLeadToRep)
- `workflows/organisation/create-demo-organisation.ts`

**Seed data:**
- 1 organisation, 6 users, 15 outlets, 20 leads, 5 products, 2 territories, 3 route plans, 15 visits, 3 orders, 3 notifications
- scripts/seed-demo-data.ts with `--json`, `--sql`, `--db` modes
- Docker-verified seed path (schema + seed SQL)

### Phase 2 (Started)
- DB schema for tenant/RBAC
- Backend tenant auth helpers + tests
- RBAC validation package + tests
- Tenant isolation policy doc
- RBAC permission matrix doc
- Demo seed with role_permission table

### Phase 3 (Started)
- Lead/outlet repository + query service + tests
- Territory repository + query service + tests
- API routes wired to query services (leads, outlets, territories)
- API client methods for leads, outlets, territories

---

## What Is Incomplete

### Phase 2 Gaps
- No Medusa auth/session integration (still uses development header auth)
- No login page in web dashboard
- No actual authentication flow (no password verification, no JWT)
- Auth middleware not wired into Medusa

### Phase 3 Gaps
- Web dashboard pages use hardcoded demo data (`data.ts`) instead of API client
- No POST/PUT/DELETE routes for leads, outlets, territories
- No create/update/delete operations in query services
- No manager dashboard connected to real API
- No customer/lead address management
- Map provider not called from any route

### Phase 4 (Not Started)
- Route planning service not implemented
- Visit service/routes not implemented
- Check-in/check-out not implemented
- Geofence exception handling not implemented
- Assignments not implemented

### Phase 5 (Not Started)
- Tracking module service not implemented
- WebSocket infrastructure not set up
- Consent management not implemented
- Work session management not implemented
- Live map not implemented

### Phase 6 (Not Started)
- Products use custom `field_product` table, not linked to Medusa products
- Medusa commerce seed workflow not created
- Field order creation workflow not created

### Phase 7 (Not Started)
- Mutation queue exists in sync-engine package but no server-side sync handling
- No cursor-based pull endpoint
- No conflict resolution
- No idempotency key enforcement on server

### Phase 8 (Not Started)
- Reports not implemented
- Notifications backend not wired
- Retention jobs not implemented
- Observability not configured
- Hardening not done

---

## What Is Broken

1. **Development header auth** — All API routes use `x-field-sales-*` headers instead of Medusa auth tokens. Production Medusa auth/session integration is the next priority.

2. **Mobile app is a stub** — `App.tsx` returns `null`. No navigation, no screens, no native configuration. The React Native workspace needs full setup (metro config, native builds, screens).

3. **Dashboard uses mock data** — All pages import from `app/data.ts` instead of calling the API client.

4. **Config package is empty** — No source files in `packages/config/src/`.

5. **Missing docs/system/ directory** — Referenced in the prompt but doesn't exist. Event catalogue, schema overview not created.

6. **Docker port proxy auth** — Windows host PG client can't auth through Docker port proxy; Docker-network psql works.

7. **Field tables not linked to Medusa** — `field_product` and `field_order` are standalone tables.

8. **Module services are stubs** — All 10 module services return hardcoded strings instead of real business logic.

---

## What Documentation Says Should Happen Next

From `docs/engineering/implementation-progress.md`:

1. Replace development header auth with Medusa auth/session integration.
2. Implement database-backed module services for organisation, identity/access, leads, outlets and territories.
3. Connect `/api/v1/leads` and `/api/v1/outlets` to query services instead of placeholder arrays.
4. Create Medusa commerce seed workflow for products and field orders.
5. Build manager dashboard lead/outlet/territory pages against the typed API client.

**Note:** Items 2-3 are actually already done (routes use database-backed query services). The implementation-progress.md was written before these were completed.

---

## What I Will Work On Now

**Task:** Connect the web dashboard pages to the typed API client instead of local demo data.

This is the most impactful next step because:
- It closes the gap between the backend API and the frontend
- It validates the full stack (API routes → DB queries → API client → UI)
- It's a concrete, completable task with existing infrastructure
- It unblocks future work on auth, CRUD operations, and real-time features

**Specific changes:**
1. Update `app/page.tsx` to fetch data from API
2. Update `app/leads/page.tsx` to fetch from API client
3. Update `app/outlets/page.tsx` to fetch from API client
4. Update `app/territories/page.tsx` to fetch from API client
5. Add proper loading states (suspense)
6. Create a basic API client wrapper/hook for server components
7. Keep local demo data as fallback

---

## Assumptions

1. **ASSUMPTION-001**: The dev-server (header auth) will remain the auth mechanism until Phase 2 Medusa auth is wired. Dashboard will use dev headers for now.
2. **ASSUMPTION-002**: The backend dev server must be running for the dashboard to work. The dashboard should gracefully handle API failures.
3. **ASSUMPTION-003**: The seeded demo data in PostGIS is available when the API is running.
4. **ASSUMPTION-004**: Next.js server components can make HTTP requests to the backend API during SSR (the backend may not be running, so client-side fallback is safer).
5. **ASSUMPTION-005**: The `docs/system/` directory does not exist yet; it will be created when the event catalogue or schema overview docs are written.

---

## Blockers

- Docker daemon not running on this machine (cannot verify PostGIS seed path)
- No Medusa auth integration (cannot test real authentication flows)
- React Native Metro/native build not configured (mobile app is a stub)
- WebSocket server not set up (cannot test live tracking)

---

## Verification Status

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ Passes |
| `pnpm test` | ✅ 8 files, 16 tests passed |
| `pnpm typecheck` | ✅ Passes (tsc -b) |
| `medusa build` | ✅ Backend + Frontend build completed |
| Docker compose config | ✅ Verified by Codex |
| Seed script parse | ✅ JSON mode works, SQL mode works |
