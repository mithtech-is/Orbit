# Local Development Guide

Runnable end-to-end MVP on a single workstation. Tested against Windows + PowerShell; commands are POSIX-compatible elsewhere unless noted.

## 1. Prerequisites

- **Node.js 20+** (Node 22 works)
- **pnpm** (via Corepack — no global install needed)
- **Docker Desktop** (for Postgres/PostGIS + Redis)
- **Git** (optional but recommended)
- For mobile: **Expo account** ([free signup](https://expo.dev/signup)) when you want a device build. Not needed for typecheck/test.
- For desktop: Electron is downloaded automatically by `pnpm install`.

> If `pnpm` isn't on PATH yet: `corepack enable && corepack prepare pnpm@latest --activate` (run once).

## 2. Install

```powershell
pnpm install
```

This pulls Medusa, Next.js, React Native, Expo, Electron, and all workspace packages. First-time install is ~5 minutes; subsequent installs use the pnpm content-addressable store.

## 3. Infrastructure (Docker)

```powershell
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d
```

What you get:
- `fieldsales-postgres` — PostgreSQL 16 + PostGIS 3.4 on **port 15432** (host) → 5432 (container). The non-standard host port is deliberate so it doesn't collide with a local Postgres install.
- `fieldsales-redis` — Redis 7 on port 6379.

Confirm:
```powershell
docker ps --format "{{.Names}}`t{{.Status}}"
```
You should see both as `healthy`.

## 4. Env Setup

Copy or use the bundled `.env` (already present in the repo root):

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `postgres://fieldsales:fieldsales@localhost:15432/fieldsales` | Backend → Docker Postgres |
| `REDIS_URL` | `redis://localhost:6379` | Future: rate limit / WS pub-sub |
| `PORT` | `9000` | Backend listen port |
| `MAP_PROVIDER` | `mock` | No external map calls. Switch to `mapbox`/`google`/`osrm` + token when ready (see `api-keys-and-services.md`) |
| `RETENTION_SWEEP_ENABLED` | `true` (recommended) | Nightly delete of `location_ping` rows older than `organisation_setting.raw_location_retention_days` |
| `AUTH_CORS` | `http://localhost:3000,http://localhost:5173` | Lets the dashboard call the API from the browser |
| `SENTRY_DSN` | (empty) | Error reporter is a no-op without it |

**You do not need to set any external API keys to run the MVP locally.** Everything defaults to mock/local/free.

## 5. Schema + Demo Bootstrap

Two options:

### 5a. Minimal seed (recommended for production-like work)
Bootstraps only `organisation` + permissions + 7 users (incl. dev admin). No outlets, leads, visits, routes, products, orders. You create real data via the UI/API.

```powershell
# apply schema
Get-Content -LiteralPath 'apps\backend-medusa\src\db\schema.sql' |
  docker exec -i fieldsales-postgres psql -U fieldsales -d fieldsales -v ON_ERROR_STOP=1

# minimal bootstrap (org + users + perms only)
pnpm --silent seed:minimal:sql |
  docker exec -i fieldsales-postgres psql -U fieldsales -d fieldsales -v ON_ERROR_STOP=1
```

### 5b. Full demo seed (15 outlets, 20 leads, 3 routes, etc.)

```powershell
Get-Content -LiteralPath 'apps\backend-medusa\src\db\schema.sql' |
  docker exec -i fieldsales-postgres psql -U fieldsales -d fieldsales -v ON_ERROR_STOP=1

pnpm --silent seed:demo:sql |
  docker exec -i fieldsales-postgres psql -U fieldsales -d fieldsales -v ON_ERROR_STOP=1
```

## 6. Run the Backend

```powershell
pnpm --filter @orbit/backend-medusa dev:scaffold
```

This runs `tsx src/dev-server.ts` — the current production runtime. You should see:

```
ensureSeedUser: dev admin ready
backend-medusa scaffold listening on http://localhost:9000; WS at ws://localhost:9000/ws/tracking; sentry=off
[retention] swept tenants=1 deleted=0
```

**Why `dev:scaffold` and not `dev`?** `dev` runs `medusa develop` which doesn't yet mount our custom routes (see the `mountMedusaRoute` shim in `apps/backend-medusa/src/api/medusa-adapter.ts` — the cutover is a documented operator step). For now `dev:scaffold` is the production runtime.

Smoke test:
```powershell
Invoke-RestMethod -Uri http://localhost:9000/health
```
→ `{"status":"ok","service":"backend-medusa"}` with these response headers: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `content-security-policy: default-src 'none'`, plus a unique `x-correlation-id` per request.

## 7. Run the Web Dashboard

In a separate terminal:

```powershell
pnpm --filter @orbit/web-dashboard dev
```

→ `http://localhost:3000`.

Login form is pre-filled with the dev admin:
- email: `admin@fieldsales.local`
- password: `admin123`
- organisationId: `org_acme`

Nav has 12 pages: Overview, Leads, Outlets, Territories, Visits, Tracking, Live Map, Routes, Audit, Conflicts, Orders, Reports.

## 8. Run the Mobile App (Expo)

```powershell
cd apps/mobile-field-sales
pnpm dev          # equivalent to: expo start --dev-client
```

The Metro bundler starts. To see anything on a device you need an **Expo dev client** — see §8a.

Reps log in with any seeded email + `admin123` (e.g. `rep1@acme-fieldsales.test`).

### 8a. Build an installable dev client (one-time)

```powershell
cd apps/mobile-field-sales
pnpm exec eas login
pnpm exec eas init               # generates EAS_PROJECT_ID
pnpm build:android               # cloud build → installable APK
# OR
pnpm build:ios                   # iOS, requires Apple Developer credentials
```

Install the APK on your phone (`adb install ...` or drag-drop), then `pnpm dev` to start the bundler. The dev client connects over LAN.

## 9. Run the Electron Desktop App

```powershell
cd apps/desktop-operations
pnpm build              # one-time: tsc compiles main + preload
cd ../..
pnpm --filter @orbit/desktop-operations dev
```

The Electron window opens at 1280×840 with the dashboard loaded inside. Native menu has File / Edit / View / **Operations** / Help. Operations menu exposes "Open API health in browser" and "Open API docs in browser". The Outlets page has an "Export CSV (desktop save dialog)" button that uses the IPC bridge.

## 10. End-to-End MVP Flow Test

After seeding, run this 15-step verification (PowerShell):

```powershell
# Step 1 — admin login
$login = Invoke-RestMethod -Uri http://localhost:9000/api/v1/auth/login -Method POST `
  -ContentType 'application/json' `
  -Body (@{ email='admin@fieldsales.local'; password='admin123'; organisationId='org_acme' } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.token)" }

# Steps 2-4 — manager-side setup
$terr = Invoke-RestMethod -Uri http://localhost:9000/api/v1/territories -Method POST -Headers $h `
  -ContentType 'application/json' `
  -Body (@{ name='Central'; boundaryWkt='MULTIPOLYGON(((77.55 12.90,77.68 12.90,77.68 13.02,77.55 13.02,77.55 12.90)))' } | ConvertTo-Json)

$o1 = Invoke-RestMethod -Uri http://localhost:9000/api/v1/outlets -Method POST -Headers $h `
  -ContentType 'application/json' `
  -Body (@{ name='Outlet A'; latitude=12.96; longitude=77.59 } | ConvertTo-Json)

$rp = Invoke-RestMethod -Uri http://localhost:9000/api/v1/route-plans -Method POST -Headers $h `
  -ContentType 'application/json' `
  -Body (@{ routeDate=(Get-Date -Format 'yyyy-MM-dd'); stopIds=@(@{ outletId=$o1.id; expectedDurationMinutes=15; priority=1 }); repLatitude=12.97; repLongitude=77.60 } | ConvertTo-Json -Depth 6)

# Steps 5-13 — rep flow
$rep = Invoke-RestMethod -Uri http://localhost:9000/api/v1/auth/login -Method POST `
  -ContentType 'application/json' `
  -Body (@{ email='rep1@acme-fieldsales.test'; password='admin123'; organisationId='org_acme' } | ConvertTo-Json)
$rh = @{ Authorization = "Bearer $($rep.token)" }

Invoke-RestMethod -Uri http://localhost:9000/api/v1/tracking -Method POST -Headers $rh `
  -ContentType 'application/json' -Body (@{ action='record_consent'; granted=$true } | ConvertTo-Json)

Invoke-RestMethod -Uri http://localhost:9000/api/v1/tracking -Method POST -Headers $rh `
  -ContentType 'application/json' -Body (@{ action='start_session'; latitude=12.97; longitude=77.60 } | ConvertTo-Json)

Invoke-RestMethod -Uri http://localhost:9000/api/v1/tracking -Method POST -Headers $rh `
  -ContentType 'application/json' `
  -Body (@{ action='record_pings'; pings=@(@{ id='p1'; latitude=12.971; longitude=77.601 }) } | ConvertTo-Json -Depth 6)

# Offline check-in via sync push (idempotent — replay returns cached result)
Invoke-RestMethod -Uri http://localhost:9000/api/v1/sync/push -Method POST -Headers $rh `
  -ContentType 'application/json' `
  -Body (@{ deviceId='dev_test_1'; mutations=@(@{ idempotencyKey='ci-1'; type='visit.check_in'; payload=@{ outletId=$o1.id; latitude=12.96; longitude=77.59 } }) } | ConvertTo-Json -Depth 6)

Invoke-RestMethod -Uri http://localhost:9000/api/v1/tracking -Method POST -Headers $rh `
  -ContentType 'application/json' -Body (@{ action='stop_session' } | ConvertTo-Json)

# Steps 14-15 — verification
Invoke-RestMethod -Uri http://localhost:9000/api/v1/reports/summary -Headers $h
Invoke-RestMethod -Uri http://localhost:9000/api/v1/audit-log -Headers $h
```

The reports response shows `outletCount`, `visitCount`, `routePlanCount`, `activeSessionCount`. The audit log lists every action that fired.

## 11. Validation Commands

| What | Command |
|---|---|
| All unit tests | `pnpm test` (68 tests across 20 files) |
| Workspace typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Web typecheck | `pnpm --filter @orbit/web-dashboard typecheck` |
| Mobile typecheck | `pnpm --filter @orbit/mobile-field-sales typecheck` |
| Desktop build | `pnpm --filter @orbit/desktop-operations build` |
| Medusa backend build | `pnpm --filter @orbit/backend-medusa medusa:build` |
| Docker compose syntax | `docker compose -f infra/docker/docker-compose.yml --env-file .env config` |

## 12. Adding a Real Map Provider

Pick one, set the env, restart:

```env
# Mapbox
MAP_PROVIDER=mapbox
MAPBOX_TOKEN=pk.xxxxxxxxxxxxxxxxxxxxx

# OR Google
MAP_PROVIDER=google
GOOGLE_MAPS_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OR OSRM (free, open-source, public servers acceptable for low QPS)
MAP_PROVIDER=osrm
OSRM_USER_AGENT=Orbit/1.0 (you@example.com)
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
```

`loadMapsProvider()` falls back to the mock if the credential for the chosen provider is missing — so a typo never silently calls the wrong endpoint.

## 13. Troubleshooting

| Symptom | Cause + fix |
|---|---|
| `pnpm: command not found` | Run `corepack enable && corepack prepare pnpm@latest --activate` once. |
| Backend 500 with `password authentication failed for user "fieldsales"` | A host-side Postgres is listening on the same port. We deliberately use 15432; if you still get this, either stop the host Postgres or pick a different `POSTGRES_PORT` in `.env` + restart containers. |
| Backend 401 on login | Check the seed ran. Confirm `admin@fieldsales.local` exists: `docker exec fieldsales-postgres psql -U fieldsales -d fieldsales -c "SELECT email FROM app_user;"` |
| Browser login 403 cross-origin | `AUTH_CORS` env doesn't include your dashboard origin. Add it. |
| 429 from API | You hit the rate limiter. Defaults: 20/min for `/auth/login`, 600/min for `/sync/push` + `/tracking`, 300/min for everything else. |
| Electron window blank | Web dashboard isn't running on port 3000. Start it first, then Electron. |
| Mobile typecheck passes but won't run on a device | Mobile needs a real EAS dev client build — see §8a. |

## 14. Useful URLs

- Backend health: http://localhost:9000/health
- Login: http://localhost:9000/api/v1/auth/login
- OpenAPI spec: see `docs/api/openapi.yaml` (not served at runtime)
- Web dashboard: http://localhost:3000
- WS gateway: `ws://localhost:9000/ws/tracking?token=<jwt>`
