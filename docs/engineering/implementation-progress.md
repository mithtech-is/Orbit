# Implementation Progress

## 2026-06-03 (Session 14 — Visit Proof Photos + Admin Visibility)

### Completed

- Replaced the mobile customer signature capture path with required visit proof photos:
  - Added `expo-image-picker` to the mobile app dependency manifest and Expo config permissions for camera/photo access.
  - Added `VisitCheckInScreen` proof photo controls for taking or uploading an image.
  - Uploaded proof photos through the existing tenant-scoped `/api/v1/uploads` endpoint using `category: "visit_proof_photo"` and the active `visitId`.
  - Required at least one uploaded proof photo before checkout can be queued.
- Added `apps/mobile-field-sales/src/visits/checkout-payload.ts` so checkout mutation construction is testable and includes uploaded proof photo ids in `extras`.
- Extended the API client contract with `VisitProofPhoto` and `VisitExtras.proofPhotos`; rebuilt `packages/api-client/dist`.
- Updated `GET /api/v1/visits/:id/extras` to include tenant-scoped proof photo metadata from the attachment table.
- Updated the admin dashboard visit detail panel to fetch protected upload objects through the API client and render proof photos inline.
- Confirmed the existing admin leads page already has an always-available `New lead` action when outlets exist; no separate duplicate lead-entry surface was added.

### Verification

| Command | Result |
|---|---|
| `corepack pnpm --filter @orbit/mobile-field-sales exec vitest run src/visits/checkout-payload.test.ts` | Passed, 2 tests |
| `corepack pnpm --filter @orbit/api-client exec vitest run src/client.test.ts` | Passed, 3 tests |
| `corepack pnpm --filter @orbit/api-client build` | Passed |
| `corepack pnpm --filter @orbit/backend-medusa build` | Blocked by current workspace dependency link state: missing `ioredis` / `ws` type resolution before changed route compilation |
| `corepack pnpm --filter @orbit/mobile-field-sales typecheck` | Blocked by current workspace dependency link state: many existing packages unresolved after pnpm store mismatch |
| `corepack pnpm --filter @orbit/web-dashboard typecheck` | Blocked by current workspace dependency link state plus stale `.next` React type artifacts; focused API-client declarations were rebuilt |

### Notes

- `pnpm add` could not complete because `node_modules` is linked to `C:\Users\supari_k\AppData\Local\pnpm\store\v3`, while Corepack pnpm is trying to use `C:\Users\KillerKoli\AppData\Local\pnpm\store\v3`. The dependency was added to `package.json`; a clean `pnpm install` from the current Windows user should fetch and link `expo-image-picker`.

## 2026-06-03 (Session 15 — Mobile App Name + APK Build Prep)

### Completed

- Recommended **Orbit** as the app/software name.
- Updated the mobile app display/build identifiers:
  - Expo name: `Orbit`
  - Slug: `fieldproof-mobile`
  - Scheme: `fieldproof`
  - Android package: `com.fieldproof.mobile`
  - iOS bundle id: `com.fieldproof.mobile`
- Updated the EAS `preview` Android profile to output an installable APK via `android.buildType: "apk"`.
- Repaired workspace dependency links by running `corepack pnpm install --force --store-dir .pnpm-store`.
- Added `.pnpm-store/` to `.gitignore` because the local store is only a Windows dependency-link workaround.

### Verification / Build Attempt

| Command | Result |
|---|---|
| `corepack pnpm --filter @orbit/mobile-field-sales dev` | Metro runs at `http://localhost:8081` after dependency relink |
| `corepack pnpm dlx eas-cli@latest build --platform android --profile preview --non-interactive` | Blocked: Expo account/token required (`eas login` or `EXPO_TOKEN`) |

### Next Step

- To produce the APK, authenticate Expo locally with `eas login` or set `EXPO_TOKEN`, then rerun `corepack pnpm dlx eas-cli@latest build --platform android --profile preview`.

## 2026-06-03 (Session 16 — Expense Reports + ERPNext Expense Claims)

### Completed

- Added ERP provider support for `expense_claim`:
  - Extended `ErpEntityType`, `ErpProvider`, no-op provider and ERPNext provider with `pushExpenseClaim`.
  - ERPNext adapter creates/updates draft `Expense Claim` documents from field visit expenses.
  - Expense claim sync is idempotent through `erp_entity_mapping` with `entity_type = 'expense_claim'`.
  - ERPNext expense claims require an existing Orbit rep → ERPNext Employee mapping; missing mappings are logged as best-effort sync failures and do not block local checkout.
- Wired visit expense sync after mobile offline checkout extras are persisted:
  - `visit.check_out` records `visit_expense` rows, then calls `syncVisitExpensesToErp`.
  - ERP sync remains best-effort so reps can still complete visits when ERPNext is unavailable.
- Added detailed admin expense reporting:
  - New backend endpoint: `GET /api/v1/reports/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD`.
  - Report rows include rep, outlet, visit date, category, amount, km, note and ERPNext sync status/id.
  - Per-rep totals include total amount, row count and ERP synced count.
- Added API client `ExpenseReport` type and `getExpenseReport()`.
- Added dashboard page `/reports/expenses` and Insights nav item “Expenses”.
- Tightened dashboard nav active matching so `/reports` does not also appear active on `/reports/expenses`.

### Verification

| Command | Result |
|---|---|
| `corepack pnpm --filter @orbit/backend-medusa exec vitest run src/modules/reports/expenses.test.ts src/integrations/expense-sync.test.ts src/modules/sync/dispatch.test.ts` | Passed, 3 files / 8 tests |
| `corepack pnpm --filter @orbit/backend-medusa build` | Passed |
| `corepack pnpm --filter @orbit/api-client build` | Passed |
| `corepack pnpm --filter @orbit/web-dashboard typecheck` | Passed |

## 2026-05-27 (Session 2 — OpenCode Continuation)

### Completed (Original Session)

- Inspected workspace: empty directory, not a Git repository.
- Read attached field-sales research documents and identified unrelated documents in Downloads.
- Created Phase 0 alignment, executive summary, PRD, MVP roadmap, SRS, architecture and core sequence diagrams.
- Created pnpm workspace foundation with shared packages for types, validation, events, maps, sync, config, UI and API client.
- Added tests-first baseline coverage for RBAC tenant isolation, location tracking eligibility, live tracking event payloads, mock route optimisation and offline mutation queue behaviour.
- Added app workspaces for backend Medusa scaffold, Next.js dashboard scaffold, React Native mobile scaffold and Electron operations scaffold.
- Added Docker Compose for PostgreSQL/PostGIS and Redis.
- Added `.env.example`, local development guide, environment variable documentation and demo seed fixture.
- Resolved React type compatibility between web and mobile by using React 18 across both scaffolds.
- Verified app-level scaffolds: web typecheck, mobile typecheck, backend build, desktop build, Docker Compose config and demo seed script.
- Added Phase 2 tenant/RBAC schema SQL with PostGIS-enabled outlet locations and audit log table.
- Added PostgreSQL-backed demo seed command with idempotent inserts for organisation, settings, users, role permissions, team membership and outlets.
- Added Medusa-style config, API route files and workflow scaffold for organisation/session foundation.
- Added backend tenant authorisation helpers and tests.
- Added typed API client, OpenAPI baseline, API usage examples, RBAC matrix and tenant isolation policy.
- Wired local backend scaffold server to `/health`, `/api/v1/auth/session` and `/api/v1/organisations`.
- Installed Medusa runtime packages at `2.15.3` and verified `medusa build` completes backend compilation, type generation and Admin frontend bundling.
- Added minimal Medusa module entrypoints and services for all required field-sales custom modules.
- Expanded demo data to 15 outlets, 20 leads, 2 territories, 3 route plans, 15 visits, 5 products, 3 orders and 3 notifications.
- Verified Docker-backed PostGIS schema and seed path through `docker exec` and row-count checks.
- Started Phase 3 with lead/outlet and territory query service foundations, tests, API route placeholders and OpenAPI entries.

### Completed (Session 2 — OpenCode Continuation)

- Performed full repository audit and wrote `docs/engineering/opencode-continuation-audit.md`.
- Connected web dashboard pages (Overview, Leads, Outlets, Territories) to the typed API client with fallback to local demo data:
  - Created `app/api-service.ts` with `apiClient` instance and `safeFetch` helper.
  - Updated `app/page.tsx` to fetch outlet/lead counts from API.
  - Updated `app/leads/page.tsx`, `app/outlets/page.tsx`, `app/territories/page.tsx` to fetch from API with fallback.
  - Added `"use client"` directive, loading states, and source indicators to all pages.
  - Added `.dashboardSummary` CSS class for API metric display.
  - Added `NEXT_PUBLIC_DEMO_*` env vars to `.env.example` for dev auth headers.
- Added POST API routes for lead and outlet creation:
  - Added `insertOutlet` and `insertLead` repository functions with PostGIS point insertion.
  - Added POST handlers in `api/v1/leads/route.ts` and `api/v1/outlets/route.ts` with input validation.
  - Updated `dev-server.ts` with `parseBody()` helper and POST routing for `/api/v1/leads` and `/api/v1/outlets`.
  - Added `createOutlet` and `createLead` methods to the typed API client.
  - Updated OpenAPI spec with new schemas (OutletSummary, LeadSummary, CreateOutletInput, CreateLeadInput) and POST path entries.
- Verified all validation passes:
  - `pnpm typecheck` — passes
  - `pnpm test` — 8 files, 16 tests passed
  - `medusa build` — Backend + Frontend build completes
  - `web-dashboard typecheck` — passes

### Verified By Continuation Audit (2026-05-27 Session 2)

- All 8 test files pass (16/16 tests) — `corepack pnpm test`
- Typecheck passes — `corepack pnpm typecheck`
- Medusa build compiles backend + frontend — `corepack pnpm --filter @orbit/backend-medusa medusa:build`
- `pnpm install` succeeds via corepack
- `/api/v1/leads` and `/api/v1/outlets` routes are already wired to database-backed query services (not placeholder arrays)
- Module query services exist for territory, lead-and-outlet with tests
- API client has typed methods for leads, outlets, territories
- Web dashboard pages still use local demo data (`app/data.ts`) instead of API client
- All 10 module services are stubs (return hardcoded strings)
- Mobile app is stub (App.tsx returns null)
- Config package has no src/ files
- No POST/PUT/DELETE routes exist for any domain
- No Medusa auth integration (header-based dev auth still in place)
- No WebSocket infrastructure
- Written `docs/engineering/opencode-continuation-audit.md`

### Commands Executed (Session 2)

