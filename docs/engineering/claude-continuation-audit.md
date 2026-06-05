# Claude Continuation Audit

## Audit Date
2026-05-28

## Audit Scope
Full repository read: all docs in `docs/`, root configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `AGENTS.md`, `.env`, `.env.example`), `infra/docker/`, `scripts/`, every file under `apps/` (backend Medusa scaffold, web dashboard, mobile, desktop) and every shared package under `packages/`. Findings below are based on actual files on disk — not on `implementation-progress.md` claims.

## 1. Current Folder Structure

```
Orbit/
├── AGENTS.md
├── package.json                 # pnpm workspace root; scripts for test, typecheck, lint, seed, dev:*
├── pnpm-workspace.yaml          # apps/*, packages/*
├── pnpm-lock.yaml
├── tsconfig.base.json           # strict, NodeNext, ES2022
├── eslint.config.js             # ESM flat config
├── .env  .env.example
├── docs/
│   ├── 00-research-alignment-and-implementation-contract.md
│   ├── 01-executive-summary.md
│   ├── 02-prd.md
│   ├── 03-mvp-scope-and-roadmap.md
│   ├── 04-system-requirements-specification.md
│   ├── api/openapi.yaml                                    # 3.1, header-auth security scheme
│   ├── api/api-usage-examples.md
│   ├── architecture/{high-level,monorepo,backend-medusa-module-design}.md
│   ├── diagrams/*.mmd                                      # 6 Mermaid files
│   ├── engineering/implementation-progress.md
│   ├── engineering/opencode-continuation-audit.md          # prior agent's audit
│   ├── engineering/{local-development,environment-variables,seed-data-and-demo}.md
│   └── security/{rbac-permission-matrix,tenant-isolation-policy}.md
├── infra/docker/{docker-compose.yml,init-postgis.sql}      # PostGIS 16 + Redis 7
├── scripts/seed-demo-data.ts                               # tsx; --json | --sql | --db
├── apps/
│   ├── backend-medusa/                                     # Medusa v2.15.3 scaffold + node:http dev-server
│   │   ├── medusa-config.ts                                # registers all 10 custom modules
│   │   ├── src/
│   │   │   ├── index.ts                                    # backendScaffold metadata only
│   │   │   ├── dev-server.ts                               # ★ actual runtime (node:http)
│   │   │   ├── db/{client.ts, schema.sql}                  # pg.Pool + full multi-tenant schema
│   │   │   ├── api/types.ts                                # custom MedusaRouteRequest/Response
│   │   │   ├── api/v1/{auth/login, auth/session, organisations, leads, outlets, territories, visits, tracking, route-plans}/route.ts
│   │   │   ├── auth/{auth-service.ts, auth-middleware.ts, tenant-auth.ts(+.test.ts)}
│   │   │   ├── workflows/organisation/create-demo-organisation.ts
│   │   │   └── modules/
│   │   │       ├── organisation/      {index, service, README}
│   │   │       ├── identity-and-access/{...}
│   │   │       ├── territory/         {index, service, README, repository, query-service(+.test)}
│   │   │       ├── lead-and-outlet/   {index, service, README, repository, query-service(+.test)}
│   │   │       ├── visit/             {index, service, README, repository, query-service}
│   │   │       ├── tracking/          {index, service, README, repository}
│   │   │       ├── route-planning/    {index, service, README, repository}
│   │   │       ├── sync/              {index, service, README}          # service stub only
│   │   │       ├── notification/      {index, service, README}          # service stub only
│   │   │       └── audit-and-compliance/{index, service, README}        # service stub only
│   │   └── dist/, .medusa/types/                           # build outputs (medusa build succeeds)
│   ├── web-dashboard/                                      # Next.js 15
│   │   └── app/{layout, navigation, api-service, data, page, login, leads, outlets, territories, visits, tracking, route-plans}.tsx
│   ├── mobile-field-sales/                                 # React Native 0.76.5 — stub
│   │   └── src/{App.tsx (returns null), tracking-policy.ts}
│   └── desktop-operations/                                 # Electron 33 — loads dashboard URL
│       └── src/main.ts
└── packages/
    ├── shared-types/      src/{domain,index}.ts             # Role, Permission, GeoPoint, DemoUser
    ├── validation/        src/{rbac(+.test),index}.ts       # canAccessRecord, canSendLocation
    ├── event-contracts/   src/{events(+.test),index}.ts     # Zod tracking.location.recorded
    ├── maps-provider/     src/{provider,mock-provider(+.test),index}.ts  # MapsProvider iface + mock
    ├── sync-engine/       src/{mutation-queue(+.test),index}.ts # idempotent in-memory queue
    ├── api-client/        src/{client(+.test),index}.ts     # typed client w/ JWT + CRUD methods
    ├── ui/                src/index.ts                      # statusTone constants
    └── config/            src/index.ts                      # defaultTenantPolicy (no tsconfig.json)
```

