# Feature Completeness Audit — Orbit

**Date:** 2026-05-29
**Method:** Full-stack trace per module (DB → API route → dev-server wiring → web UI → mobile). Verdicts cite `file:line`. Where an automated sub-agent and a direct file read disagreed, the **direct read wins** and the correction is noted.

**Legend:** ✅ Production-ready · 🟢 Fully working (pilot-grade) · 🟡 Partial · 🔵 Demo-only/stub · 🔴 Broken · ⬜ Missing

| Module | Verdict | One-line evidence |
|---|---|---|
| Authentication | ✅ | Real bcrypt + JWT, login reads `app_user` (`auth/login/route.ts`, `auth-service.ts`) |
| Users | ✅ | CRUD + reset/impersonate/deactivate write `app_user` (`users/route.ts`) |
| RBAC | ✅ | Two-tier scoping enforced at every endpoint (`auth/tenant-auth.ts`) |
| Invites | 🟡 | Creates user + temp password, but **no email delivery** — password returned in body (`users/route.ts`) |
| Outlets | 🟢 | CRUD + CSV import, real `outlet` writes, GiST index (`outlets/route.ts`, `schema.sql:72-73`) |
| Leads | 🟢 | CRUD with audit, indexed (`leads/route.ts`, `schema.sql:96-97`) |
| Visits | 🟢 | Check-in/out + geofence + reassign, real `visit` writes (`visits/route.ts`) |
| Tracking | 🟢 | Consent + sessions + ping ingestion real (`tracking/route.ts`); scale caveats |
| Live Map | 🟢 | Seeds from `/tracking/latest` + WS updates (`live-map/page.tsx`); single-process WS |
| Routes | 🟢 | Plan CRUD + stops persisted (`route-plans/route.ts`) |
| Route Optimisation | 🟢 (mock default) | Pluggable via `MAP_PROVIDER` (mapbox/google/osrm wired); **defaults to mock great-circle** (`route-planning/repository.ts:34-43`) |
| Orders | 🟢 | Atomic inventory txn (`commerce/repository.ts:48-91`); Medusa bridge best-effort/off-by-default |
| Reports | 🟢 | Real SQL aggregates (`reports/repository.ts`); fan-out join + unindexed COUNT caveats |
| Audit Logs | ✅ | Written on mutations, queryable + CSV export, indexed (`audit-log/route.ts`) |
| Organisation Settings | 🟢 | Validated read/update of `organisation_setting` (`organisation-settings/route.ts`) |
| Electron | 🟢 | Wraps web dashboard, context-isolated, menu/IPC (`desktop-operations/src/main.ts`) |
| Mobile | 🟡 | Core screens wired to API/offline; map + sync-status UX basic |
| Offline Sync | 🟢 | Idempotent push + conflict capture; **delta** cursor pull (`sync/push/route.ts`, `sync/pull/route.ts`) |
| ERP Foundation | 🔵 | Interface + no-op stub; `registerErpProvider` never called (`integrations/erp-provider.ts:137-145`) |
| Notifications | 🔵 | **Bare module stub** — `listTenantModules()` only; no persist/dispatch/API (`notification/service.ts`; absent from `dev-server.ts`) |

---

## Detailed findings

### Authentication — ✅ Production-ready
- `POST /api/v1/auth/login` reads `app_user`, verifies bcrypt, signs JWT (`auth/login/route.ts`, `auth-service.ts`). Wired at `dev-server.ts:146`.
- Web (`login/page.tsx`) and mobile (`api-service.ts`) call it for real. Seed admin is env-gated (`auth-service.ts`).

