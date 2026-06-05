# Final Go / No-Go Report

**Date:** 2026-05-28
**Method:** I actually ran the system, probed each surface with HTTP + WS clients, grep'd the codebase for fake-completion markers, and traced where every "real" feature actually lives. Where I'm guessing, I say so.

---

## ⚠️ Critical Findings Up Front

Three issues found this session that would block any client deployment, in order of severity:

1. **`ensureSeedUser()` auto-creates `admin@fieldsales.local / admin123 / organisation_admin` on every backend boot, with no NODE_ENV guard.** If this code ships to production, your production database **will** have a back-door admin account with a public password by the end of the first request. (`apps/backend-medusa/src/auth/auth-service.ts:70`).
2. **JWT secret defaults to the string `"field-sales-dev-secret-do-not-use-in-production"`** if `JWT_SECRET` is unset. (`apps/backend-medusa/src/auth/auth-service.ts:5`). Anyone with the source can forge any token.
3. **There is no map widget anywhere in the dashboard.** The "Live Map" page literally renders a table of pings with the comment *"Map widget is a follow-up — this page proves the stream end-to-end"* (`apps/web-dashboard/app/live-map/page.tsx:60`). The Overview page has a placeholder `<div>Live team map provider placeholder</div>`. The product positions itself as a maps-driven SaaS but renders zero maps.

All three are fixable. None are fixed yet. **None block local demo. All three block real customers.**

---

## 1. Score Sheet (1–100)

| Axis | Score | Justification |
|---|---|---|
| **Overall** | **48 / 100** | MVP-shaped, gaps are well-documented, but several production safeties are missing and the visible product (maps UI) is unfinished. |
| MVP completeness | 75% | Backend surface is comprehensive; offline sync works; mobile JS layer works; Electron shell works. Map UI + UI polish bring this down. |
| Production readiness | 35% | Hardcoded JWT default, auto-created admin, no migrations tool, no CI/CD, no deploy manifests, no backups. |
| Security readiness | 30% | Auto-admin + default JWT + JWT-in-localStorage + uniform `admin123` password across all demo users (backfilled by `ensureSeedUser` even on prod). Headers/rate-limit/RBAC are solid, but the account-side gaps dominate. |
| Scale readiness | 25% | In-memory rate limiter, in-memory WS subscriber set, single-process retention scheduler, no horizontal-scale story. Will fall over at ~2 backend instances. |
| Mobile readiness | 55% | JS layer typechecks + tests pass; Expo config wired; real `expo-location` probes. **No EAS build has ever been run; no APK/IPA exists; native iOS untouched on Windows host.** Code is plausible but unverified on a device. |
| Maps readiness | 20% | Provider abstraction + 3 real implementations (Mapbox, Google, OSRM) + factory + tests are real. But: no map widget in any UI, default is mock (Haversine + simpleHash geocoding), no provider credential has ever been exercised against a live API. |
| Offline reliability | 70% | Mutation queue, idempotency, conflict records, retry budget all real and tested. `visit.check_in / check_out / tracking.location.batch` dispatch cases work. **Offline field orders do NOT work — no `field_order.created` case in `modules/sync/dispatch.ts`.** |
| Client deployment readiness | 30% | Same blockers as production readiness, plus no tenant-onboarding UI, no password-reset flow, no user-invite endpoint, no admin user-management API. |

---

## 2. Verification Evidence (this session)