Missing directories that downstream docs reference:
- `docs/system/` (event-catalogue.md not created)
- `docs/database/` (schema-overview.md not created)
- `infra/github-actions/`, `infra/deployment/` (referenced in `monorepo-structure.md` but not created)

## 2. What Has Already Been Built (code-verified)

### Phase 0 — Documentation/Audit — ✅ Complete
All planning docs, PRD, SRS, architecture, RBAC matrix, tenant isolation policy, OpenAPI 3.1, 6 sequence diagrams, OpenCode continuation audit.

### Phase 1 — Monorepo Foundation — ✅ Complete
pnpm@9.15.4 workspace, strict TS base config, ESLint flat config, 4 apps + 8 packages registered, root scripts wired.

### Phase 2 — Docker / Postgres / PostGIS / Redis — ✅ Complete
`infra/docker/docker-compose.yml` brings up `postgis/postgis:16-3.4` + `redis:7-alpine` with healthchecks and named volumes. Init script enables `postgis` and `pgcrypto`. `.env`/.env.example wire `DATABASE_URL`, `REDIS_URL`, JWT/cookie secrets, map provider, push provider, S3, retention.

### Phase 3 — Medusa Backend Foundation — ⚠️ Partial
- Medusa runtime packages installed at `2.15.3` (`@medusajs/{framework,medusa,cli,admin-sdk,dashboard,draft-order,admin-shared}`).
- `medusa-config.ts` registers all 10 custom field-sales modules.
- `medusa build` succeeds (Backend + Admin frontend bundle compile).
- All 10 modules have `index.ts` (Medusa `Module(...)` wrapper) and `service.ts` (class with `listTenantModules()` stub for 7 of 10).
- **Gap:** the actual HTTP runtime is `src/dev-server.ts` (raw `node:http`), not `medusa develop`. Routes use a custom `MedusaRouteRequest/Response` interface that's structurally similar to Medusa's but not the same import. There is no evidence `medusa develop` was started end-to-end; the dev-server is what the OpenCode session validated.
- Schema applies via `apps/backend-medusa/src/db/schema.sql` executed by the seed script — there are no Medusa MikroORM migrations or `medusa db:setup`-driven schema for the custom modules.

### Phase 4 — Next.js Dashboard Foundation — ✅ Complete
- Next.js 15.1.3 app router, client-side rehydrated JWT auth.
- `app/api-service.ts` instantiates the typed `@orbit/api-client`, stores token in `localStorage`, exposes `loginUser`/`logoutUser`/`safeFetch`.
- `app/layout.tsx` is a client component that redirects to `/login` when no token is present and hides `Navigation` on the login route.
- Pages: Overview, Leads, Outlets, Territories, Visits, Tracking, Route Plans. All call the API client and fall back to local demo data on failure.