- `corepack pnpm install`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm --filter @orbit/backend-medusa medusa:build`

### Completed (Session 2 — Phase 4 Start)

- Added check-in/check-out columns to visit table in schema.sql (checked_in_at, checked_out_at, check_in/out lat/lng, geofence_status).
- Created visit repository (`modules/visit/repository.ts`) with:
  - `queryVisits`, `queryVisitById` for reading
  - `checkInToVisit` — creates or updates visit with check-in location, geofence status
  - `checkOutFromVisit` — completes visit with outcome, notes, check-out time
- Created visit query service (`modules/visit/query-service.ts`) with `toVisitSummary` transformer.
- Created visit API routes (`api/v1/visits/route.ts`) with:
  - `GET` — list all visits (tenant-scoped)
  - `POST` with `action: "check_in"` — validates location, computes distance vs geofence radius, records visit
  - `POST` with `action: "check_out"` — records outcome, notes, check-out timestamp
  - Built-in Haversine distance calculation for geofence check
- Updated `dev-server.ts` with `/api/v1/visits` GET/POST routing and `parseBody()` helper.
- Updated API client (`packages/api-client`) with:
  - `VisitSummary`, `CheckInInput`, `CheckInResponse`, `CheckOutInput` types
  - `listVisits()`, `checkIn()`, `checkOut()` methods
- Updated `docs/api/openapi.yaml` with visit path, VisitSummary, CheckInRequest, CheckOutRequest schemas.
- Created `apps/web-dashboard/app/visits/page.tsx` — visit monitoring table with status, check-in/out times, geofence status, outcome.
- Added "Visits" link to dashboard navigation.
- Verified: `pnpm typecheck` ✅, `pnpm test` (16/16) ✅, `medusa build` ✅, `web typecheck` ✅

### Completed (Session 2 — Phase 5 Start)

- Added `consent_log`, `work_session`, and `location_ping` tables to schema.sql with indexes.
- Created tracking repository (`modules/tracking/repository.ts`) with:
  - `queryActiveSession`, `querySessionsToday`, `queryLatestConsent` queries
  - `recordConsent` — inserts consent and auto-stops active sessions on revocation
  - `startWorkSession` — creates a new active work session linked to consent
  - `stopWorkSession` — marks active session as stopped with end timestamp
- Created tracking API routes (`api/v1/tracking/route.ts`) with:
  - `GET` — list today's work sessions (tenant-scoped)
  - `POST` with `action: "record_consent"` — records tracking consent
  - `POST` with `action: "start_session"` — validates consent, checks for existing active session, creates new session
  - `POST` with `action: "stop_session"` — stops the active session
- Updated `dev-server.ts` with `/api/v1/tracking` GET/POST routing.
- Updated API client (`packages/api-client`) with:
  - `WorkSessionSummary`, `RecordConsentInput/Response`, `StartSessionInput/Response` types
  - `listSessions()`, `recordConsent()`, `startSession()`, `stopSession()` methods
- Updated `docs/api/openapi.yaml` with tracking paths, `WorkSessionSummary`, `RecordConsentRequest`, `StartSessionRequest`, `StopSessionRequest` schemas.
- Created `apps/web-dashboard/app/tracking/page.tsx` — session management page with start/stop buttons and today's session table.
- Added "Tracking" link to dashboard navigation.
- Added tracking permissions to dashboard demo user env defaults.
- Verified: `pnpm typecheck` ✅, `pnpm test` (16/16) ✅, `medusa build` ✅, `web typecheck` ✅

### Completed (Session 3 — Phase 6 Start)

- Created route-planning repository (`modules/route-planning/repository.ts`) with:
  - `queryRoutePlans`, `queryPlanWithStops` queries (reads route_plan + route_stop with outlet location via JOIN)
  - `createRoutePlan` — fetches outlet locations, runs greedy nearest-neighbour optimisation with priority sorting using inline Haversine distance, inserts plan + stops in a transaction
  - `assignRoutePlan`, `updateRouteStatus` for mutation
- Created route-planning API routes (`api/v1/route-plans/route.ts`) with:
  - `GET` — list all route plans with stops (tenant-scoped)
  - `POST` — create an optimised route plan (validates routeDate, stopIds[])
- Updated `dev-server.ts` with `/api/v1/route-plans` GET/POST routing.
- Updated API client (`packages/api-client`) with:
  - `RouteStopDetail`, `RoutePlanDetail`, `CreateRoutePlanInput` types
  - `listRoutePlans()`, `createRoutePlan()` methods
- Updated `docs/api/openapi.yaml` with route-plan paths, `CreateRoutePlanInput`, `RoutePlanDetail`, `RouteStopDetail` schemas; fixed duplicate `schemas` key and invalid schema-in-responses placement.
- Created `apps/web-dashboard/app/route-plans/page.tsx` — route plan management page with date picker, create button, collapsible stop lists.
- Added "Routes" link to dashboard navigation.
- Note: maps-provider package is ESM; route-plan repository uses inline Haversine/greedy algorithm to avoid CJS/ESM conflict within Medusa's CJS build.
- Verified: `pnpm typecheck` ✅, `pnpm test` (16/16) ✅, `medusa build` ✅, `web typecheck` ✅

### Completed (Session 3 — Auth Migration)

- Added `password_hash` column to `app_user` schema.
- Added `jsonwebtoken` and `bcryptjs` dependencies to backend.
- Created auth service (`auth/auth-service.ts`) with:
  - `signToken` / `verifyToken` — JWT sign/verify with configurable secret and 24h expiry
  - `hashPassword` / `verifyPassword` — bcrypt hash/compare
  - `findUserByEmail` — look up user by org + email
  - `getUserPermissions` — fetch role permissions from `role_permission` table
  - `ensureSeedUser` — creates `admin@fieldsales.local` / `admin123` demo user on server start
- Created auth middleware (`auth/auth-middleware.ts`) with `authenticateRequest` that:
  - Checks `Authorization: Bearer <token>` header first; validates JWT and returns actor
  - Falls back to dev header auth (`x-field-sales-*`) for backward compatibility
  - Throws `AuthorisationError` if neither is present
- Created login API route (`api/v1/auth/login/route.ts`) — accepts `{ email, password, organisationId }`, validates credentials, returns JWT + user info
- Updated dev-server with:
  - `POST /api/v1/auth/login` routing
  - Auto-seed of demo admin user on first request
- Migrated ALL route handlers (leads, outlets, territories, organisations, visits, tracking, route-plans, auth/session) from `actorFromHeaders()` to `authenticateRequest()`
- Updated API client with:
  - `LoginInput` / `LoginResponse` types
  - `login()` method — calls login endpoint, stores token
  - `setToken()` — manually set/update token
  - All `request()`/`post()` calls now use `Authorization: Bearer` header when token is set
- Verified: `pnpm typecheck` ✅, `pnpm test` (16/16) ✅, `medusa build` ✅

### Known Issues (Updated)

- `pnpm` is not directly installed as a shell command, but `corepack pnpm` works.
- Backend is currently a Medusa-compatible scaffold, not a fully wired Medusa v2 runtime.
- The Windows host `pg` client still reports password authentication failure through Docker Desktop's port proxy; Docker-network `psql` succeeds with the same configured credentials.
- Seeded `field_product` and `field_order` are field-sales demo tables; they are not yet Medusa product/order records.
- Development header auth still supported as fallback alongside JWT Bearer auth. Login endpoint (`POST /api/v1/auth/login`) uses email/password + bcrypt verification.
- JWT secret is a hardcoded dev default (`JWT_SECRET` env var) — must be configured for production.
- Mobile app is a stub (returns null).
- Config package has no source files.
- Most module services are stubs with hardcoded strings (tracking service still stub, but tracking has real repository).
- maps-provider package is ESM (`"type": "module"`), causing CJS import errors from Medusa's CJS build; route-planning repo inlines its own Haversine + greedy optimisation as a workaround.

### Next Tasks

1. Add login page to web dashboard with token storage (client-side JWT flow).
2. Add PUT/DELETE API routes for leads, outlets, territories.
3. Implement real database-backed module services for organisation, identity/access, sync, notification, audit-and-compliance.
4. Create Medusa commerce seed workflow for products and field orders.
5. Build WebSocket infrastructure for live tracking.
6. Build offline sync backend endpoints (cursor pull, mutation push, conflict resolution).
7. Add reports, notifications, retention jobs and observability.

### Completed (Session 3 — PUT/DELETE for Leads & Outlets)

- Added `updateLead`, `deleteLead`, `updateOutlet`, `deleteOutlet` repository functions.
- Added PUT/DELETE handlers in leads and outlets API route files (with `x-resource-id` header parsing).
- Updated `dev-server.ts` with `extractResourceId()` helper and PUT/DELETE URL routing.
- Updated API client with `updateLead`, `deleteLead`, `updateOutlet`, `deleteOutlet` methods.
- Verified: `pnpm typecheck` ✅, `pnpm test` (16/16) ✅, `medusa build` ✅

### Known Issues (Updated)

- `pnpm` is not directly installed as a shell command, but `corepack pnpm` works.
- Backend is currently a Medusa-compatible scaffold, not a fully wired Medusa v2 runtime.
- The Windows host `pg` client still reports password authentication failure through Docker Desktop's port proxy; Docker-network `psql` succeeds with the same configured credentials.
- Seeded `field_product` and `field_order` are field-sales demo tables; they are not yet Medusa product/order records.
- Development header auth still supported as fallback alongside JWT Bearer auth. Login endpoint (`POST /api/v1/auth/login`) uses email/password + bcrypt verification.
- JWT secret is a hardcoded dev default (`JWT_SECRET` env var) — must be configured for production.
- Mobile app is a stub (returns null).
- Config package has no source files.
- Most module services are stubs with hardcoded strings (tracking service still stub, but tracking has real repository).
- maps-provider package is ESM (`"type": "module"`), causing CJS import errors from Medusa's CJS build; route-planning repo inlines its own Haversine + greedy optimisation as a workaround.
- Territories still missing PUT/DELETE endpoints.
- Login page and auth guard created for web dashboard but layout may still need refinement for public routes.

## 2026-05-28 (Session 4 — Claude Continuation Audit)

### Audit
- Wrote `docs/engineering/claude-continuation-audit.md` after reading every file under `docs/`, `apps/`, `packages/`, `infra/`, `scripts/`, plus root configs.
- Identified 12 issues (B1–B12), the architecture deviation in route-planning (provider abstraction bypassed; missing `geocodeAddress` / `reverseGeocode` / `calculateDistanceMatrix` on the maps-provider interface), the absent `docs/system/` and `docs/database/` directories, and the empty mobile foundation.

### Code Changes
- `apps/web-dashboard/app/page.tsx` — removed unused type imports (`ListResponse`, `OutletSummary`, `LeadSummary`) flagged by `pnpm lint` as `@typescript-eslint/no-unused-vars` errors. (B4)

### Verification Run
| Command | Result |
|---|---|
| `pnpm test` | ✅ 8 files, 16/16 tests |
| `pnpm typecheck` (`tsc -b tsconfig.build.json`) | ✅ |
| `pnpm lint` | ❌ → ✅ after B4 fix |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ Backend 4.21s + Frontend 37.27s |
| `docker compose -f infra/docker/docker-compose.yml --env-file .env config` | ✅ |
| Containers | `fieldsales-postgres` healthy, `fieldsales-redis` healthy |

### Unresolved Errors / Known Bugs (carry-over from audit)
- **B1 (high):** `apps/backend-medusa/src/modules/route-planning/repository.ts` orders by `created_at` but `route_plan` schema has no such column. `GET /api/v1/route-plans` will throw `column "created_at" does not exist` at runtime. Fix planned as the first step of the next session.
- **B5/B6 (medium):** visit POST body type-casts and visit GET permission scope need tightening.
- **B8 (high, architecture):** `MapsProvider` missing `geocodeAddress`, `reverseGeocode`, `calculateDistanceMatrix`; route-planning bypasses the provider entirely (inline Haversine + greedy).
- **B9:** OpenAPI still advertises header-only auth and omits the `POST /api/v1/auth/login` endpoint.
- **B10 (medium):** `ensureSeedUser()` runs inside the per-request handler in `dev-server.ts` rather than at startup.
- **B11:** add `created_at` to `route_plan` (preferred resolution to B1).
- **B12:** dev-server uses exact-equality URL match; query strings break routes.
- Plus prior carry-over: mobile app stub, no WebSocket, no sync server endpoints, no Medusa-linked field orders, no audit-read API, no retention jobs.

### Next Step (per claude-continuation-audit.md §6)
Fix B1 by adding `created_at timestamptz NOT NULL DEFAULT now()` to `route_plan` in `apps/backend-medusa/src/db/schema.sql` (also serves Phase 15 audit needs), then begin Phase 5 React Native mobile foundation (JS layer only — navigation, login screen, today's-route screen, tracking-active banner, AsyncStorage token rehydrate, hooks for `useTrackingConsent`). Native projects deferred.

## 2026-05-28 (Session 5 — B1 Fix + Phase 5 Mobile Foundation)

### B1 / B11 — `route_plan.created_at`
- Added `created_at timestamptz NOT NULL DEFAULT now()` to the `CREATE TABLE route_plan` definition in `apps/backend-medusa/src/db/schema.sql` and a follow-on `ALTER TABLE route_plan ADD COLUMN IF NOT EXISTS created_at …` for upgrade-in-place safety.
- Added `route_plan_tenant_date_idx (organisation_id, route_date DESC, created_at DESC)` so the existing `ORDER BY route_date DESC, created_at DESC` in `modules/route-planning/repository.ts` is index-supported.
- DB not yet re-seeded this session; existing demo data will pick up the new column on the next `pnpm seed:demo` run.

### Database Documentation
- Created `docs/database/schema-overview.md` covering every table, its tenant column, FKs/indices, PostGIS columns, retention rules, and a "future tables" map for Phases 13/15 (`device_registration`, `mutation_record`, `sync_cursor`, `data_export_request`, `data_deletion_request`).

### Phase 5 — React Native Mobile Foundation (JS layer)
Native `android/` and `ios/` projects are still deferred; everything below typechecks and tests, but mounting on a device requires a follow-up to scaffold those projects on a host with the native toolchain.

Added to `apps/mobile-field-sales/package.json`:
- `@react-navigation/native ^7.0.14`, `@react-navigation/native-stack ^7.2.0`
- `react-native-screens ^4.4.0`, `react-native-safe-area-context ^5.0.0`
- `@react-native-async-storage/async-storage ^2.1.0`
- workspace deps: `@orbit/{api-client, validation, event-contracts, shared-types, sync-engine}`

New mobile source layout:
```
apps/mobile-field-sales/src/
├── App.tsx                              # SafeAreaProvider + AppNavigator wired with default probes
├── api-service.ts                       # apiClient + rehydrateAuth / loginAndPersist / logoutAndClear
├── auth/
│   ├── token-storage.ts                 # TokenStorage interface
│   ├── async-storage-token-store.ts     # AsyncStorage implementation
│   ├── in-memory-token-store.ts         # test-friendly impl
│   └── in-memory-token-store.test.ts
├── tracking/
│   ├── consent-policy.ts                # pure decideTracking(...) — encodes privacy rules
│   ├── consent-policy.test.ts           # 6 tests covering each block reason
│   └── use-tracking-consent.ts          # React hook composing consent + session + permission probes
├── routes/
│   ├── group-by-date.ts                 # groupRoutesByDate + isoDate helpers
│   └── group-by-date.test.ts
├── tracking-policy.ts                   # (existing constants preserved)
├── components/TrackingBanner.tsx        # always-visible tracking status banner
├── navigation/AppNavigator.tsx          # NativeStack: Login → RouteToday → VisitCheckIn, logout in header
└── screens/
    ├── LoginScreen.tsx                  # email/password/orgId form → apiClient.login
    ├── RouteTodayScreen.tsx             # apiClient.listRoutePlans → today's stops + banner + pull-to-refresh
    └── VisitCheckInScreen.tsx           # check_in → outcome/notes → check_out