### Users / RBAC / Invites
- **Users ✅** — list/create/reset-password/impersonate/deactivate all hit `app_user` with audit writes (`users/route.ts`, wired `dev-server.ts:313-353`).
- **RBAC ✅** — `requireTenantPermission` + two-tier `canSeeAll`/`canSeeOwn` enforced in `visits`, `field-orders`, `tracking`, `route-plans` (e.g. `field-orders/route.ts:15-20`). Real, not stubbed.
- **Invites 🟡** — invite = create user with temp password + `password_change_required` flag; **no email/SMS** is sent — the temp password comes back in the API response for manual hand-off (`users/route.ts`). Functional for pilots, not for self-serve onboarding.

### Outlets / Leads / Territories — 🟢
- Real CRUD with audit logs; outlets have CSV import (`outlets/route.ts` `POST_IMPORT`, wired `dev-server.ts:171`). Outlet + territory have GiST spatial indexes (`schema.sql:72-73, 82-83`).

### Visits — 🟢
- Check-in computes geofence via `calculateDistanceMeters` (`visits/route.ts:12`), check-out, and manager reassign all persist to `visit`. Indexed (`schema.sql:144-145`). Manager list is **unbounded** (no pagination) — scale note, not a correctness bug.

### Tracking / Live Map — 🟢 (correctness) with scale caveats
- Consent, session start/stop, ping ingestion all real (`tracking/route.ts`). `GET /tracking/latest` seeds the map (`tracking/repository.ts:81-99`).
- Live map seeds on mount + updates via WS (`live-map/page.tsx`). **Caveat:** WS is single-process (see performance-audit C2); rep session poll pulls whole org (C6).