### Phase 5 — React Native Mobile Foundation — ❌ Not Started
- Workspace declared with `react-native@0.76.5` + `react@18.2.0`.
- `src/App.tsx` literally returns `null`.
- `src/tracking-policy.ts` is a 5-key constants object.
- No navigator, no screens, no native Android/iOS projects, no Metro config. `pnpm dev:mobile` just `echo`es a placeholder message.

### Phase 6 — Electron Desktop Foundation — ⚠️ Minimal Stub
- `electron@33.3.1` installed; `electron-builder.json` configures Windows NSIS + macOS DMG outputs.
- `src/main.ts` opens a `BrowserWindow` (1280×840) with `contextIsolation: true`, `nodeIntegration: false`, `preload: undefined`, and loads `process.env.FIELD_SALES_WEB_URL ?? "http://localhost:3000"`.
- No preload bridge, no IPC, no operations-specific UI.

### Phase 7 — Shared Packages — ✅ Complete
| Package | State |
|---|---|
| `shared-types` | Role, Permission, TenantScopedRecord, GeoPoint, RouteStopInput, DemoUser, WorkSessionState |
| `validation` | `canAccessRecord`, `canSendLocation`, 2 tests |
| `event-contracts` | Zod `trackingLocationRecordedSchema`, event-type enum (12 events) |
| `maps-provider` | `MapsProvider` interface + `createMockMapsProvider` (greedy nearest-neighbour) — **only `optimiseRoute`, `calculateDistanceMeters`, `generateNavigationLink` exposed**; the prompt's required interface also lists `geocodeAddress`, `reverseGeocode`, `calculateDistanceMatrix` — **missing** |
| `sync-engine` | In-memory `createMutationQueue` with idempotency dedup + retry budget → `needs_review` after `maxAttempts` |
| `api-client` | Typed `createApiClient` with login/session/CRUD for leads/outlets/territories/visits/tracking/route-plans + Bearer token |
| `ui` | `statusTone` constants only |
| `config` | `defaultTenantPolicy` constants — no `tsconfig.json` in the package, `build` script will fail until added |

### Phase 8 — Multi-tenant Auth + RBAC — ⚠️ Mostly Complete
- `app_user.password_hash`, `role_permission` tables present in schema.
- `auth-service.ts`: JWT sign/verify (24h), `bcrypt` hash/verify, `findUserByEmail`, `getUserPermissions`, `ensureSeedUser` (creates `admin@fieldsales.local`/`admin123` on first request).
- `auth-middleware.ts.authenticateRequest`: prefers `Authorization: Bearer <jwt>`, falls back to `x-field-sales-*` dev headers, throws `AuthorisationError` otherwise.
- `tenant-auth.ts.requireTenantPermission` enforces same-org check, permission membership, rep-owned-only, manager-team-scoped rules.
- Web `/login` page submits credentials and stores the token; layout guards all routes except `/login`.
- **Gaps:** JWT secret defaults to a hardcoded string; no refresh tokens; no logout endpoint; no user invite/password-reset flow; no `medusa develop` native auth integration; the OpenAPI spec still advertises `x-field-sales-*` header security only and is not updated to document Bearer JWT.

### Phase 9 — Leads, Outlets, Territories — ⚠️ Mostly Complete
- Schema + PostGIS indices for `outlet`, `lead`, `territory`.
- `lead-and-outlet/{repository,query-service}.ts`: list, insert, update, delete for leads and outlets via `ST_MakePoint`.
- `territory/{repository,query-service}.ts`: list with PostGIS envelope; in-memory containment check.
- API routes: GET/POST/PUT/DELETE for `/api/v1/leads` and `/api/v1/outlets`; GET-only for `/api/v1/territories`.
- Web pages render API data with demo fallback.
- **Gaps:** no territory POST/PUT/DELETE; no point-in-polygon (`ST_Contains`) endpoint that returns outlets inside a territory; no lead-assignment endpoint exposing `assignLeadToRep`; no audit-log writes on mutations.