```

Tracking privacy rules enforced by `decideTracking`:
- Reps only (`role === field_sales_representative`)
- Consent must be granted before any permission prompt
- Active work session required before tracking
- Foreground permission requested **before** background
- Banner shown whenever a session is active so the rep always sees status

Pinned `@types/react` to `18.3.12` and `@types/react-dom` to `18.3.1` in root `package.json` `pnpm.overrides` to resolve a duplicate-type-graph issue (web-dashboard's Next.js validator started failing once RN brought in `@types/react@18.3.29`).

### Verification Run
| Command | Result |
|---|---|
| `pnpm test` | ✅ 11 files, 27/27 tests (+11 vs Session 4) |
| `pnpm typecheck` (root `tsc -b`) | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ Backend 3.42s + Frontend 23.36s |
| `pnpm install` | ⚠️ Two soft peer-dep warnings (pre-existing): `picomatch@3` requested by Medusa's `fdir@6.1.1`; `react-native@>=0.82.0` requested by `react-native-screens@4.25.2`. Neither blocks typecheck/build. |

### Known Issues — Updated
- Native iOS/Android projects for mobile are not scaffolded. The JS layer is production-shaped and tested but cannot be mounted on a device until `react-native init`-style native projects are added (or migration to Expo + EAS development builds).
- `react-native-screens` resolved to `4.25.2` which advertises a peer of RN >= 0.82; functional impact only at native build time, not at type/test time.
- B2–B12 (other than B1/B11) remain open from the Claude continuation audit.

### Next Step
Phase 5 follow-up + roll into Phase 6 / Phase 12:
1. Add a mobile-side queue wiring for offline visit/check-in mutations using `@orbit/sync-engine` (currently the queue exists but no mobile code enqueues against it).
2. Wire actual permission probes once a permissions library is chosen (expo-location for an Expo dev build, or `react-native-permissions` for bare RN).
3. Start Phase 12 backend: add `POST /api/v1/tracking/pings` to ingest `location_ping` rows; gate by active session and rep ownership; plan WebSocket gateway design (Socket.IO vs `ws` + Redis pub/sub adapter).
4. Close remaining Phase 9 gap: territory PUT/DELETE + outlets-in-territory point-in-polygon endpoint.

## 2026-05-28 (Session 6 — Phase 9 Close-out + Phase 10 B8 Architecture Fix)

### Phase 9 — Territory Write-Side + Outlets-in-Territory
- `apps/backend-medusa/src/modules/territory/repository.ts` — added `insertTerritory`, `updateTerritory`, `deleteTerritory` using `ST_GeomFromText(..., 4326)` for MultiPolygon WKT input, plus `queryOutletsInTerritory(organisationId, territoryId)` using PostGIS `ST_Contains(territory.boundary, outlet.location::geometry)`. Tenant-scoped by composite predicate.
- `apps/backend-medusa/src/api/v1/territories/route.ts` — added `POST`, `PUT`, `DEL`, and `GET_OUTLETS` handlers; `territory:manage` permission for writes, `outlet:read` for the outlets-in-territory query.
- `apps/backend-medusa/src/dev-server.ts` — wired the new routes including a regex-matched `GET /api/v1/territories/:id/outlets` and `PUT/DELETE /api/v1/territories/:id` using the existing `extractResourceId` helper.
- `packages/api-client/src/client.ts` — added `CreateTerritoryInput`, `OutletsInTerritoryResponse`, and four new methods: `createTerritory`, `updateTerritory`, `deleteTerritory`, `listOutletsInTerritory`.

### Phase 10 B8 — `MapsProvider` Abstraction Restored
- Expanded `packages/maps-provider/src/provider.ts` with the three previously-missing methods: `geocodeAddress`, `reverseGeocode`, `calculateDistanceMatrix`. Added `GeocodeResult`, `ReverseGeocodeResult`, `DistanceMatrixCell`, `DistanceMatrixResult` types.
- Implemented all three in `packages/maps-provider/src/mock-provider.ts`:
  - `geocodeAddress` — deterministic hash → coordinate inside the Bengaluru bounding box (no network, reproducible).
  - `reverseGeocode` — formats a "Mock address near …" string echoing the coordinate.
  - `calculateDistanceMatrix` — Haversine pairwise on inputs, durationMinutes = `ceil(meters/500)`.
- Added 3 new tests in `packages/maps-provider/src/mock-route-provider.test.ts` covering each new method's contract.
- `apps/backend-medusa/src/modules/route-planning/repository.ts` — **removed the inlined Haversine + greedy planner**. `createRoutePlan` now:
  1. Loads outlet coordinates.
  2. `await import("@orbit/maps-provider")` (dynamic import bridges ESM↔CJS so the same code works under `medusa develop` and `tsx dev-server.ts`).
  3. Calls `provider.optimiseRoute(...)` with the rep start, stops, and a working window built from `routeDate`.
  4. Persists `route_plan` + `route_stop` rows in a transaction using the provider's `provider` + `providerReference` values.
- `MAP_PROVIDER` env (currently `mock` only) selects the implementation. Real providers (mapbox/osrm) are now an additive change inside `loadMapsProvider()` — no business-logic refactor required.

### OpenAPI Updates (closes B9)
- Documented `POST /api/v1/auth/login` request/response.
- Added `POST /api/v1/territories`, `PUT/DELETE /api/v1/territories/{id}`, `GET /api/v1/territories/{id}/outlets`.
- Added `CreateTerritoryInput` schema.
- Added `bearerAuth` (HTTP Bearer / JWT) security scheme alongside the legacy `fieldSalesHeaders` (kept as documented fallback).

### Verification Run
| Command | Result |
|---|---|
| `pnpm test` | ✅ 11 files, 30/30 tests (+3 maps-provider) |
| `pnpm typecheck` (root `tsc -b`) | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ Backend 4.52s + Frontend 24.63s |

### Bugs Closed This Session
- **B1** / **B11**: schema `route_plan.created_at` added (Session 5) — list query no longer broken.
- **B8**: `MapsProvider` extended, route-planning routed through it. Architecture deviation eliminated.
- **B9**: OpenAPI now documents Bearer auth + login endpoint + full territory CRUD surface.

### Known Issues — Updated
- B2 (port-default mismatch in `db/client.ts` fallback), B3 (web layout hydration), B5/B6 (visit body typing + permission scoping), B7 (config package tsconfig), B10 (per-request seed), B12 (URL exact-equality routing) remain open.
- Mobile native projects + permission probes still deferred.
- Phase 12 (location ping ingestion + WebSocket) not started.
- Phase 13 (sync server) not started.
- Phase 14 (Medusa-linked field orders) not started.

### Next Step
1. **Phase 12 backend foundation** — `POST /api/v1/tracking/pings` to insert into `location_ping` (gate by active session and rep ownership), `POST /api/v1/tracking/consent/revoke` to revoke consent + cascade-stop the session, and a retention sweep stub for `raw_location_retention_days`. WebSocket gateway design decision (Socket.IO + Redis adapter vs `ws` + custom pub/sub) — pick one and stand up a minimal `/ws/tracking` channel that fans out location events to authorised managers only.
2. **Audit-log writes** — make the lead/outlet/visit/route POST/PUT/DEL handlers write `audit_log` rows (closes part of Phase 15 prep).
3. **Phase 11 hardening** — fix B5 (POST visit body typing) and B6 (`visit:write` for GET should be a dedicated `visit:read` permission, plus rep-owned filtering on the list query).
4. **Phase 14** — Medusa commerce seed workflow that creates real Medusa products from `field_product` rows; a `createFieldOrder` workflow that uses Medusa cart/order modules instead of `field_order`.
5. Address B8 (architecture): expand `MapsProvider` interface to include `geocodeAddress`, `reverseGeocode`, `calculateDistanceMatrix`, then route `modules/route-planning/repository.ts.createRoutePlan` through the provider instead of inline Haversine + greedy.

## 2026-05-28 (Session 7 — Phase 12 Location Tracking + WebSocket Gateway)

### Backend — Tracking REST Surface
- `apps/backend-medusa/src/modules/tracking/ping-validation.ts` — pure `validatePings(unknown)` that coerces optional `accuracyMeters` / `recordedAt`, per-item error reporting so a single malformed ping doesn't drop the batch (5 tests).
- `apps/backend-medusa/src/modules/tracking/repository.ts` — added `revokeConsent` (marks latest consent revoked + cascade-stops the active session, returns explicit flags for audit), `insertLocationPings` (batched insert; `ON CONFLICT (organisation_id, id) DO NOTHING` for idempotent retries), and `sweepExpiredPings` (retention sweep using `organisation_setting.raw_location_retention_days`).
- `apps/backend-medusa/src/api/v1/tracking/route.ts` — rewritten to route on `action`. New actions: `revoke_consent`, `record_pings`. Every action writes an `audit_log` entry (`tracking.consent.recorded`, `tracking.consent.revoked`, `tracking.session.started`, `tracking.session.stopped`, `tracking.location.batch_recorded`).
- `apps/backend-medusa/src/modules/audit-and-compliance/repository.ts` — new module repo with `writeAuditLog` and `queryAuditLog` (action-prefix filter, capped at 500 rows). First real database-backed implementation of an audit-and-compliance module method.

### Backend — WebSocket Gateway
- Added deps: `ws ^8.18.0`, `@types/ws ^8.5.13`.
- `apps/backend-medusa/src/realtime/ws-filter.ts` — pure `canSubscriberReceive(subscriber, event)` encoding the prompt's manager access rules: cross-tenant blocked, `tracking:view_live` required, `platform_admin`/`organisation_admin` see tenant-wide, `sales_manager` sees only reps on their `managedTeamIds`, everyone else blocked (5 tests).
- `apps/backend-medusa/src/realtime/ws-gateway.ts` — attached to the existing HTTP server via `attachWsGateway(server)`. Path `/ws/tracking`. JWT via `?token=` query param (verified through the existing `verifyToken`). First inbound JSON message may carry `managedTeamIds` for manager filtering. In-memory subscriber set; `broadcastTrackingEvent(event)` walks the set, applies the pure filter, returns sent count. Sockets cleaned up on close/error.
- `dev-server.ts` updated to `attachWsGateway(server)` and log the WS URL on startup.
- Ping ingestion now broadcasts a `tracking.location.recorded` event per accepted ping to authorised subscribers.

### Client surface
- `packages/api-client/src/client.ts` — added `revokeConsent()`, `recordPings(pings)`, plus types `LocationPingInput`, `RecordPingsResponse`, `RevokeConsentResponse`, `TrackingLocationRecordedEvent`.
- `apps/web-dashboard/app/live-map/page.tsx` — new client component. Opens a WebSocket to `${NEXT_PUBLIC_WS_URL}/ws/tracking?token=<jwt>`, displays each `tracking.location.recorded` event in a table (most recent first, capped at 100). Connection state visible in the header. Added "Live Map" entry to `app/navigation.tsx`.

### OpenAPI Updates
- `RecordConsentRequest` retained; added `RevokeConsentRequest`, `RecordPingsRequest` schemas.
- `/api/v1/tracking` POST `oneOf` now lists all five actions.
- `bearerAuth` listed as the preferred security scheme for tracking endpoints (legacy `fieldSalesHeaders` kept as documented fallback).

### Verification Run
| Command | Result |
|---|---|
| `pnpm test` | ✅ 13 files, **40/40 tests** (+10 vs Session 6: 5 ping-validation + 5 ws-filter) |
| `pnpm typecheck` (root `tsc -b`) | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ Backend 4.21s + Frontend 23.50s |

### Bugs Closed This Session
- Audit-log write path now exists (a Phase 15 prerequisite); five tracking actions all write entries.

### Known Issues — Updated
- Mobile-side ping queue + permission probes still deferred (Phase 5 follow-up).
- WebSocket broker is in-memory; horizontal scaling will require a Redis pub/sub adapter — design pending.
- B2, B3, B5, B6, B7, B10, B12 still open from the Claude continuation audit.
- Lead/Outlet/Visit/Route mutation handlers do **not yet** write audit logs — only tracking does. Adding that is the next slice.
- No retention scheduler — `sweepExpiredPings` exists but is only callable from code; a cron / Medusa job has not been wired.

### Next Step
1. **Audit-log writes on all mutation handlers** — wrap lead/outlet/territory/visit/route POST/PUT/DEL in `writeAuditLog(...)` calls so every tenant mutation is auditable per the prompt's Phase 15 requirement.
2. **`GET /api/v1/audit-log`** — paginated read endpoint gated by `audit:read`, supporting the action-prefix filter from `queryAuditLog`.
3. **Phase 13 sync foundation** — add tables `device_registration`, `mutation_record`, `sync_cursor` (per `docs/database/schema-overview.md` "future tables"); design `POST /api/v1/sync/push` + `GET /api/v1/sync/pull?cursor=...` with idempotency-key enforcement and conflict records, wiring `@orbit/sync-engine`'s `MutationQueue` semantics into the server.
4. **Phase 14** — Medusa commerce seed workflow that creates real Medusa products from the demo seed; new `createFieldOrder` workflow that uses Medusa cart/order modules and links to the outlet/rep via metadata, deprecating `field_order` for new writes.
5. **Retention scheduler** — schedule `sweepExpiredPings` per tenant nightly; log row counts to `audit_log`.

## 2026-05-28 (Session 8 — Run-apps + Audit Reads + Phase 13 Sync + Retention)

### Apps Started End-to-End
- Brought up `fieldsales-postgres` + `fieldsales-redis` containers on **port 15432** (host had a local Postgres on 5432; reassigning the docker mapping closes the conflict — closes B2).
- Applied `schema.sql` + ran `pnpm seed:demo:sql | docker exec psql` → 1 org / 6 users / 15 outlets / 20 leads / 2 territories / 3 route plans / 15 visits.
- Backend (`tsx dev-server.ts`) listening on `http://localhost:9000` + WS at `ws://localhost:9000/ws/tracking`.
- Web dashboard (Next 15.5.18) on `http://localhost:3000`.
- Electron desktop running, four processes, loading the dashboard URL with `contextIsolation`/`nodeIntegration:false`.

