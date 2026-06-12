# Orbit

**Orbit** is a multi‑tenant **field‑sales force‑automation (SFA) platform**. It gives field reps an offline‑first mobile app to run their day, gives managers a real‑time web dashboard to plan and supervise, and ties it together with optimised route planning, geofenced visit verification, and field ordering.

> One platform for the whole field motion: **plan routes → visit outlets → capture proof → take orders → see it all live.**

---

## ✨ Features

### Plan
- **Outlets** – customer locations with a modern, coordinate‑free location picker: **search an address**, **use current GPS**, or **drop/drag a map pin** (no typing latitude/longitude). CSV import/export.
- **Leads** – capture and assign prospects, with the same map‑based location picker.
- **Territories** – define and assign geographic territories.
- **Route Planner** – build optimised daily routes:
  - Real **road routing & ETAs** (OSRM) with a **nearest‑first + 2‑opt/or‑opt** optimiser (priority‑aware).
  - **Map‑first** outlet selection, **drag‑to‑reorder** stops, and **"Open in Google Maps"** turn‑by‑turn export.
  - Start from **current location**, an **address search**, or the **first stop**.

### Field execution (mobile)
- **Geofenced check‑in/out** at outlets, **visit proof photos**, and **e‑signature** capture.
- **Competitor intel**, **product samples**, and **visit expenses** logging.
- **Field ordering** – take orders on the spot from the product catalogue.
- **Offline‑first** with a sync queue and conflict resolution; **work sessions / attendance**.

### Operate & supervise
- **Live Team Map** – real‑time rep locations over WebSocket (privacy‑controlled tracking with consent).
- **Visits**, **Orders**, **Notifications**, and an **Operational queue** (geofence exceptions, sync issues).
- **Coverage map**, **Route & integrity** checks, **Field ops** console.

### Insight
- **Analytics**, **Reports**, **Expenses**, and per‑rep / team scorecards.
- **Audit log** of sensitive actions.

### Admin & platform
- **Multi‑tenant organisations**, **Users**, **Teams**, and **role‑based access control** (field vs. admin areas).
- **Integrations** (ERPNext CRM lead capture / order push).
- **PWA** (installable web app + offline shell), **light/dark mode**, JWT auth.

---

## 🧱 Architecture

Orbit is a **pnpm monorepo** with four apps and shared packages:

| App | Path | Stack | Purpose |
|-----|------|-------|---------|
| **Backend API** | `apps/backend` | Node 22 · TypeScript · Postgres 16 + PostGIS · Redis · JWT · WebSocket | REST + realtime API, auth, route optimisation, sync |
| **Web Dashboard** | `apps/web-dashboard` | Next.js 15 · React 19 · Tailwind · shadcn/ui · MapLibre GL | Manager/admin console (production build) |
| **Mobile App** | `apps/mobile-field-sales` | Expo · React Native | Field rep app (GPS, camera, offline) |
| **Desktop App** | `apps/desktop-operations` | Electron 33 | Desktop shell that loads the dashboard |

**Shared packages** (`packages/*`): `api-client`, `maps-provider` (OSRM/Mapbox/Google/mock), `validation` (RBAC), `shared-types`, `event-contracts`, `sync-engine`, `ui`, `config`.

**Data & infra**: Postgres + PostGIS (geospatial), Redis (cache, locks, realtime), all orchestrated by Docker Compose under `infra/docker/`.

---

## 🚀 Quick Start (Docker — recommended)