### Phase 10 — Route Planning — ⚠️ Started, Has A Latent Bug
- Schema: `route_plan`, `route_stop` (no `created_at` column — see bug below).
- `route-planning/repository.ts`:
  - `queryRoutePlans` (lists all plans — **ORDER BY clause references missing column**)
  - `queryPlanWithStops` joins `route_stop ↔ outlet` for coordinates
  - `createRoutePlan` runs an **inline** greedy nearest-neighbour with priority sort + Haversine and inserts inside a transaction
  - `assignRoutePlan`, `updateRouteStatus` mutators exist but no API surfaces them
- API: GET/POST under `/api/v1/route-plans`.
- Web dashboard `/route-plans` lists plans, creates a plan from the first 5 outlets on a chosen date.
- **Architecture deviation:** the prompt explicitly forbids hardcoding map vendors in business logic and requires using the provider abstraction. The repo *inlines* Haversine + greedy instead of calling `packages/maps-provider`. The progress doc justifies this with "maps-provider is ESM; route-planning repo inlines algorithm to avoid CJS/ESM conflict within Medusa's CJS build." → this is a real architectural gap; the abstraction is bypassed.
- **Provider interface deviation:** `MapsProvider` only exposes `optimiseRoute`, `calculateDistanceMeters`, `generateNavigationLink`. The prompt's required interface also needs `geocodeAddress`, `reverseGeocode`, `calculateDistanceMatrix` — none of these exist.

### Phase 11 — Visit Check-in / Check-out — ⚠️ Started
- Schema: `visit` extended with `checked_in_at`, `checked_out_at`, `check_in_latitude/longitude`, `geofence_status`.
- Repository: `checkInToVisit` (upsert), `checkOutFromVisit`.
- API: GET list + POST `{action: check_in | check_out}`. Inline Haversine for geofence distance (radius 100m default).
- Web `/visits` displays all visit rows.
- **Gaps:** the request handler casts `body` to `Record<string, string>` then `Number.parseFloat`s — latitude/longitude arrive as numbers from JSON; this still works because of JS coercion via the stringified path but it's fragile and the test surface is thin. No attachments / photos. No exception-review workflow. No mobile-side UI. Permission check uses `visit:write` on POST but `outlet:read` on GET — RBAC matrix actually grants `visit:write` only to reps for **own visits**, not as a list permission — listing should be guarded differently.

### Phase 12 — Location Tracking + Live Map — ⚠️ Started
- Schema: `consent_log`, `work_session` (with partial-index on active sessions), `location_ping` (composite PK `(organisation_id, id)` for tenant-sharded inserts) — solid foundation.
- `tracking/repository.ts`: consent record + revoke-cascades-to-active-session; start/stop work session; queryActiveSession / querySessionsToday / queryLatestConsent.
- API: GET list-today + POST `{action: record_consent | start_session | stop_session}`. Validates "consent granted and not revoked" before starting a session; 409 when an active session already exists.
- Web `/tracking` shows session table with start/stop buttons.
- **Gaps:** no endpoint to ingest `location_ping` rows (the schema exists but nothing writes to it); no WebSocket gateway; no Redis pub/sub for fan-out; no live manager map UI; no consent revocation route; no retention job that prunes location pings older than `raw_location_retention_days`.

### Phase 13 — Offline Sync — ❌ Server-side Not Started
Client-side primitive (`packages/sync-engine/createMutationQueue`) exists with idempotency dedup and `needs_review` after exhausted retries. There is **no** server endpoint for `POST /api/v1/sync/push`, `GET /api/v1/sync/pull?cursor=...`, no conflict records, no idempotency-key enforcement table, no cursor table, no device registry.