### Bugs Closed In Passing
- **B2**: `.env` now uses `POSTGRES_PORT=15432` + matching `DATABASE_URL` to avoid the host-Postgres conflict on Windows dev boxes.
- **B10**: `ensureSeedUser` moved from the per-request `handleRequest` path into a startup `bootstrap()` block.
- **B12**: dev-server now matches routes against a query-string-stripped `urlPath`, plus `extractResourceId` operates on the same.
- **New real bug**: `findUserByEmail` SELECT omitted the `active` column → every login failed `!user.active` → "Invalid credentials". Added `active` to the projection.
- **Seed gap**: `organisation_admin` had `policy:manage` / `audit:read` only; expanded `permissionsByRole` to include `lead:*`, `outlet:*`, `territory:manage`, `route:plan`, `tracking:view_live`, `visit:write` per the RBAC matrix; backfilled via direct INSERT into the running DB.

### Audit Writes on All Mutation Handlers
- Wrapped `lead`, `outlet`, `territory`, `visit`, and `route-plan` POST/PUT/DEL handlers in `writeAuditLog(...)` calls. Actions: `lead.{created|updated|deleted}`, `outlet.{created|updated|deleted}`, `territory.{created|updated|deleted}`, `visit.{checked_in|checked_out}`, `route_plan.created`. Closes the Phase 15 prerequisite called out in Session 7.
- `apps/backend-medusa/src/api/v1/audit-log/route.ts` — new `GET /api/v1/audit-log?actionPrefix=&limit=` endpoint gated by `audit:read`, capped at 500 rows.
- `apps/web-dashboard/app/audit-log/page.tsx` — new "Audit" page with action-prefix filter + clear button.
- API client: `listAuditLog(input?)` + `AuditEntry` type.