| Claim | Verified | Evidence |
|---|---|---|
| Backend boots | ✅ | Log: `backend-medusa scaffold listening on http://localhost:9000; WS at ws://localhost:9000/ws/tracking; sentry=off` |
| Web boots | ✅ | Log: `next dev` → `Ready in 2.1s`; user navigated `/`, `/leads`, `/outlets`, `/territories`, `/visits` — all 200s in backend logs |
| Electron boots | ✅ | 4 processes, opened the dashboard URL, user used it, exited cleanly |
| Docker services | ✅ | `fieldsales-postgres` healthy, `fieldsales-redis` healthy, uptime ~1 hour |
| WS gateway accepts authed connections | ✅ | Node `ClientWebSocket` connected with `?token=<jwt>`, transitioned to `Open` state |
| Tests pass | ✅ | 20 files, 68 tests, all green |
| Typecheck | ✅ | root + web + mobile + desktop, all clean |
| Lint | ✅ | no errors |
| Builds | ✅ | medusa build (backend 4.92s + frontend 25.66s), desktop tsc, web typecheck |
| Migrations | ❌ | None. Schema is `Get-Content schema.sql \| docker exec psql`. No tool, no version table, no rollback. |
| Sentry | ⚠️ | Hand-rolled envelope POST; `sentry=off` because DSN not set; never actually delivered to Sentry. |
| Rate limit | ✅ | Verified live `x-ratelimit-*` headers; **but in-memory `Map` — won't survive multi-instance** |
| Request logging | ✅ | JSON line per request with correlation id observed live |
| RBAC | ✅ | After this session's fix (F1). Rep can do own-actions; tenant-scoped reads work; 3 new regression tests |
| Tenant isolation | ✅ | Every query has `organisation_id = $1`; `requireTenantPermission` rejects cross-org |
| Auth/session | ⚠️ | Works, but JWT-in-localStorage is XSS-stealable; no refresh token; no logout endpoint; default secret + auto-admin |
| Electron security | ✅ | `sandbox:true`, `contextIsolation:true`, `nodeIntegration:false`, preload bridge with URL allowlist + 50MB IPC cap, externals open in OS browser |
| Mobile production build | ❌ | Nothing built. No APK, no IPA, no EAS run |
| WS scaling | ❌ | In-memory subscriber set; multi-instance fan-out doesn't exist |
| Medusa runtime | ❌ | `medusa develop` not the production runtime; `mountMedusaRoute` shim ready but cutover not done |

---

## 3. Tier-by-Tier Go/No-Go

> Conventions: "safe team size" = roughly how many concurrent users could hit the system before scale gaps bite or operational debt becomes painful.

### Tier 1 — Internal demo

**YES** ✅

- Why: it works end-to-end on a developer machine, login → territory → route → rep → check-in → offline sync → audit log. The 15-step flow I ran today proves it.
- Risks: the Overview homepage shows fake hardcoded numbers ("Active reps: 3", "Visits planned: 18") — a sharp-eyed exec will notice. Demo from `/reports` instead.
- Safe size: 1–3 people watching one screen.

### Tier 2 — Pilot customer (1 friendly customer, 1–3 reps)

**NO** ❌ — fixable to YES in **2–3 days of focused work**

- **Cannot ship to a customer without:** removing the auto-created admin / default JWT secret / `admin123` shared password. These are not bugs you can "remember to handle later" — they are CVE-grade.
- Mobile has no installable client. A "rep using the mobile app" demo today is impossible because no APK exists.
- No password-reset and no user-invite flow. A real pilot manager can't add their reps; you'd have to seed them by hand each time.
- Map UI is missing — the manager can't actually see live rep positions on a map; they see a table of lat/lng decimals.
- Risks if ignored: customer creates a real account → backdoor admin is already in their DB → first competitor / disgruntled user finds it → full data dump.
- Safe size if all 4 fixes land: 1 customer, 1 manager, 3–5 reps.

### Tier 3 — Small paying client (10–20 reps, 1 manager, real money)

**NO** ❌ — fixable in **2–3 weeks**