### Phase 14 — Field Orders Through Medusa — ❌ Not Started
- Schema seeds `field_product` (5 rows) and `field_order` (3 rows) as **standalone tables**. No link to Medusa `product`, `variant`, `inventory`, `cart`, `order`.
- No Medusa commerce seed workflow.
- No field-order creation workflow that hits Medusa modules.
- This directly contradicts the prompt rule "Medusa should handle products, customers, pricing, inventory, carts, orders. Do not force field-sales tracking, visits or routes into normal Medusa order tables." — the inverse is happening: orders are bypassing Medusa entirely.

### Phase 15 — Reports / Audit Logs / Hardening — ❌ Not Started
- `audit_log` table exists; the seed writes one row; no API reads or writes it from business workflows. No `audit:read` endpoint.
- No reports / aggregations.
- No retention jobs (location, audit).
- No observability wiring (Sentry env var exists but no client).
- No security hardening: no rate limiting, no CSRF on dashboard, no helmet equivalents, no input-size limits on dev-server, no CORS configured (Medusa cors envs exist but dev-server doesn't honour them).

## 3. What Is Broken

| # | Where | Severity | Description |
|---|---|---|---|
| B1 | `apps/backend-medusa/src/modules/route-planning/repository.ts:128` | **High** | `queryRoutePlans` runs `ORDER BY route_date DESC, created_at DESC` but the `route_plan` table in `schema.sql` has no `created_at` column. The list endpoint will throw `column "created_at" does not exist` at runtime on any environment that has applied the canonical schema. Demo data was inserted before this bug existed, but `GET /api/v1/route-plans` is broken today. |
| B2 | `apps/backend-medusa/src/db/client.ts:8` | Low | Default fallback connection string uses port `15432` while `.env`, `.env.example`, and the seed script default to `5432`. `DATABASE_URL` normally overrides this so it doesn't surface in practice, but it's inconsistent. |
| B3 | `apps/web-dashboard/app/layout.tsx` | Low | Reads `localStorage` directly in render (`const hasToken = typeof window !== "undefined" && localStorage.getItem(...)`); will cause hydration warnings and unnecessarily re-runs on every render. The `ready` gating mitigates SSR mismatch but the auth-gate logic still belongs in state. |
| B4 | `apps/web-dashboard/app/page.tsx:5` | Low | Imports `ListResponse, OutletSummary, LeadSummary` from `@orbit/api-client` but never uses them; will trigger the workspace's `@typescript-eslint/no-unused-vars` rule when lint runs. |
| B5 | `apps/backend-medusa/src/api/v1/visits/route.ts:26` | Medium | POST body is cast as `Record<string, string>` and then numerically parsed via `Number.parseFloat(body.latitude ?? "")`. When clients send numbers (as JSON typically does), the cast is a lie. Functionally works through JS coercion but the typing is wrong and a strict client could break. |
| B6 | `apps/backend-medusa/src/api/v1/visits/route.ts:10` | Medium | GET visits uses `outlet:read` permission. Listing visits should require `visit:write` or a dedicated `visit:read`. Rep-scoping (`ownerUserId === actor.userId`) is also not applied. |
| B7 | `packages/config/` | Low | `tsconfig.json` is absent but `package.json.scripts.build = "tsc -b"` and a real `src/index.ts` exists. The package will fail to build standalone, though the workspace doesn't build it directly. |
| B8 | `packages/maps-provider/` | High (architecture) | Missing required provider methods (`geocodeAddress`, `reverseGeocode`, `calculateDistanceMatrix`). Route-planning bypasses the provider entirely (see Phase 10). |
| B9 | `docs/api/openapi.yaml` | Low | Still advertises `fieldSalesHeaders` (header API key) as the only security scheme; the implementation now uses JWT Bearer auth. The login endpoint `POST /api/v1/auth/login` is not documented. |
| B10 | `apps/backend-medusa/src/dev-server.ts:51-55` | Medium | `ensureSeedUser()` runs **inside the per-request handler**, gated by a `seeded` boolean. The first request after every server boot performs a DB write. If the DB isn't reachable on first request, this throws `internal_error` and `seeded` stays `false` so every subsequent request also retries. Should happen at server startup, not in the request path. |
| B11 | Schema vs. routes | Medium | `route_plan` has no `created_at` column, but several future operations (audit ordering, recent-plans queries) will want one. Either add the column to the schema or remove the ORDER BY clause (fixing B1). |
| B12 | `dev-server.ts` routing | Low | `request.url` comparisons use exact-equality (no query-string tolerance) for collection endpoints like `/api/v1/leads`. A trailing `?` or query param breaks the route. |

## 4. Which Phase Is The Project In

Per the prompt's 16-phase ladder:

| Phase | State | Notes |
|---|---|---|
| 0 | ✅ | Docs, this audit |
| 1 | ✅ | pnpm workspace |
| 2 | ✅ | Docker + PostGIS + Redis |
| 3 | ⚠️ Partial | Medusa scaffold + build OK; dev-server is the real runtime |
| 4 | ✅ | Next.js dashboard with auth |
| 5 | ❌ Not started | Mobile App returns `null` |
| 6 | ⚠️ Minimal | Electron loads dashboard URL only |
| 7 | ✅ | Shared packages |
| 8 | ⚠️ Mostly | JWT + bcrypt + RBAC matrix in DB; missing logout / refresh / user-invite |
| 9 | ⚠️ Mostly | Leads/Outlets CRUD; territory write-side missing |
| 10 | ⚠️ Bugged | Greedy planner inlined (provider abstraction bypassed); list query broken (B1) |
| 11 | ⚠️ Started | Check-in/out works; attachments + mobile + exception review missing |
| 12 | ⚠️ Started | Consent + sessions wired; ping ingestion + WebSocket + live map missing |
| 13 | ❌ | No server-side sync at all |
| 14 | ❌ | Field orders bypass Medusa commerce entirely |
| 15 | ❌ | No reports, no audit reads, no retention, no hardening |

**Earliest phase that is genuinely incomplete: Phase 3 (Medusa backend foundation) — the real Medusa HTTP runtime is not booted; an alternate `node:http` server fronts the API.** However, the deliverable of Phase 3 is the *foundation*, and the foundation (config + modules registered + build compiles + routes located under `src/api/v1/…`) is in place. Treating Phase 3 as "foundation complete, runtime swap deferred" — which is consistent with what was actually built — the next genuinely untouched phase is **Phase 5 (React Native mobile foundation)**.

## 5. What Docs Say Should Be Done Next

`docs/engineering/implementation-progress.md` last "Next Tasks" section (line 179) prescribes, in order:
1. Add login page to web dashboard with token storage. **Done** (`apps/web-dashboard/app/login/page.tsx`, `app/api-service.ts`).
2. Add PUT/DELETE API routes for leads, outlets, territories. **Partial** — leads ✓, outlets ✓, **territories pending**.
3. Implement real database-backed module services for organisation, identity/access, sync, notification, audit-and-compliance. **Pending** — those 5 services still return hardcoded string arrays.
4. Create Medusa commerce seed workflow for products and field orders.
5. Build WebSocket infrastructure for live tracking.
6. Build offline sync backend endpoints (cursor pull, mutation push, conflict resolution).
7. Add reports, notifications, retention jobs and observability.

`docs/engineering/opencode-continuation-audit.md` "Next Tasks" agrees and additionally calls out the dashboard-to-API wiring, which is now done.

The two docs and the user's new phase list disagree:
- Progress docs push forward on backend completeness (PUT/DELETE, real services, sync, WS).
- User's phase list says "earliest incomplete phase first" — which points at mobile (Phase 5) or back to Medusa runtime (Phase 3).

Per the user's instruction "If progress docs are missing or wrong, infer only from actual code", I prioritise the user's phase order.

## 6. Exact Next Implementation Task

**Recommended single, well-scoped next step: Fix the known-broken route-planning list query (B1), then begin Phase 5 — React Native mobile foundation (JS layer).**

Rationale:
- B1 is a tight, code-proven bug already on disk that breaks an existing endpoint the dashboard calls. Fixing it before any new work keeps the regression surface small.
- Phase 5 is the earliest phase the user's plan lists as not-started-at-all. Mobile is also the single largest gap in the architecture (it is the *primary* surface for reps per the PRD).
- Phase 5 foundation does not require native iOS toolchains on a Windows host — the JS layer (TS config, navigation, screen stubs that consume `@orbit/api-client` and `@orbit/sync-engine`, tracking policy enforcement, login flow) is portable and reviewable in isolation.

Concrete sub-steps for the mobile foundation (each step ends in a runnable check):
1. Fix B1 by either adding `created_at timestamptz NOT NULL DEFAULT now()` to `route_plan` in `schema.sql` (consistent with `audit_log`, `outlet`, `lead`, `field_order`) **or** removing `, created_at DESC` from the ORDER BY. The schema add is preferred because it is also needed for Phase 15 audit reports. Update `docs/database/schema-overview.md` (new file).
2. Add core mobile dependencies: `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`, `@react-native-async-storage/async-storage`, `react-native-mmkv` (or AsyncStorage for v1), `@orbit/api-client` (already linked).
3. Wire `App.tsx` to a `NavigationContainer` with an auth-gated stack: `LoginScreen` → `HomeScreen (today's route)` → `RouteStopDetailScreen` → `VisitCheckInScreen`.
4. Create `src/auth/auth-storage.ts` using AsyncStorage to mirror the dashboard's token pattern; wire `apiClient.setToken` on rehydrate.
5. Create `src/screens/LoginScreen.tsx` that calls `apiClient.login(...)`.
6. Create `src/screens/RouteTodayScreen.tsx` that calls `apiClient.listRoutePlans()` and groups by `routeDate === today`.
7. Surface the existing `tracking-policy.ts` rules via a `useTrackingConsent()` hook + a permanent banner ("Tracking active" / "Tracking off") that respects the privacy rules in the prompt (foreground-before-background, visible status, consent-gated).
8. Add Vitest unit tests for `useTrackingConsent` decisions and a route grouping helper.
9. Defer native projects (`android/`, `ios/`) and Metro bundler config to a follow-up; document this as the next mobile step in `implementation-progress.md`.

## 7. Assumptions

| # | Assumption |
|---|---|
| A1 | The user's 16-phase order overrides the older `implementation-progress.md` "Next Tasks" list. |
| A2 | Phase 3 (Medusa runtime) is considered "foundation complete" because Medusa is installed, modules are registered, and `medusa build` passes — even though the actual request flow today uses `dev-server.ts`. The runtime swap is treated as a Phase 15 hardening item. |
| A3 | "React Native mobile foundation" means the JavaScript/TypeScript foundation (navigation, screen scaffolds, auth wiring, tracking policy enforcement) without needing native Android/iOS toolchain on this Windows dev box. Native projects will be a documented follow-up. |
| A4 | The existing `@orbit/api-client` is the canonical mobile/web client. Mobile will not re-implement HTTP. |
| A5 | Postgres is reachable at `localhost:5432` per the running Docker Compose (verified earlier in session); the `.env` `POSTGRES_PORT=5432` is the source of truth even though `docker-compose.yml` defaults to `15432`. |
| A6 | `pnpm` is reached via `corepack` (now activated this session). |
| A7 | The "Do not create a toy demo" instruction permits stub screens *only* when each is a real production-shaped wiring of `@orbit/api-client` — not lorem-ipsum placeholders. |
| A8 | Adding `created_at` to `route_plan` is acceptable because no production data exists and the schema is reset via `schema.sql` on each environment setup. |

## 8. Blockers

| # | Blocker | Mitigation |
|---|---|---|
| BL1 | Native iOS toolchain unavailable on Windows host. | Defer iOS builds; ship JS layer + Android-runnable structure, document native build as next mobile step. |
| BL2 | Real Medusa runtime never booted; can't yet validate that route handlers using the custom `MedusaRouteRequest/Response` interface mount inside `medusa develop`. | Continue with `dev-server.ts`; treat Medusa-native runtime as a separate task. |
| BL3 | No WebSocket implementation yet — live-map work (Phase 12) cannot complete without picking a transport (Socket.IO vs `ws`) and Redis pub/sub adapter. | Out of scope for Phase 5; flag for Phase 12. |
| BL4 | `localhost:5432` may already be in use by a host-side Postgres. | Containers were brought up successfully earlier this session; if conflict appears, switch to the `15432` default in `docker-compose.yml` and update `.env` `DATABASE_URL`. |
| BL5 | `docs/system/` and `docs/database/` directories don't exist; the prompt mandates maintaining them on changes. | I will create them when their first content is written (schema-overview at the B1 fix step). |

## 9. Verification Status This Audit

No code was changed. The following were performed (read-only) this session:
- Read every file listed in §1.
- Confirmed B1 by cross-referencing `schema.sql` (no `created_at` in `route_plan`) against `repository.ts` (`ORDER BY ... created_at DESC`).
- Confirmed B7 by globbing `packages/config/*` (no `tsconfig.json`).
- Confirmed Phase 5 by reading `apps/mobile-field-sales/src/App.tsx` (`return null`).
- Confirmed B8 by reading `packages/maps-provider/src/provider.ts` (only 3 methods on the interface).

Verification commands (`lint`, `typecheck`, `test`, `medusa build`) have **not** been re-run by me yet in this session — that is the next task after writing this audit, per the prompt's instruction order ("Do not code until this audit is written"). Once the audit is approved, the immediate verification sweep is:

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --filter @orbit/backend-medusa medusa:build
docker compose -f infra/docker/docker-compose.yml config
```

Any failures will be appended to `docs/engineering/implementation-progress.md` per the prompt's testing rules.

---

## Appendix A — Phase-to-Module Traceability (code-verified)

| Module | `index.ts` | `service.ts` | Repository | Query service | API routes | Tests |
|---|---|---|---|---|---|---|
| organisation | ✓ | stub | — | — | GET /organisations (status) | — |
| identity-and-access | ✓ | stub | — | — | — | — |
| territory | ✓ | stub | ✓ | ✓ | GET /territories | ✓ |
| lead-and-outlet | ✓ | stub | ✓ | ✓ | GET/POST/PUT/DEL /leads, /outlets | ✓ |
| visit | ✓ | stub | ✓ | ✓ | GET, POST(check_in|check_out) | — |
| tracking | ✓ | stub | ✓ | — | GET, POST(consent|start|stop) | — |
| route-planning | ✓ | stub | ✓ (with inline planner) | — | GET, POST | — |
| sync | ✓ | stub | — | — | — | — |
| notification | ✓ | stub | — | — | — | — |
| audit-and-compliance | ✓ | stub | — | — | — | — |

## Appendix B — `.env` Surface

`DATABASE_URL`, `POSTGRES_*`, `REDIS_URL`, `MEDUSA_BACKEND_URL`, `MEDUSA_JWT_SECRET`, `MEDUSA_COOKIE_SECRET`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_MAP_PROVIDER`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `MOBILE_API_BASE_URL`, `MOBILE_WS_URL`, `OBJECT_STORAGE_PROVIDER`, `LOCAL_OBJECT_STORAGE_ROOT`, `S3_*`, `PUSH_PROVIDER`, `FCM_SERVER_KEY`, `ONESIGNAL_*`, `SENTRY_DSN`, `LOG_LEVEL`, `ELECTRON_UPDATER_PROVIDER`, `ELECTRON_UPDATE_URL`, `DEMO_*`, `NEXT_PUBLIC_DEMO_*`. None of these are wired to a config-loading layer (e.g., `packages/config` does not export them); each app reads `process.env` ad hoc.