### Phase 13 — Offline Sync Foundation
New tables in `apps/backend-medusa/src/db/schema.sql`:
- `device_registration` (id PK, organisation_id, user_id, platform, app_version, push_token, first/last_seen_at)
- `sync_cursor` ((organisation_id, device_id, resource) PK, cursor, updated_at)
- `mutation_record` ((organisation_id, idempotency_key) PK — **idempotency enforced at the DB level**, plus device_id, user_id, mutation_type, payload, status `applied|conflict|rejected`, result, error, received_at, processed_at)
- `sync_conflict` (id PK, organisation_id, idempotency_key, mutation_type, reason, client_payload, server_state, created_at)
- Plus `device_registration_user_idx`, `mutation_record_user_idx`, `sync_conflict_tenant_time_idx`.

New module files:
- `modules/sync/repository.ts` — `upsertDevice`, `findMutationByKey`, `recordMutation`, `recordConflict`, `getCursor`, `setCursor`.
- `modules/sync/dispatch.ts` — server-side dispatcher mapping mutation `type` → handler. Today: `visit.check_in`, `visit.check_out`, `tracking.location.batch`. Returns a normalised `MutationResult` so the route layer can persist consistently.

New API:
- `POST /api/v1/sync/push` — accepts `{ deviceId, platform?, appVersion?, mutations: [{ idempotencyKey, type, payload }] }`. For each mutation: dedupe via `mutation_record`, dispatch, persist outcome. Conflicts also append a `sync_conflict` row for later review.
- `GET /api/v1/sync/pull?deviceId=&resource=&since=` — cursor-based delta pull. Resources: `visits`, `outlets`, `leads`, `route-plans`. Server keeps a per-`(tenant, device, resource)` cursor in `sync_cursor`; first call auto-upserts the device row.

API client: `syncPush(input)`, `syncPull(input)`, plus `SyncMutationInput`, `SyncPushResponse`, `SyncPullResponse<T>`.

### Retention Scheduler
- `apps/backend-medusa/src/jobs/retention-scheduler.ts` — `runRetentionSweep()` iterates every tenant, calls `sweepExpiredPings(org)`, writes a `tracking.location.retention_swept` audit row with the deleted count. `startRetentionScheduler()` is opt-in via `RETENTION_SWEEP_ENABLED=true` and interval `RETENTION_SWEEP_INTERVAL_MS` (default 24h). First sweep runs immediately so failures surface early.
- Wired into `bootstrap()` in `dev-server.ts` after `ensureSeedUser`.
- Verified live: backend log shows `[retention] swept tenants=1 deleted=0` on startup.

### End-to-End Verification (live backend)
| Step | Result |
|---|---|
| `POST /api/v1/auth/login` | ✅ JWT issued; org admin perms cover all CRUD + tracking:view_live |
| `GET /api/v1/outlets` `/leads` `/territories` `/route-plans` `/visits` `/tracking` | ✅ 15 / 20 / 2 / 3 / 15 / 0 rows |
| `GET /api/v1/audit-log` | ✅ 2 baseline entries |
| `POST /api/v1/sync/push` (visit.check_in, idem-1) | ✅ `applied`, returns visit_sync_1 |
| `POST /api/v1/sync/push` (same idem-1 replayed) | ✅ returns cached `applied` result — **no re-execute** |
| `GET /api/v1/sync/pull?deviceId=dev_test_1&resource=visits` | ✅ 16 visits (15 seeded + 1 from sync push); cursor advanced |
| Retention scheduler interval tick | ✅ "swept tenants=1 deleted=0" logged |

### Verification Sweep (post-changes)
| Command | Result |
|---|---|
| `pnpm test` | ✅ 13 files, 40/40 tests |
| `pnpm typecheck` (root) | ✅ |
| `pnpm lint` | ✅ (fixed 2 unused-var nits in sync route) |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ Backend 4.18s + Frontend 25.13s |

### Known Issues — Updated
- B3 (web layout hydration), B5/B6 (visit POST typing + visit:read scope), B7 (config tsconfig) still open.
- Sync `dispatch.ts` currently does **not** write audit-log entries — the sync layer only persists `mutation_record` rows. Wiring audit writes from the dispatch layer is a small follow-up.
- The retention scheduler is in-process; horizontal scale will need a real job queue (BullMQ on the existing Redis container is the obvious choice).
- Mobile app does not yet call the new `syncPush`/`syncPull` endpoints — that's the next mobile slice.
- WS broker is still in-memory; Redis pub/sub adapter for horizontal scale still pending.
- Phase 14 (Medusa-linked field orders) not started.

### Next Step
1. **Phase 14 — Medusa commerce integration**: register Medusa's `product`, `inventory`, `cart`, `order` modules in `medusa-config.ts`; replace the seed's `field_product` insert with a Medusa product workflow; create `createFieldOrder` workflow that uses Medusa cart/order modules and links to outlet/rep via metadata.
2. **Mobile sync wiring**: in `apps/mobile-field-sales`, add an `OfflineQueue` that enqueues check-in/check-out into `@orbit/sync-engine`'s `MutationQueue`, then flushes via `apiClient.syncPush` when network returns; pull-to-refresh calls `apiClient.syncPull`.
3. **Audit writes from sync dispatch** + a `GET /api/v1/sync/conflicts` endpoint for managers to review unresolved conflicts.
4. **WS Redis pub/sub adapter** so the gateway scales across instances.
5. **B3 / B5 / B6 cleanup pass.**

## 2026-05-28 (Session 9 — CORS + Sync Conflicts + Mobile Sync + Visit Hardening + Commerce Layer)

### Browser Login Broken → Fixed (CORS)
The Electron-hosted dashboard couldn't log in because `dev-server.ts` had no CORS handling — every browser preflight/cross-origin call from `http://localhost:3000 → http://localhost:9000` failed. Added a CORS layer:
- Echoes `Access-Control-Allow-Origin` for any origin in `AUTH_CORS` (defaults to `http://localhost:3000,http://localhost:5173`); `*` for non-browser callers.
- Handles `OPTIONS` preflight (204) with `Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`, `Allow-Headers: authorization,content-type,x-field-sales-*,x-resource-id`, `Allow-Credentials: true`, `Max-Age: 600`.
- Verified: preflight returns 204 with the expected headers; actual POST returns 200 with `Access-Control-Allow-Origin: http://localhost:3000`. The Electron app's login form now succeeds against the running backend.

### Sync Dispatch Audit + Conflicts Endpoint
- Sync `POST /api/v1/sync/push` now writes `sync.mutation.{applied|conflict|rejected}` audit entries with mutation type, device id, conflict reason, and error (closes a follow-up flagged in Session 8).
- New `GET /api/v1/sync/conflicts?limit=` for `audit:read`. Returns `sync_conflict` rows with idempotency key, mutation type, reason, client payload, server state, timestamp.
- API client: `listSyncConflicts(input?)` + `SyncConflict` type.
- New dashboard page **"Conflicts"** (`/sync-conflicts`).

### Mobile Sync Wiring
- `apps/mobile-field-sales/src/sync/offline-queue.ts` — `createOfflineSync({ deviceId, push })` wraps `@orbit/sync-engine.createMutationQueue` and adds a `flush()` that drains pending mutations into `apiClient.syncPush`. Per-result it calls `markSynced` / `markFailed` so the queue's retry-budget + `needs_review` accounting still applies.
- `offline-queue.test.ts` — 3 tests: idempotency-key dedup + per-result status routing; whole-batch network failure paths every pending mutation to `failed`; no-op flush.
- Mobile is now ready to drive `apiClient.syncPush` from any screen; wiring the actual UI hook is the next mobile slice.

### Visit Hardening (B5 + B6)
- **B5** — `POST /api/v1/visits` body is now typed `Record<string, unknown>` with `readNumber` / `readString` helpers that accept both `number` (real JSON) and `string` (legacy form-encoded). `outletId`, `visitId` are validated as strings; lat/lng must be finite numbers in range; `geofenceRadiusMeters` defaults to 100 if missing/invalid. No more "lie of the cast".
- **B6** — `GET /api/v1/visits` permission gate is now `visit:write` (matches the RBAC matrix where managers have "review only" + reps have "own visits"). For reps, the SQL is filtered to `assigned_user_id = actor.userId`; managers/admins/ops see the full tenant set. Response now carries a `repScoped` boolean so the UI knows which view it's looking at.
- Repository `queryVisits` signature now `(organisationId, assignedUserId?)`.

### Phase 14 — Commerce Layer
The custom dev-server runtime doesn't host Medusa's native module container, so Phase 14 ships a real commerce path against the existing PG schema (`field_product`, `field_order`) and documents the Medusa-native migration as a future runtime swap:
- `apps/backend-medusa/src/modules/commerce/repository.ts` — `listProducts`, `listFieldOrders`, `createFieldOrder`. The order creator runs a transactional `BEGIN ... COMMIT` block with `FOR UPDATE` row locks on `field_product`, validates inventory, decrements `inventory_available`, inserts `field_order`, and returns `{ id, totalCents, status }`. Function-level doc explicitly calls out the Medusa cart/order swap-in point.
- `GET /api/v1/products` (gated `outlet:read`), `GET /api/v1/field-orders` (gated `report:read`), `POST /api/v1/field-orders` (gated `order:create`) — POST writes a `field_order.created` audit log entry with the line items + totalCents.
- API client: `listProducts`, `listFieldOrders`, `createFieldOrder` + `ProductSummary` / `FieldOrderSummary` / `CreateFieldOrderInput`.
- New dashboard page **"Orders"** (`/field-orders`) — outlet/product/quantity form + live order table.
- Verified live: posted `outletId=outlet_2; lines=[{prod_1, 3}, {prod_2, 1}]` → server returned `totalCents=29000`, `status=accepted`; `field_orders` count went from 3 → 4; `field_order.` audit prefix returned 1 entry.

### Verification Sweep
| Command | Result |
|---|---|
| `pnpm test` | ✅ 14 files / **43 tests** (+3 offline-queue) |
| `pnpm typecheck` (root) | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ backend 3.81s + frontend 24.03s |

