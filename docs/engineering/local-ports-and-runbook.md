# Orbit / Orbit — fixed ports & local runbook

This machine runs several separate projects that used to fight over ports. Every
Orbit service now has **one fixed port, reserved for Orbit only**, that
does not collide with anything else on the box.

## Reserved ports

| Service | Port | Runtime | Notes |
|---|---|---|---|
| Postgres (PostGIS) | **15432** | Docker | `fieldsales-postgres` |
| Redis | **6380** | Docker | `fieldsales-redis` (host `6379` is taken) |
| Backend API + WS | **9090** | Docker | `/health`, `ws://…/ws/tracking` (POS owns `9000`) |
| Web dashboard | **3001** | Docker | Next.js dev (host `3000` is taken) |
| Mobile (Expo Metro) | **8088** | host only | `expo start --port 8088` |
| Desktop (Electron) | — | host only | GUI client, no port |

### Ports owned by OTHER projects on this machine — do NOT reuse for Orbit
| Port | Owner |
|---|---|
| 8080 | HR ERPNext (`frappe-hr-v16`) |
| 8082 | Orbit CRM (`routepilot-crm`) |
| 9000 | Polemarch POS backend |
| 3000 | (host service) |
| 6379 | (host redis) |

## Run the server stack (Docker — postgres, redis, backend, web)

```bash
docker compose -f infra/docker/docker-compose.yml up -d            # start (build if needed: add --build)
docker compose -f infra/docker/docker-compose.yml ps               # all 4 should be "healthy"
docker compose -f infra/docker/docker-compose.yml logs -f backend  # tail logs
docker compose -f infra/docker/docker-compose.yml down             # stop (keeps DB data)
```

Isolated compose project **`fieldsales`**. Data lives in the named volumes
`docker_fieldsales-postgres` / `docker_fieldsales-redis` and survives `down`.

Verify:
```bash
curl http://localhost:9090/health        # {"status":"ok","service":"backend-medusa"}
# open http://localhost:3001 in a browser
```

Dev login (seeded automatically on backend boot in development):
`admin@fieldsales.local` / `admin123`, organisation `mithtech`.

## Mobile / desktop run on the host

Expo and Electron can't run inside the Docker stack — they run on the host and
talk to the backend (`9090`) / web (`3001`):

```bash
pnpm --filter @orbit/mobile-field-sales dev        # Expo Metro on 8088
pnpm --filter @orbit/desktop-operations dev        # Electron
```

The mobile `.env` points at the PC's LAN IP for a physical phone — update it if
the IP changes.

## Why the web runs in Docker dev mode (not on the host, not a prod build)

Two host-specific problems make Docker the right home for the web app:

1. **Windows MAX_PATH (260 chars).** Under pnpm's default isolated linker the
   `next` package's deeply-nested `dist/compiled/...` paths exceed the limit, so
   `next` installs incompletely and **cannot run on the Windows host at all**.
   Linux (Docker) has no such limit, so the install is complete there.
2. **In-progress feature code.** Some dashboard pages (e.g. the proof-photo
   `visits` page and `reports/expenses`) are mid-development and don't type-check
   yet, so a production `next build` fails. `next dev` tolerates this.

So the web image runs `next dev -p 3001`. When the in-progress pages compile
cleanly, switch the web Dockerfile back to `next build` + `next start` for a
proper production image.

## Dependency / install gotchas (host)

- **`.npmrc` is disabled** (renamed `.npmrc.hoisted-disabled`). It set
  `node-linker=hoisted` (added to dodge MAX_PATH for the Android release build),
  but under the hoisted linker `pnpm install` fails with
  `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY` on the giant `@medusajs/medusa` peer key
  (a React 18 vs 19 / `@types/react` override clash in the lockfile). With the
  hoisted linker disabled the workspace installs cleanly (isolated linker).
- Re-enabling hoisted (needed for `gradlew assembleRelease` APK builds) currently
  reintroduces that lockfile error — that needs a separate dependency
  reconciliation (align the React/`@types/react` versions) before APK release
  builds work again.
- If the host pnpm store gets corrupted (missing package files), repair with
  `pnpm install --force`.