The fastest way to run the full backend + web + database stack.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Git](https://git-scm.com/).

```bash
git clone https://github.com/mithtech-is/Orbit.git
cd Orbit

# Build & start backend + web + postgres + redis
docker compose -f infra/docker/docker-compose.yml up -d --build
```

Then open the dashboard:

- **Web dashboard:** http://localhost:3001
- **Backend health:** http://localhost:9090/health

**Default login** (seeded automatically on first boot):

| Field | Value |
|-------|-------|
| Email | `admin@fieldsales.local` |
| Password | `admin123` |
| Organisation | `mithtech` |

To stop the stack (your data is preserved):

```bash
docker compose -f infra/docker/docker-compose.yml down
```

### 🪟 Windows one‑click
On Windows you don't need to type anything — just **double‑click `start.bat`** in the repo root. It launches Docker Desktop if needed, builds & starts the whole stack, waits for the dashboard, and opens it in your browser. It's portable (no hard‑coded paths), so it works wherever you cloned the repo.

To stop later (your data is kept): `docker compose -f infra/docker/docker-compose.yml down`

---

## 📱 Run the Mobile app (Expo)

The mobile app runs on the host (it's a client of the backend).

**Prerequisites:** Node 20+ and `pnpm` 9 (`npm i -g pnpm`).

```bash
pnpm install
pnpm --filter @orbit/mobile-field-sales dev   # starts Expo Metro (default :8088)
```

Scan the QR code with **Expo Go**, or run on an emulator. To build a standalone APK you'll need `expo prebuild` + Android Studio / EAS (see `docs/engineering/mobile-production-build-guide.md`).

## 🖥️ Run the Desktop app (Electron)

With the web dashboard already running (Docker), launch the Electron shell:

```bash
pnpm install
ORBIT_WEB_URL=http://localhost:3001 pnpm --filter @orbit/desktop-operations dev
```

(On Windows: `set ORBIT_WEB_URL=http://localhost:3001 && pnpm --filter @orbit/desktop-operations dev`.)

---

## 🔌 Ports

| Service | Host port | Notes |
|---------|-----------|-------|
| Web dashboard | **3001** | Next.js production server |
| Backend API + WS | **9090** | REST + `ws://…/ws/tracking` |
| Postgres (PostGIS) | **15432** | |
| Redis | **6380** | |
| Expo Metro (mobile) | **8088** | host‑run |

---

## ⚙️ Configuration

Environment variables are documented in **`.env.example`**. For local Docker you don't need to set anything to get started — sensible defaults are baked into `infra/docker/docker-compose.yml`.

Key settings:

- **`MAP_PROVIDER`** – `osrm` (default, free), `mapbox`, `google`, or `mock`. Production refuses to boot on `mock`.
- **`OSRM_USER_AGENT`** – required for `osrm`. ⚠️ **Must identify a real app/contact** — Nominatim returns **403** for any User‑Agent containing `example.com`.
- **`OSRM_BASE_URL` / `NOMINATIM_BASE_URL`** – point these at a **self‑hosted OSRM/Nominatim** for production scale (the public servers are rate‑limited).
- **`MAPBOX_TOKEN` / `GOOGLE_MAPS_API_KEY`** – required if you switch `MAP_PROVIDER`.
- **`JWT_SECRET`** – set a strong secret in any non‑dev deployment.

> 🔒 **Secrets are never committed.** `.env`, `.env.local`, and `.env.scaffold` are git‑ignored; only the safe `.env.example` template is in the repo. Copy it and fill in your own values for a non‑Docker / production setup.

---

## 🧪 Development & testing

```bash
pnpm install            # install all workspaces
pnpm test               # run the full Vitest suite (unit + regression)
pnpm typecheck          # type-check the shared packages
```

Run individual services without Docker:

```bash
pnpm --filter @orbit/backend dev    # backend (needs Postgres + Redis reachable)
pnpm --filter @orbit/web-dashboard dev     # web in dev mode (Linux/macOS; see note below)
```

> **Note (Windows):** the web app's `next` package exceeds the 260‑char `MAX_PATH` limit on Windows, so on Windows run the web app via Docker (as above) rather than on the host.

---

## 📁 Project structure

```
Orbit/
├─ apps/
│  ├─ backend/               # API, auth, route optimisation, sync (Node + tsx)
│  ├─ web-dashboard/         # Next.js manager/admin console
│  ├─ mobile-field-sales/    # Expo / React Native rep app
│  └─ desktop-operations/    # Electron desktop shell
├─ packages/
│  ├─ api-client/  maps-provider/  validation/  shared-types/
│  ├─ event-contracts/  sync-engine/  ui/  config/
├─ infra/
│  ├─ docker/                # docker-compose.yml + Dockerfiles
│  └─ erpnext-crm/           # optional ERPNext CRM integration
└─ docs/                     # architecture, runbooks, audits
```

---

## 🩺 Troubleshooting

- **Web nav feels slow on first load** – the dashboard is shipped as a Next.js **production build** (`next build` + `next start`) precisely to avoid this; if you switched it to `next dev`, the first hit per route compiles on demand (2–3s).
- **Route planning returns no roads / 403 from Nominatim** – your `OSRM_USER_AGENT` likely contains `example.com`. Set a real contact.
- **Public OSRM is slow / rate‑limited** – self‑host OSRM and set `OSRM_BASE_URL`.
- **Database** – data lives in the `orbit-postgres` Docker volume and persists across `down`/`up`. Never commit DB dumps (they contain password hashes) — `backups/` is git‑ignored.

---

## 📄 License

Proprietary — © MithTech. All rights reserved.