### Live Browser-Origin Probe (cross-origin from `http://localhost:3000`)
| Step | Result |
|---|---|
| `OPTIONS /api/v1/auth/login` preflight | ✅ 204; `aco=http://localhost:3000` |
| `POST /api/v1/auth/login` | ✅ 200; token issued |
| `GET /api/v1/products` | ✅ 5 |
| `GET /api/v1/field-orders` | ✅ 3 → 4 after POST |
| `POST /api/v1/field-orders` (outlet_2 + 2 lines) | ✅ 201; totalCents=29000 |
| `GET /api/v1/sync/conflicts` | ✅ 0 |
| `GET /api/v1/visits` (org admin) | ✅ 16 (tenant-wide) |

### Bugs Closed
- **B5** — visit POST body typing hardened.
- **B6** — visit GET uses `visit:write` gate + rep-owned scope.
- Browser login (no bug id) — CORS handled.

### Open Items
- **B3** (web layout hydration shape) — still open; functional, but the `localStorage` read in render is a hydration smell.
- **B7** (`packages/config` has no `tsconfig.json`) — still open; the package isn't currently consumed at runtime so it's cosmetic.
- **Medusa-native runtime swap** — switching from `dev-server.ts` to `medusa develop` and registering Medusa's product/inventory/cart/order modules is now the highest-leverage next move. `modules/commerce/repository.ts` is structured so `createFieldOrder` becomes a thin adapter over the Medusa cart/order workflows once the runtime swap is in place.
- **WS Redis pub/sub adapter** for horizontal scale of the tracking gateway.
- **Mobile UI ↔ offline queue** — `RouteTodayScreen`/`VisitCheckInScreen` need to enqueue through `createOfflineSync` instead of calling `apiClient.checkIn` directly. The plumbing exists and is tested; only the screen wiring is left.
- **Native iOS/Android projects** for the mobile app (deferred since session 5).

### Next Step
1. Wire `RouteTodayScreen` + `VisitCheckInScreen` to enqueue through `createOfflineSync` and flush on app foreground / network recovery; add a pull-to-refresh that calls `apiClient.syncPull`.
2. Switch backend runtime to `medusa develop`; register Medusa's `product`, `inventory`, `cart`, `order` modules in `medusa-config.ts`; make `createFieldOrder` call the Medusa cart workflow instead of the PG transaction.
3. Add Redis pub/sub broker behind `broadcastTrackingEvent` so multiple backend instances can fan out to the same set of subscribers.
4. Add native projects (`react-native init` or migrate to Expo + EAS) for mobile so the screens that already typecheck can mount on device.
5. Optional polish: fix B3 (move the layout localStorage read into state), add a `tsconfig.json` to `packages/config`.

## 2026-05-28 (Session 10 — Demo Wipe + Real Map Providers + Expo Dev Build)

### Demo Wipe (user-confirmed: "wipe demo, keep dev admin")
- `scripts/seed-demo-data.ts` — added `--minimal` mode. Bootstraps only `organisation`, `organisation_setting`, `app_user` (7 personas incl. dev admin), `role_permission` (36 rows), `team`, `team_member`. Skips outlets / leads / territories / route_plans / route_stops / visits / field_products / field_orders / notifications.
- Added `pnpm seed:minimal` and `pnpm seed:minimal:sql` to root scripts.
- Truncated demo tables and re-applied `seed:minimal` → DB now has `1 org / 7 users / 36 perms / 0 outlets / 0 leads / 0 visits / 0 routes / 0 territories`.
- Removed dashboard fallback module `apps/web-dashboard/app/data.ts`; updated `app/{leads,outlets,territories}/page.tsx` to render from API only, with empty-state messages instead of seeded mock arrays.
- Verified: dashboard now shows "No leads yet. Create one via API or seed data." until real data is POSTed.

### Real Map Providers (user-confirmed: "all three behind one factory")
New provider implementations, env-selected:
- `packages/maps-provider/src/mapbox-provider.ts` — Mapbox Geocoding v5 (forward + reverse), Optimized Trips v1, Directions Matrix v1. `MAPBOX_TOKEN` required.
- `packages/maps-provider/src/google-provider.ts` — Google Geocoding API (location_type → confidence mapping), Directions API with `optimize:true`, Distance Matrix API. `GOOGLE_MAPS_API_KEY` required.
- `packages/maps-provider/src/osrm-provider.ts` — OSRM `/trip` + `/table` for routing/matrix, Nominatim `/search` + `/reverse` for geocoding. No key; needs `OSRM_USER_AGENT` per Nominatim usage policy. `OSRM_BASE_URL` + `NOMINATIM_BASE_URL` overridable for self-hosted nodes.
- All three pass typed-fetcher-based unit tests (13 new tests total): URL construction, response parsing, waypoint reordering, distance/duration cell flattening.
- `apps/backend-medusa/src/modules/route-planning/repository.ts.loadMapsProvider` rewritten as a factory that picks based on `MAP_PROVIDER` + credential availability; **falls back to the deterministic mock when the chosen provider's credential is missing** so the system never silently calls the wrong endpoint.
- `.env` + `.env.example` updated: `MAP_PROVIDER`, `MAPBOX_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OSRM_USER_AGENT`, `OSRM_BASE_URL`, `NOMINATIM_BASE_URL`.
- `packages/maps-provider/src/index.ts` now exports `createMapboxMapsProvider`, `createGoogleMapsProvider`, `createOsrmMapsProvider` alongside the existing `createMockMapsProvider`.

Caught while writing tests: my first take on Mapbox/OSRM `optimiseRoute` confused `waypoint_index` (position in the optimised trip) with input index. Fixed both providers: now we pair each waypoint with its INPUT position, sort by `waypoint_index` ascending, and emit stops in optimised order. Three tests proved the fix end-to-end.

### Expo Dev Build (user-confirmed: "scaffold an Expo dev build")
- Switched `apps/mobile-field-sales/package.json` to be an Expo app: `main: index.js`, scripts `dev: expo start --dev-client`, `android: expo run:android`, `ios: expo run:ios`, plus `build:android`/`build:ios` invoking `eas build`.
- Added deps: `expo ~52.0.0`, `expo-location ~18.0.0`, `expo-status-bar ~2.0.0`. Pinned RN-ecosystem versions to the Expo 52 compatibility matrix (`react-native@0.76.5`, `@react-native-async-storage/async-storage@1.23.1`, `react-native-safe-area-context@4.12.0`, `react-native-screens@~4.4.0`).
- New files:
  - `app.config.ts` — Expo config: dark UI, `scheme: fieldsales`, iOS bundle `com.fieldsales.mobile`, Android package `com.fieldsales.mobile`, iOS `Info.plist` strings explaining why location is needed (foreground + background), Android permissions for ACCESS_*_LOCATION + ACCESS_BACKGROUND_LOCATION + FOREGROUND_SERVICE_LOCATION, and the `expo-location` plugin with explicit foreground/background usage strings.
  - `babel.config.js` — `babel-preset-expo`.
  - `index.js` — `registerRootComponent(App)`.
  - `eas.json` — development / preview / production build profiles.
  - `src/tracking/location-probes.ts` — wraps `expo-location`:
    - `probeForegroundLocationPermission` / `probeBackgroundLocationPermission` — current state only, never request.
    - `requestForegroundLocationPermission` / `requestBackgroundLocationPermission` — explicit triggers, to be called by UI based on `useTrackingConsent`'s `nextRequest` field. **Enforces "foreground before background"** because the policy returns `nextRequest === "foreground"` first.
    - `getCurrentPosition` — `Location.getCurrentPositionAsync({ accuracy: High })`.
- `src/App.tsx` now wires the real probes into `defaultProbes`; the existing `useTrackingConsent` hook keeps working unchanged (proves the policy abstraction is clean).
- `pnpm install` brought in 282 new packages cleanly.

To build a runnable dev client on a real device:
1. Set up an Expo account + `eas login`.
2. From `apps/mobile-field-sales`: `pnpm exec eas build:configure` (one-time).
3. `pnpm build:android` (Android, builds in the cloud, returns an APK) or `pnpm build:ios` (iOS, requires Apple Developer credentials).
4. Install the dev client APK/IPA, then `pnpm dev` to start the bundler. The dev client connects over LAN/tunnel.

### Verification Sweep
| Command | Result |
|---|---|
| `pnpm test` | ✅ 17 files, **56 tests** (+13 maps providers) |
| `pnpm typecheck` (root) | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ (after Expo deps installed) |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ backend 6.15s + frontend 31.80s |
| Live demo-wipe probe | ✅ `outlets/leads/territories = 0/0/0`; login works; POST creates real outlet (id `outlet_1779950696358`); audit_log records `outlet.created` |

### Open Items (Phase Status, Updated)

| Phase | State | What's left |
|---|---|---|
| 0–2, 4, 7, 8, 9, 10, 11, 12, 13 | ✅ | — |
| 3 — Medusa backend foundation | ⚠️ | Swap dev-server.ts → `medusa develop` runtime |
| 5 — React Native mobile | ⚠️ JS layer + Expo config ✅ | Connect screens to `createOfflineSync`; run `eas build` to produce a device-installable dev client; once installed, the real GPS probes already work |
| 6 — Electron desktop | ⚠️ minimal | Operations-only UI / preload bridge / IPC for desktop-specific flows (manager review, bulk import) |
| 14 — Field orders through Medusa | ⚠️ PG layer ✅ | Native Medusa cart/order modules once Phase 3 runtime swap lands |
| 15 — Reports / hardening | ⚠️ partial | Reports + dashboards, retention operationalisation (BullMQ), Sentry + observability, rate-limiting / helmet / CSRF |

**Net: 5 phases still have remaining work**, mostly concentrated in two big-ticket items: (a) Medusa-native runtime swap (which then unlocks Phase 14 cleanly), and (b) finishing Phase 15 hardening.

### Next Step
1. Run `eas build:configure` + `pnpm build:android` to produce an installable Android dev client; install on a device; confirm `expo-location` permission probes return real `granted` / `denied` values and pings flow into `POST /api/v1/tracking` action=record_pings.
2. Wire `RouteTodayScreen` + `VisitCheckInScreen` to enqueue check-ins via `createOfflineSync.enqueueMutation`, flush on app foreground via `apiClient.syncPush`; pull-to-refresh via `apiClient.syncPull`.
3. Switch backend runtime to `medusa develop`; register Medusa's `product`, `inventory`, `cart`, `order` modules in `medusa-config.ts`; rewrite `createFieldOrder` to call Medusa's cart workflow.
4. Add Redis pub/sub adapter behind `broadcastTrackingEvent` for horizontal WS scale.
5. When you have keys: set `MAP_PROVIDER=mapbox` (or `google`/`osrm`) + token in `.env` and restart — route planning calls hit the real provider immediately. No code change required.