- All Tier-2 blockers.
- Plus: no real maps provider exercised (factory + 3 implementations exist but never hit a live API in this codebase's history).
- Plus: no CI/CD, so every release is a manual `pnpm` run on a dev box.
- Plus: no backups, no migration tool, no schema-change story. First column-add will be a `docker exec psql` operation in production.
- Plus: no Medusa cart/order — "field orders" are a parallel PG table with no payment/invoicing.
- Plus: in-memory rate limiter + WS broker — fine for ~50 concurrent users on a single instance, will tip over at the first user-growth spike.
- Plus: hardcoded fake metrics on Overview page would actively mislead the paying manager.
- Safe size if cleaned up: 1 paying client, ≤20 reps, single backend instance, single Postgres. **Postgres backups must be set up before go-live.**

### Tier 4 — Medium business production (multi-tenant, 50–500 reps)

**NO** ❌ — fixable in **6–10 weeks**

- All Tier-3 blockers.
- Plus: rate limiter + WS need Redis pub/sub adapter for horizontal scale (documented but not implemented).
- Plus: no real observability — Sentry envelope is hand-rolled, no metrics, no traces, no APM.
- Plus: no SLO definitions, no alerting.
- Plus: no payment integration (Medusa native cart/order swap still pending).
- Plus: no admin onboarding UI — every new tenant requires direct DB inserts or hand-built API calls.
- Plus: no data-export / data-deletion flows (`audit-and-compliance` module is a stub).
- Plus: no rate-limit per tenant, only per IP. One noisy tenant can DoS the others.
- Safe size if cleaned up: 5–10 tenants, ≤500 reps total, 2-3 backend instances behind a load balancer.

### Tier 5 — Enterprise production

**HARD NO** ❌ — fixable in **3–6 months**

- All Tier-4 blockers.
- Enterprise expects: SOC2-ready controls, SSO (Keycloak/Okta/Azure AD), audit-log immutability + tamper detection, regional data residency, encrypted backups with point-in-time recovery, RTO/RPO SLAs, penetration test, key rotation, secrets manager (Vault / AWS Secrets Manager), CMK encryption, IP allowlists per tenant, MFA, fine-grained per-team permissions.
- None of this exists.
- Don't.

---

## 4. Production Deployment Readiness Checklist

| Concern | State | Blocker for production? |
|---|---|---|
| Env handling | ⚠️ uses dotenv-like `process.env` reads; no schema validation; no missing-var detection at boot | Yes (silent fallbacks hide misconfig) |
| Docker setup | ✅ compose works for Postgres + Redis | No |
| Migrations | ❌ no tool; raw SQL applied via `docker exec` | **Yes** |
| DB persistence | ⚠️ docker volume `fieldsales-postgres` persists locally; no production backup strategy | **Yes** |
| Redis persistence | ⚠️ AOF enabled in compose; no production backup; no replica | Yes |
| Sentry | ⚠️ envelope POST works; no SDK, no breadcrumbs, no source maps, no release tagging | No (degraded, not broken) |
| Rate limits | ⚠️ in-memory `Map`, per-IP per-path; sane defaults | No for single instance; Yes for ≥2 |
| Request logging | ✅ JSON line + correlation id | No |
| RBAC | ✅ enforced (after this session's F1 fix) | No |
| Tenant isolation | ✅ every query scoped | No |
| Auth/session | ❌ default JWT secret + auto-admin + localStorage token + no refresh token + no logout endpoint | **Yes (CVE-grade)** |
| Electron security | ✅ sandbox + contextIsolation + URL allowlist | No |
| Mobile production build | ❌ never built | **Yes** (for mobile shipping) |
| Expo/EAS | ⚠️ config + scripts present, account not provisioned | Yes |
| WebSocket scaling | ❌ in-memory set | Yes for ≥2 instances |
| Medusa runtime | ❌ shim ready, cutover not done | No (current runtime works) |
| Schema management | ❌ ad-hoc SQL | **Yes** |
| Secret management | ❌ all secrets in `.env` file | **Yes** |
| Backups | ❌ documented nowhere | **Yes** |
| CI/CD | ❌ no `.github/workflows`, no Dockerfile for backend, no deploy manifests | **Yes** |
| Disaster recovery | ❌ no plan, no runbook | **Yes** |
| Monitoring / alerting | ❌ no Prometheus, no Grafana, no PagerDuty integration | Yes |
| TLS | ❌ no production HTTPS config; would need a reverse proxy (nginx/Caddy) | **Yes** |

---

## 5. Fake-Completion Markers Found

`grep` results, filtered to source code only (excluding `node_modules` + `.next/` build artifacts):

### Dangerous (production-blocking)
| File:Line | Marker | Why dangerous |
|---|---|---|
| `apps/backend-medusa/src/auth/auth-service.ts:5` | `"field-sales-dev-secret-do-not-use-in-production"` | Hardcoded JWT fallback. Forgeable tokens. |
| `apps/backend-medusa/src/auth/auth-service.ts:70` | `ensureSeedUser()` runs in `bootstrap()` with no NODE_ENV guard | Auto-creates `admin@fieldsales.local / admin123` in every environment, including production. |
| `apps/backend-medusa/src/auth/auth-service.ts:72` | hardcoded password literal `"admin123"` | Applied to dev admin AND backfilled onto every seeded user. |
| `apps/web-dashboard/app/live-map/page.tsx:60` | comment "Map widget is a follow-up" | The flagship "Live Map" page has no map. |
| `apps/web-dashboard/app/page.tsx:20-27` | `metrics = [["Active reps","3"],…]` | Six fake hardcoded numbers on the dashboard homepage. Will mislead any user that opens the homepage. |

### Harmless
| File | Marker | Why harmless |
|---|---|---|
| `*\.test.ts` files | `vi.mock`, `mock`-prefixed names | Unit-test scaffolding, expected. |
| `packages/maps-provider/src/mock-provider.ts` | the entire mock provider | Documented as the local-dev fallback when no real key is configured. |
| `*\.next/` | TODO / mock | Generated build artefacts, not source. |
| TextInput `placeholder` props | "Email", "Password", "Organisation ID" etc | UI input hints, normal React Native / web. |
| Comments using "deterministic" | The mock geocoder is deliberately deterministic so tests are reproducible. | Working as designed. |

### In-between (technical debt, not dangerous)
| File:Line | Marker |
|---|---|
| `apps/backend-medusa/src/dev-server.ts:367` | startup string says "backend-medusa **scaffold** listening" — reflects that this is not the Medusa runtime. Cosmetic. |
| `packages/maps-provider/src/mock-provider.ts:120` | `simpleHash` for geocoding — produces fake Bengaluru-bbox coordinates; only triggered when `MAP_PROVIDER=mock`. |

---

## 6. Brutally Honest Q&A

> **Can we deploy this today?**
> Only to your own laptop, for an internal demo. Not to a customer.

> **Can we onboard a real client?**
> No. Pre-blockers: (a) remove default JWT secret + admin auto-create + shared admin123 — 1 day; (b) build the Expo mobile dev client — 1 day; (c) replace the dashboard's fake-metrics homepage with the `/reports` data — 30 minutes; (d) add a real map widget to `/live-map` (MapLibre + OpenStreetMap is free) — 1–2 days; (e) write a password-reset + user-invite flow — 2 days. ~1 week of work end-to-end.

> **Can field reps use it daily?**
> Not yet. They can't install the app — no APK exists. The web dashboard works but reps aren't supposed to use the web dashboard (it's for managers); they need the mobile app. Once the EAS build runs, the rep-side JS code is real and the offline queue + GPS probes are wired.

> **What will break first?**
> The first production incident will be one of:
> 1. **Someone discovers `admin@fieldsales.local / admin123`** within hours of the first deploy.
> 2. **Postgres restart loses all rate-limit state** — first replay attack after a deploy gets infinite tries until the cache rebuilds.
> 3. **First customer adds a second rep** and discovers there's no user-invite UI/API.
> 4. **First customer asks "where's the map?"** and the answer is "we render a table of lat/lng".

> **What absolutely must be fixed before production?**
> The five items in the §6 onboarding answer above. Plus:
> - Set `JWT_SECRET` in production env (and detect missing-secret at boot, refuse to start).
> - Add a migration tool (`node-pg-migrate` is 2 hours of work).
> - Set up Postgres backups.
> - Set `RETENTION_SWEEP_ENABLED=true` (it's off by default).
> - Add a Dockerfile + simple CI that runs `pnpm test` on PR.

> **What is safe to postpone?**
> - Medusa-native runtime cutover (`dev-server.ts` works, and the shim is ready when you want to swap).
> - Native Medusa cart/order (the workflow seam exists; `field_order` PG table works for now).
> - Redis pub/sub for WS (only matters at ≥2 backend instances).
> - BullMQ for retention (in-process scheduler works for ≤1 backend instance).
> - Sentry SDK swap (envelope works).
> - Multi-provider OIDC SSO (email + password works for pilot).

---

## 7. Recommended Sequencing

| Order | Work | Effort | Unlocks |
|---|---|---|---|
| 1 | Fix the 3 dangerous markers (JWT default, auto-admin, fake metrics) | 1 day | Tier 2 demo to a friendly stakeholder |
| 2 | Replace `/live-map` table with a real MapLibre + OSM map | 1–2 days | Sales demo that doesn't embarrass the product |
| 3 | Add password reset + user invite + onboarding script | 2 days | Pilot customer can self-serve adding reps |
| 4 | `eas build:configure` + `pnpm build:android` | 0.5 day | Mobile dev client distributable |
| 5 | Add `node-pg-migrate` + retire raw SQL deploy | 0.5 day | Safe schema changes in pilot |
| 6 | Add Dockerfile + GitHub Action: `pnpm install && pnpm test && pnpm typecheck && pnpm lint` | 0.5 day | Every PR validated |
| 7 | Add Postgres backup cron + restore runbook | 0.5 day | Pilot customer data safety |
| 8 | Pick real map provider, set token, retire mock as default for staging | 0.5 day | Real-world distance + geocoding |
| 9 | Build sync dispatcher case for `field_order.created` | 0.5 day | Offline field orders actually work |
| 10 | Tenant-aware rate limiter (per-org bucket on top of per-IP) | 1 day | One noisy customer can't DoS the others |

**Net: 7–8 working days to get from "internal demo" to "1 pilot customer with ≤20 reps".**

---

## Final Verdict

**No-Go for any external customer today.**

**Go for internal demo only.**

The platform is closer than the score implies — most gaps are well-scoped, documented, and small individually. But three of them are CVE-grade (default JWT secret, auto-created admin, shared admin123 password), one is product-credibility-grade (no map on the live-map page), and one is operationally fatal at any scale (no migration tool, no backups). Until those land, do not put a customer's name on this.
