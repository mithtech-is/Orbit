# Production Security Checklist (Pilot Tier)

Use this checklist before pointing a customer at the platform. Every item must be **checked and dated** by the deployer.

## 1. Secrets

- [ ] `JWT_SECRET` set to a random value ≥ 32 characters. **The backend will refuse to start in production if this is missing, too short, or equal to the development fallback string.**
- [ ] `SESSION_SECRET` set if you add session-based auth later (not currently required).
- [ ] Secrets are loaded from a real secret manager (Vault / AWS Secrets Manager / Doppler / GitHub OIDC), not committed in plain `.env` files.
- [ ] All `.env*` files are in `.gitignore`. Confirmed by checking `git check-ignore .env`.

## 2. Authentication / users

- [ ] `ENABLE_DEMO_SEED` is **NOT** set (validator rejects `true` in production).
- [ ] No `admin@fieldsales.local` / `admin123` account exists in the production database. Verify:
  ```sql
  SELECT email FROM app_user WHERE email = 'admin@fieldsales.local';
  -- must return 0 rows
  ```
- [ ] First admin was created via `pnpm create-initial-admin --org … --email … --name …` (NOT via `ensureSeedUser`).
- [ ] First admin's password was set to ≥ 12 random characters by the operator.
- [ ] `app_user.password_change_required` was `true` for the first admin and they have actually changed it.

## 3. Network surface

- [ ] Backend bound behind an HTTPS reverse proxy (nginx / Caddy / cloud load balancer). The backend itself listens HTTP only inside the trust boundary.
- [ ] `AUTH_CORS` env contains ONLY your dashboard origin(s). No wildcards.
- [ ] Rate-limit headers `x-ratelimit-*` are visible on responses (proves the limiter is on).
- [ ] WebSocket `/ws/tracking` endpoint requires `?token=<jwt>` query param. Unauthenticated upgrades close immediately.

## 4. Database

- [ ] `pnpm migrate up` succeeded; `pgmigrations` table exists.
- [ ] `pgmigrations` rows match the count of files in `apps/backend-medusa/migrations/`.
- [ ] Backup cron is configured per `docs/engineering/backup-and-restore-runbook.md`.
- [ ] **At least one restore drill has been performed and documented.**
- [ ] PostGIS extension is available: `SELECT PostGIS_Version();`
- [ ] Postgres user has no superuser rights in production (use a tenant-scoped role).

## 5. Privacy controls

- [ ] `RETENTION_SWEEP_ENABLED` is `true` (default in production).
- [ ] `organisation_setting.raw_location_retention_days` is set per tenant — default 90.
- [ ] Audit log writes are firing — confirm at least one `tracking.consent.recorded` and one `outlet.created` entry after the first invited user works in the system.
- [ ] Customer has been told what we store and for how long, and has signed off in writing.

## 6. Headers + cookies

- [ ] All API responses include:
  - `x-content-type-options: nosniff`
  - `x-frame-options: DENY`
  - `strict-transport-security: max-age=15552000; includeSubDomains`
  - `referrer-policy: strict-origin-when-cross-origin`
  - `content-security-policy: default-src 'none'; frame-ancestors 'none'`
- [ ] JWT is **not** delivered via `Set-Cookie` today — the dashboard stores it in `localStorage`. Document this risk; an upgrade to HttpOnly + SameSite cookies is recommended before a customer with hostile users (public-facing SaaS).

## 7. Observability

- [ ] `SENTRY_DSN` set (envelope sender attaches automatically).
- [ ] Request logs flowing into a structured-log pipeline (each request emits one JSON line with `correlationId`).
- [ ] Health check (`GET /health`) wired to your monitor / uptime check.

## 8. Mobile

- [ ] Mobile app built via `eas build:android --profile production` (or iOS equivalent), signed, and distributed.
- [ ] Production app points to `MOBILE_API_BASE_URL` and `MOBILE_WS_URL` over **HTTPS / WSS**, never plaintext.
- [ ] Real device permission flow tested: foreground location → background location → consent recorded → session started → pings flowing.

## 9. Operational hygiene

- [ ] At least two people can deploy.
- [ ] Migration files are reviewed before merge.
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` are gating PR checks (GitHub Actions workflow `.github/workflows/ci.yml` is enabled).
- [ ] Backup restoration drill scheduled for the first month post-launch.

---

Deployed by: ________________  on: ____ / ____ / ______
Reviewed by: ________________  on: ____ / ____ / ______