## 2026-05-28 (Session 11 — Phases 3 / 5 / 6 / 14 / 15 close-out)

### Phase 5 — Mobile screens wired to offline sync
- `apps/mobile-field-sales/src/sync/use-offline-sync.ts` — single hook owning the queue. Generates a stable per-process `deviceId`, binds `apiClient.syncPush` as the network bridge, exposes `flushNow`, and listens to `AppState` so mutations auto-flush every time the app returns to the foreground.
- `VisitCheckInScreen` rewritten to enqueue check-in / check-out via `sync.enqueueMutation(...)` with stable `idempotencyKey`s — never blocks UI on network. Shows live "N mutation(s) queued offline" indicator.
- `RouteTodayScreen` accepts `flushNow` + `pendingMutations` and surfaces both in the header; pull-to-refresh now triggers `flushNow` alongside the route + consent refreshes.
- `AppNavigator` owns the `useOfflineSync()` instance and passes it down to both screens.

### Phase 6 — Electron operations shell
- `apps/desktop-operations/src/preload.ts` — context-isolated bridge exposing exactly four methods on `window.fieldSalesDesktop`: `saveTextFile`, `getWindowState`, `openExternal`, `getAppInfo`. Renderer cannot touch Node directly.
- `apps/desktop-operations/src/window-state.ts` — load/save `width/height/x/y` to `app.getPath("userData")/window-state.json`.
- `apps/desktop-operations/src/menu.ts` — native menu with File (Reload dashboard + quit), Edit, View (fullscreen, devtools), **Operations** (open API health / OpenAPI spec in browser), Help.
- `apps/desktop-operations/src/main.ts` — sandboxed `BrowserWindow` with `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, preload registered. IPC handlers: file size cap (50 MB), URL allowlist for `shell.openExternal`. External links open in the OS browser; same-origin links stay inside the window.
- `apps/web-dashboard/app/desktop-bridge.ts` — typed renderer-side wrapper. `exportTextFile()` uses the bridge when present, falls back to a browser `<a download>`. `toCsv()` typed generic helper.
- Outlets page gets an **Export CSV** button labelled "(desktop save dialog)" vs "(download)" depending on context.

### Phase 14 — Medusa workflow seam over commerce
- `apps/backend-medusa/src/workflows/commerce/create-field-order.ts` — `runCreateFieldOrderWorkflow(input, hooks)` defines the **stable public surface** for order creation. Today it delegates to the PG `createFieldOrder`; when Medusa cart/order modules land it becomes a thin adapter over `cartModuleService.create` + `cartModuleService.complete` without touching callers.
- The route handler `POST /api/v1/field-orders` now goes through the workflow and uses its `emit` hook for audit-log writes (one call point instead of side-effects scattered across the route).
- Output schema now includes `provider: "field_order_pg" | "medusa_cart_order"` so clients can confirm which backend served the request.
- 2 new tests covering happy path + `emit` hook semantics.

### Phase 15 — Hardening + reports
- `apps/backend-medusa/src/http/security.ts` — Helmet-equivalent headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, and a tight `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (the API returns JSON only).
- `apps/backend-medusa/src/http/rate-limit.ts` — pure sliding-window rate limiter with three tunable buckets: `auth` (20/min), `ingest` (600/min — for `POST /api/v1/tracking` and `/sync/push`), `general` (300/min). 4 tests covering window math + per-bucket routing. Swap the in-memory `Map` for a Redis ZSET when scaling horizontally — same function signature.
- `apps/backend-medusa/src/http/request-logger.ts` — JSON-line request log with correlation id, method, path, status, duration, client IP. Health checks suppressed.
- `apps/backend-medusa/src/http/sentry.ts` — dependency-free Sentry envelope POST guarded by `SENTRY_DSN`. Fire-and-forget; failures never break the request path. Replace with `@sentry/node` when standardising.
- `dev-server.ts` wired:
  - Security headers applied to every response (incl. OPTIONS).
  - Per-request `x-correlation-id`.
  - Rate limit decision before route handler runs; returns 429 with `x-ratelimit-*` headers when over budget.
  - `try / catch / finally` now reports 5xx errors to Sentry, includes correlation id in error responses, and always logs the request entry.
- Reports module: `loadTenantSummary` (one PG roundtrip with sub-selects) + `loadRepActivity` (per-rep aggregations with `FILTER (WHERE ...)` for completed/exception counts and order totals).
- New endpoints: `GET /api/v1/reports/summary`, `GET /api/v1/reports/rep-activity` (both gated by `report:read`).
- API client: `getReportSummary`, `listRepActivity` + matching types.
- New dashboard page **/reports** with summary metrics + per-rep activity table; added "Reports" to the nav.

### Phase 3 — Medusa-runtime compatibility shim
- `apps/backend-medusa/src/api/medusa-adapter.ts` — `mountMedusaRoute(handler)` wraps existing `(MedusaRouteRequest, MedusaRouteResponse)` handlers as the `(MedusaRequest, MedusaResponse)` shape that `medusa develop` expects. Includes `x-resource-id` forwarding from Medusa's parsed `:id` param and raw URL pass-through via `x-request-url`.
- 3 tests covering header forwarding, params → header bridge, raw-URL pass-through.
- **Cutover path:** in each `src/api/v1/*/route.ts`, change exports from `export { GET, POST } from "./impl"` to `export const GET = mountMedusaRoute(legacyGet)`. Same impl bodies; one-line wrapping per route. `medusa-config.ts` already registers all 10 modules.
- I did NOT execute the cutover this session because `medusa develop` requires running its own DB migrations alongside our `schema.sql` and supervised testing of every route. The shim is the riskiest part; what remains is mechanical.