### Routes — 🟢 / Route Optimisation — 🟢 with a default-quality caveat
- Route plans persist with stops and assign to a rep (`route-plans/route.ts:94-143`); preview is read-only and rep-or-manager scoped (`POST_PREVIEW :12-50`).
- **Route optimisation is pluggable and correctly wired.** `previewRoutePlan` uses a provider built from env: `createMapsProvider({ provider: MAP_PROVIDER ?? "mock", mapboxAccessToken, googleApiKey, osrmBaseUrl })` (`route-planning/repository.ts:34-43`), constructed once as a singleton (`:43`). The Mapbox/Google/OSRM providers exist and are tested in `packages/maps-provider`. **Caveat:** the **default** is the deterministic **mock** provider (great-circle distances + NN/2-opt), so unless `MAP_PROVIDER` is set to a real engine, installs get straight-line estimates, not road/traffic routing. The optimiser logic (priority-aware NN + 2-opt) is genuinely good. *(Correction: an earlier draft of this audit said "mock-only / not wired" — that was wrong; the env seam is real. A separate automated scan that referenced backend `optimizer.ts`/`osrm-client.ts` files was also wrong — those files don't exist; the providers live in `packages/maps-provider`.)*

### Orders — 🟢
- `createFieldOrderWithInventory` does `BEGIN … SELECT … FOR UPDATE … UPDATE inventory … INSERT order … COMMIT` (`commerce/repository.ts:48-91`) — real oversell protection.
- Medusa bridge (`create-field-order.ts:54-84`) is **best-effort and off by default** (needs `MEDUSA_BRIDGE_REGION_ID`/`SALES_CHANNEL_ID`, `medusa-client.ts:32`). When configured it dual-writes a draft order; the local order never blocks on it. **Scale caveat:** inline `fetch` (M4).

### Reports — 🟢
- `getReportSummary` (6 parallel COUNTs) and `getRepActivity` (joined per-rep metrics) are real SQL over real tables (`reports/repository.ts`). Caveats: unindexed `field_order` COUNT (C3/M1) and fan-out join (H4).

### Audit Logs / Organisation Settings / Electron — ✅ / 🟢 / 🟢
- Audit: written on mutations, filterable + CSV export, indexed (`audit-log/route.ts`, `schema.sql:188`).
- Org settings: validated update + audit (`organisation-settings/route.ts`).
- Electron: loads the web dashboard with context isolation + menu/IPC (`desktop-operations/src/main.ts`). It is a wrapper, by design.

### Mobile — 🟡
- Login, Home, Route Today, Visit check-in/out, Product catalog → Order review, Outlets/Leads/Visits lists, Route map, More — all present and wired to the API client / offline queue.
- Gaps: sync-status UX is minimal (queued/failed badges sparse); map screen is functional but basic vs web; background tracking unavailable in Expo Go (documented constraint, needs EAS dev-client).

### Offline Sync — 🟢
- Push: idempotent (`mutation_record` PK + dup fallback `dispatch.ts:108`), conflict rows recorded (`sync/push/route.ts:93-102`). **Pull: cursor-based delta** per resource (`WHERE created_at > $since … LIMIT 500`, writes cursor back to `sync_cursor` — `sync/pull/route.ts:45-58, 78-128`). Mobile queue persists locally with 3-attempt retry → `needs_review` (`packages/sync-engine/mutation-queue.ts:67-76`). *(Correction: an earlier draft called the pull a full snapshot — it is delta. The real efficiency caveat is that the cursor columns are unindexed; see performance-audit H1.)*

### ERP Foundation — 🔵 (stub)
- `integrations/erp-provider.ts` is an interface + a `noopProvider` that returns `{status:"skipped"}`. `registerErpProvider` is **never called** in product code. The event-bus (`erp-event-bus.ts`) is plumbing only. No ERPNext/SAP/Tally adapter exists. (File also contains stray dead symbols `getErpProvider2`.)

### Notifications — 🔵 (stub; even more minimal than first thought)
- `notification/service.ts` is a **bare Medusa-module registration stub** — its entire body is `listTenantModules() { return ["notifications","deliveries","preferences"]; }`. It does **not** persist a row, does **not** dispatch push/email, and has **no API route** (absent from `dev-server.ts`). A `notification` table exists in the schema (`schema.sql:167-175`) but nothing writes to it on the hot paths. Net effect: **notifications are non-functional** — a rep/manager never receives one. *(Correction: earlier drafts variously said "missing" and "persists a row" — both wrong; it's a no-logic stub class.)*

---

## The 10 weakest / most-incomplete things (ranked)

1. **Notifications are non-functional** — bare stub class, no dispatch/API (`notification/service.ts`). Managers learn nothing in real time except via the live map/WS.
2. **ERP integration is a stub** — no real connector; `registerErpProvider` never called (`erp-provider.ts:137-145`).
3. **Route optimisation defaults to mock** — wiring is real & pluggable, but production installs ship great-circle distances unless `MAP_PROVIDER` is set (`route-planning/repository.ts:34-43`). A headline feature that's only "real" with config.
4. **Three hot tables unindexed** — `field_order`/`field_product`/`notification` (`schema.sql:147-175`).
5. **Whole-org rep reads/polls** — `/field-orders`, `/tracking`, mobile session poll fetch all then filter (C4/C6).
6. **WebSocket can't scale out** — in-memory `Set`, no Redis (`ws-gateway.ts:17`).
7. **`location_ping` retention is bulk DELETE** — not partitioned (`tracking/repository.ts:247`).
8. **Delta-sync cursors unindexed** — delta works, but cursor columns seq-scan; visit cursor is a COALESCE expression (`sync/pull/route.ts:84`).
9. **No server-side pagination** — visits/orders/audit lists are unbounded.
10. **Invites have no email** — temp password handed off manually (`users/route.ts`).

## Net assessment
**Pilot-ready, not yet enterprise-scale-ready.** Core field-sales workflows (auth, outlets/leads, visits, orders w/ inventory, tracking, live map, routes, **delta** offline sync, reports, audit) are **real and working end-to-end**. The incomplete items are concentrated in three buckets: **(a) advertised-but-stubbed features** (notifications delivery, ERP connector, and route optimisation that ships mock distances unless `MAP_PROVIDER` is configured), **(b) efficiency/scale** (missing indexes, whole-org scoping, WS transport, ping partitioning), and **(c) onboarding polish** (invite email, pagination, mobile sync UX).