### Verification Sweep
| Command | Result |
|---|---|
| `pnpm test` | ✅ 20 files, **65 tests** (+9 vs Session 10: 4 rate-limit + 3 medusa-adapter + 2 workflow) |
| `pnpm typecheck` (root) | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/desktop-operations build` | ✅ |
| `pnpm --filter @orbit/backend-medusa medusa:build` | ✅ backend 4.92s + frontend 25.66s |
| Live probe | ✅ Security headers present, `x-correlation-id` set, `x-ratelimit-limit/remaining/reset` set, `/api/v1/reports/summary` returns live numbers |

### Phase Status (FINAL)

| Phase | State |
|---|---|
| 0–2, 4, 7, 8, 9, 10, 11, 12, 13 | ✅ Complete |
| 3 — Medusa backend foundation | ✅ Foundation complete; **runtime cutover ready via `mountMedusaRoute` shim**, deferred to a supervised release window |
| 5 — React Native mobile | ✅ JS layer + Expo config + offline-queue wiring + screen integration. **Native `eas build` requires your Expo account.** |
| 6 — Electron desktop | ✅ Secure preload bridge, native menu, IPC contract, CSV export, window state persistence |
| 14 — Field orders | ✅ Commerce layer + Medusa workflow seam (`runCreateFieldOrderWorkflow`). Medusa-native cart/order swap is a 1-file delegation change behind the seam. |
| 15 — Reports / hardening | ✅ Security headers, rate limit, request logger, Sentry envelope, reports summary + rep-activity endpoints + dashboard page |

**All 16 phases now have shippable deliverables.** Two items are explicitly deferred to operator action: (a) running `medusa develop` + the route-shim cutover under supervision and (b) `eas build` for the mobile native client.

### Open Tail
- **Medusa-native cart/order:** `runCreateFieldOrderWorkflow` already routes through a seam; the swap is internal to that one file.
- **Redis pub/sub for WS:** `broadcastTrackingEvent` is single-instance; swap the in-memory subscriber set for a Redis channel when running >1 backend pod.
- **Rate-limit horizontal scale:** in-memory `Map` → Redis ZSET behind the same `checkRateLimit` signature.
- **Sentry SDK:** the envelope POST works; replace with `@sentry/node` for breadcrumbs + auto-instrumentation when the team standardises.
- **Real map provider keys:** drop them into `.env` and the factory in `loadMapsProvider` switches with zero code change.
- **CSV export on more pages:** the bridge handles any table — leads/visits/orders can add the same button trivially.

### Next Operator Steps
1. `pnpm exec eas login` and `eas build:configure` in `apps/mobile-field-sales`, then `pnpm build:android` to ship an installable dev client.
2. Decide on the Medusa runtime cutover window. The mechanical migration is: per route file, change `export { GET, POST }` → `export const GET = mountMedusaRoute(GET); export const POST = mountMedusaRoute(POST);`. Then run `medusa develop` instead of `tsx dev-server.ts`.
3. Provision real provider credentials (Mapbox / Google / OSRM) when ready and set `MAP_PROVIDER=<name>` + `*_TOKEN/*_KEY/*_USER_AGENT` in `.env`.
4. When backend instances scale: install BullMQ + a Redis-backed rate-limit store and swap the in-memory implementations.

## 2026-05-28 (Session 12 — Final production-readiness audit + critical fixes)

### Deliverables
- `docs/engineering/final-production-readiness-audit.md` — phase-by-phase pass/fail table, verified claims (per-feature), validation results, categorised blockers, fake-completion list, live E2E results.
- `docs/engineering/api-keys-and-services.md` — every external service the platform can talk to, with free-tier flags, open-source alternatives, signup URLs, env var names. Prefers free + self-hosted (MinIO, GlitchTip, OSRM, Keycloak, PostHog).
- `docs/engineering/local-development-guide.md` — full end-to-end runnable guide. Prereqs → install → docker → env → seed → run backend/web/mobile/desktop → 15-step E2E PowerShell snippet → troubleshooting.

### Critical bugs found while auditing (all fixed live)
- **F1 (Critical) — RBAC denied reps on every tenant-scoped read.** `canAccessRecord` rep branch returned `record.ownerUserId === actor.userId`; without an explicit `ownerUserId` the rep got false. Reps couldn't list outlets, leads, anything. Fix: rep-owner check applies only when an explicit `ownerUserId` is named. Tenant-scoped operations rely on the permission grant alone. Fixed in BOTH `packages/validation/src/rbac.ts` and `apps/backend-medusa/src/auth/tenant-auth.ts` (drift). 3 new regression tests pin behaviour.
- **F2 (Critical) — Demo non-admin users had no `password_hash`.** Only the auto-created `admin@fieldsales.local` could log in. Reps couldn't authenticate. Fix: `ensureSeedUser` now backfills the dev password hash onto every seeded user where `password_hash IS NULL`. Idempotent — only fills nulls.
- **F3 (High) — `POST /api/v1/visits` check-out 500'd with "could not determine data type of parameter $3"** when `notes` was null. pg client passed `null` for `$3` and Postgres couldn't infer the type in `CASE WHEN $3 IS NOT NULL THEN $3 ELSE notes END`. Fix: rewrote UPDATE to use `COALESCE($3::text, notes)` with explicit casts on all nullable parameters.
- **F4 (High) — Self-action routes (tracking, visits, sync push, field-orders) didn't pass `ownerUserId`** so even with F1 fixed, rep writes would not be allowed under stricter scoping later. Fix: each route now passes `{ organisationId, ownerUserId: actor.userId }` so the rep-as-owner gate is explicit + safe against future tightening.

### Live verification — 15-step MVP E2E flow against real backend on `localhost:9000`
| Step | Result |
|---|---|
| 1. Admin login | ✅ JWT issued |
| 2. Create territory (MultiPolygon WKT) | ✅ `territory_…` returned |
| 3. Create outlets | ✅ via POST `/api/v1/outlets` |
| 4. Create route plan | ✅ 2 stops, `plannedDistanceMeters=3519` (mock provider) |
| 5. Rep login (`rep1@acme-fieldsales.test`) | ✅ **after F2** |
| 6. Rep records consent + starts session | ✅ **after F1/F4** |
| 7. Rep sends pings | ✅ `inserted=2` |
| 8. Rep checks in via direct REST | ✅ `geofence=within, dist=0m` |
| 9–13. Offline check-in via `/sync/push` + idempotent replay | ✅ `applied` → `applied` (cached) |
| 14. Admin sees `/reports/summary` updated | ✅ live counts |
| 15. Audit log captures all actions | ✅ `tracking.*=6, sync.*=2, visit.*=2, outlet.*, territory.*, route_plan.*` |

### Verification sweep (post-fixes)
| Command | Result |
|---|---|
| `pnpm test` | ✅ 20 files, **68 tests** (+3 RBAC regression) |
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/desktop-operations build` | ✅ |
| `docker compose ... config` | ✅ |

### Production-readiness status
**MVP-ready for internal/pilot deployment with the live `dev-server.ts` runtime.** Two items remain explicitly deferred to the operator (not codeable here): `eas build` for an installable mobile dev client, and the `medusa develop` runtime cutover (mechanical 1-line-per-route change using the `mountMedusaRoute` shim).

### Next operator step
1. Use `pnpm seed:minimal` (org + dev admin only) or `pnpm seed:demo` (full 15-outlet seed) per `docs/engineering/local-development-guide.md` §5.
2. `pnpm --filter @orbit/backend-medusa dev:scaffold` to run the production runtime.
3. `pnpm --filter @orbit/web-dashboard dev` for the dashboard at `:3000`.
4. (Optional) `cd apps/mobile-field-sales && pnpm exec eas login && pnpm build:android` for an installable mobile client.
5. (Optional) drop a real Mapbox/Google/OSRM credential into `.env` and set `MAP_PROVIDER=<name>` — `loadMapsProvider` switches with zero code change.

## 2026-05-28 (Session 13 — Ship-blocker fix pass for pilot launch)

### Completed

**Phase 1 — Security blockers**
- Added `apps/backend-medusa/src/config/env.ts`: central env validator with fail-fast in production. Requires `JWT_SECRET` (≥32 chars, must not be the dev fallback), `DATABASE_URL`, `REDIS_URL`, `APP_URL`, `AUTH_CORS`. Rejects `ENABLE_DEMO_SEED=true` in production. Defaults `RETENTION_SWEEP_ENABLED=true` in production.
- Added `apps/backend-medusa/src/config/env.test.ts` — 9 cases covering all rejection paths and dev defaults.
- Rewrote `auth-service.ts` to route through `getEnv()`. `ensureSeedUser()` returns `{skipped, reason}` and short-circuits in production unless explicitly opted in.
- New `createUserWithPassword()` enforces ≥12-char passwords and refuses predictable prefixes (`admin|password|changeme|fieldsales|routepilot`) in production. Writes `password_change_required` flag.
- New CLI `pnpm create-initial-admin` (`apps/backend-medusa/src/cli/create-initial-admin.ts`) — prompts for password from stdin or `INITIAL_ADMIN_PASSWORD` env, creates org if missing, seeds role_permission rows.
- Schema: `app_user.password_change_required boolean NOT NULL DEFAULT false` added with `ADD COLUMN IF NOT EXISTS` for in-place upgrade.
- Login response now carries `passwordChangeRequired` so clients can route to the change-password flow.

**Phase 2 — Real maps**
- Rewrote `apps/web-dashboard/app/live-map/page.tsx` using MapLibre GL JS 4.7.1 with an inline OSM raster style (no API key). Custom marker DOM with `#00aaff` pills, popups (rep name / last update / session id / accuracy), `fitBounds` for multi-rep + `easeTo` for single-rep. Live WS updates merge by `repUserId`. Loading / empty / error overlays.
- Added `maplibre-gl: ^4.7.1` to `apps/web-dashboard/package.json`.

**Phase 3 — Fake metrics removed (regression test)**
- Added `apps/web-dashboard/app/page.regression.test.ts` — reads page source and asserts no hardcoded `"Active reps","3"`-style placeholders can be reintroduced.

**Phase 4 — Mobile production build**
- Added `docs/engineering/mobile-production-build-guide.md` covering EAS prerequisites, one-time setup, daily dev loop, production build, required env vars, permission testing checklist, known iOS/Android limitations, optional CI build job.

**Phase 5 — User invite/onboarding**
- `POST /api/v1/users` (org-admin only, `user:manage`) — generates 16-char base-58 temp password, writes `user.invited` audit row, returns `{id, temporaryPassword, passwordChangeRequired, message}`.
- `POST /api/v1/users/me/password` for self password change. Writes `user.password_changed` audit row.

**Phase 6 — Migrations + backup runbook**
- Added `node-pg-migrate: ^7.9.0` + scripts (`migrate`, `migrate:up`, `migrate:down`).
- Baseline migration `apps/backend-medusa/migrations/1700000000000_initial-schema.sql` with full `-- Up` / `-- Down` SQL.
- New docs: `docs/engineering/database-migration-guide.md` + `docs/engineering/backup-and-restore-runbook.md` (cadence, restore drills, RPO/RTO targets, GDPR retention alignment).

**Phase 7 — Docker + CI**
- `apps/backend-medusa/Dockerfile` + `apps/web-dashboard/Dockerfile` — multi-stage Node 22 Alpine, pnpm via corepack.
- `.github/workflows/ci.yml` with 4 jobs: `validate` (lint/typecheck/test across all packages), `migrate-check` (brings up postgis service, runs migrations), `docker-build` (both images), `prod-env-validation` (env tests).

**Phase 8 — Retention sweep on by default in production**
- `retention-scheduler.ts` now reads `env.retentionSweepEnabled` from the validator instead of `process.env`.
- Default behaviour: ON in production (set `RETENTION_SWEEP_ENABLED=false` to disable), OFF in development unless opted in.

**Other**
- Added `docs/security/production-security-checklist.md` — 9 sections with explicit SQL/commands to verify each item.
- Added `docs/engineering/pilot-readiness-report.md` — tier-by-tier verdicts (Internal demo / Pilot / Small / Medium / Enterprise) with live-curl evidence for each of the 10 pilot questions.

### Verification sweep
| Command | Result |
|---|---|
| `pnpm test` | ✅ 22 files, **80 tests** (+12 new) |
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm --filter @orbit/web-dashboard typecheck` | ✅ |
| `pnpm --filter @orbit/web-dashboard build` | ✅ |
| `pnpm --filter @orbit/mobile-field-sales typecheck` | ✅ |
| `pnpm --filter @orbit/desktop-operations build` | ✅ |
| Backend in dev mode | ✅ `env=development retention=off`, `/health` 200 |
| Backend in `NODE_ENV=production` without secrets | ✅ Fail-fast `EnvError: JWT_SECRET must be set in production.` |
| `POST /api/v1/users` invite | ✅ returned temp password + `passwordChangeRequired:true` |
| `GET /live-map` | ✅ 200 OK, MapLibre rendering with OSM tiles |

## 2026-06-10 (Session 16 — ERPNext-primary product catalog + online order sync)

### Completed

- Added `pullProducts`, `searchProducts`, `pullProductStock` methods to `ErpProvider` interface (`erp-provider.ts`)
- Implemented all three in the ERPNext provider (`erpnext-provider.ts`):
  - `pullProducts` — fetches all Items via `/api/resource/Item`
  - `searchProducts` — searches Items by name via `item_name like %query%`
  - `pullProductStock` — reads stock from the Bin doctype (`actual_qty`, `reserved_qty`, `ordered_qty`)
- Added `pullProductsFromErp()` in `erp-sync.ts` — orchestrates pull from ERPNext, upserts into `field_product` by SKU, and persists entity mappings
- Added `upsertProductBySku()` in the commerce repository — upserts by `(organisation_id, sku)` unique constraint
- Rewrote `products/route.ts`:
  - `POST` → creates ERPNext Item first (`pushProduct`), caches locally on success; falls back to local-only if ERPNext is unreachable
  - `PUT` → updates ERPNext Item first, updates local cache; falls back to local-only
  - `GET` → reads from local cache; supports `X-Refresh: true` header to trigger pull-from-ERPNext first
  - Responses include `erpId` when the ERP sync succeeds
- Enhanced `field-orders/route.ts`:
  - When `source === "online"` → syncs to ERPNext Sales Order synchronously, returns `erpOrderId` in response
  - When `source === "offline"` → existing best-effort async sync (unchanged)
- Changed `syncFieldOrderToErp()` to return the ERP Sales Order id (was `void`)
- Added `product-catalog-sync.ts` scheduled job — pulls products from ERPNext for all orgs every 15 minutes (configurable via `PRODUCT_CATALOG_SYNC_INTERVAL_MS`, disabled via `PRODUCT_CATALOG_SYNC_ENABLED=false`)
- Registered product catalog sync in dev-server bootstrap
- Fixed Medusa-era test artifact in `dispatch.test.ts` (removed `medusaOrderId` assertion)

### Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx vitest run` | ✅ 23 files, 120 tests |

### Status
**Pilot-ready for 1 customer / ≤20 reps / single instance.** See `docs/engineering/pilot-readiness-report.md` for tier-by-tier verdicts. All ship-blockers from the user's prompt are fixed and verified; remaining gaps (HA, SSO, automated backups, Medusa runtime cutover) are explicitly out of scope for pilot.
