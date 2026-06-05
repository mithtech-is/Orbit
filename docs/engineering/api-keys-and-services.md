# API Keys & External Services

Every external dependency the platform can talk to. The repo defaults to **mock / local / free** wherever practical so you can run the entire MVP without signing up for anything. Each row says exactly when a real provider becomes necessary, lists the cheapest viable option (free tier first, then open-source self-hosted, then paid), and names the env var(s) you'd set.

## Quick Reference Table

| # | Service | Purpose | Required for MVP? | Free Tier? | Open-Source Alternative | Signup URL | ENV Variables |
|---|---|---|---|---|---|---|---|
| 1 | **PostgreSQL + PostGIS** | Primary datastore + geospatial | **Required** | n/a — runs locally in Docker | self-hosted (it IS open-source) | — | `DATABASE_URL`, `POSTGRES_*`, `POSTGRES_PORT` |
| 2 | **Redis** | Cache / queue / WS pub-sub (future) | **Required** | n/a — runs locally in Docker | self-hosted (it IS open-source) | — | `REDIS_URL` |
| 3 | **Mapbox** | Geocoding / route opt / distance matrix | Optional (mock default) | ✅ 50k loads/month, 100k geocodes/month | OSRM + Nominatim (row 5) | https://account.mapbox.com/auth/signup | `MAP_PROVIDER=mapbox`, `MAPBOX_TOKEN` |
| 4 | **Google Maps Platform** | Geocoding / directions / distance matrix | Optional | ✅ $200/month credit (~28k geocodes free) | OSRM + Nominatim (row 5) | https://console.cloud.google.com/google/maps-apis | `MAP_PROVIDER=google`, `GOOGLE_MAPS_API_KEY` |
| 5 | **OSRM + Nominatim** | Routing + geocoding (open-source) | Optional | ✅ public demo servers (low QPS) or self-host | n/a — self-hosted is the alternative | https://github.com/Project-OSRM/osrm-backend / https://nominatim.org/ | `MAP_PROVIDER=osrm`, `OSRM_USER_AGENT`, `OSRM_BASE_URL`, `NOMINATIM_BASE_URL` |
| 6 | **Sentry** | Error reporting | Optional | ✅ 5k events/month | self-hosted Sentry, or [GlitchTip](https://glitchtip.com/) (Sentry-API-compatible, MIT) | https://sentry.io/signup/ | `SENTRY_DSN` |
| 7 | **Expo / EAS** | Mobile dev client + cloud builds | Required for installable mobile | ✅ 30 builds/month free | self-host Metro + bare RN init (no cloud builds, manual signing) | https://expo.dev/signup | `EAS_PROJECT_ID` (set by `eas init`) |
| 8 | **Expo Push** | Push notifications (Android + iOS) | Optional (current `PUSH_PROVIDER=log` is a no-op) | ✅ unlimited free | self-host UnifiedPush server | https://expo.dev/ | `PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN` |
| 9 | **Firebase Cloud Messaging (FCM)** | Push to Android (alternative) | Optional | ✅ unlimited free | UnifiedPush | https://console.firebase.google.com/ | `PUSH_PROVIDER=fcm`, `FCM_SERVER_KEY` |
| 10 | **OneSignal** | Push (alternative) | Optional | ✅ 10k subscribers free | UnifiedPush | https://onesignal.com/ | `PUSH_PROVIDER=onesignal`, `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` |
| 11 | **MinIO** | S3-compatible object storage (local) | Optional (current `OBJECT_STORAGE_PROVIDER=local` writes to disk) | ✅ self-hosted, free, open-source | — | https://min.io/download | `OBJECT_STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` |
| 12 | **Cloudflare R2** | S3-compatible object storage (cloud, zero egress) | Optional | ✅ 10 GB storage + 1M Class A ops free | MinIO (row 11) | https://dash.cloudflare.com/sign-up/r2 | same S3 envs + custom `S3_ENDPOINT` |
| 13 | **AWS S3** | Object storage (production) | Optional | ✅ 5 GB free for 12 months | MinIO / R2 | https://aws.amazon.com/free/ | same S3 envs |
| 14 | **Resend** | Transactional email (cheap + dev-friendly) | Optional (not wired) | ✅ 100/day free | self-host Postal or Listmonk | https://resend.com/signup | `RESEND_API_KEY` (future — not currently in `.env.example`) |
| 15 | **Twilio** | SMS (rep notifications, password reset) | Optional (not wired) | $15 trial credit | self-host an SMS gateway (no truly free SMS) | https://www.twilio.com/try-twilio | future `TWILIO_*` |
| 16 | **Auth provider (OIDC)** | SSO instead of email/password (future) | Optional | ✅ Keycloak self-hosted | Keycloak / Authentik / Zitadel | https://www.keycloak.org/ | future `OIDC_*` |
| 17 | **WebSocket infrastructure** | Real-time fan-out | Built-in (`ws` package in dev-server) | n/a | n/a | — | `NEXT_PUBLIC_WS_URL`, `MOBILE_WS_URL` |
| 18 | **CDN** | Static asset delivery | Optional | ✅ Cloudflare free, Netlify free, Vercel free | self-host nginx | https://dash.cloudflare.com/ | n/a (proxy config, not env-driven) |
| 19 | **PostHog** | Product analytics | Optional (not wired) | ✅ 1M events/month free | self-host PostHog (open-source MIT) | https://posthog.com/ | future `POSTHOG_KEY` |
| 20 | **Plausible** | Privacy-friendly web analytics | Optional (not wired) | ✅ 30-day trial; or self-host (AGPL) | self-host | https://plausible.io/ | future `PLAUSIBLE_DOMAIN` |
| 21 | **Electron auto-updater** | Desktop app updates | Optional | Free | self-host (GitHub Releases, S3-compatible bucket, or static file server) | — | `ELECTRON_UPDATER_PROVIDER`, `ELECTRON_UPDATE_URL` |
| 22 | **AI integrations** | (None in MVP) | n/a | — | — | — | — |

## Per-Service Detail

### 1. PostgreSQL + PostGIS — **Required**
- **What uses it:** every business write (org, users, outlets, leads, visits, route plans, audit log, sync). PostGIS for outlet point storage, territory polygons, ST_Contains queries.
- **Mock in code?** No — runs in Docker locally via `infra/docker/docker-compose.yml` (image `postgis/postgis:16-3.4`).
- **Local fallback:** the docker-compose IS the local fallback.
- **Production:** managed Postgres with PostGIS extension (RDS, Cloud SQL, Supabase, Neon, etc.). All major managed Postgres providers support PostGIS.

### 2. Redis — **Required**
- **What uses it:** today, **nothing structural** — it's started in docker-compose for future use by the rate limiter (when swapped from in-memory to ZSET), the WS gateway (when swapped to pub/sub), and BullMQ retention jobs.
- **Mock in code?** No, but no consumer code yet.
- **Local fallback:** docker-compose runs `redis:7-alpine` on port 6379.
- **Production:** any managed Redis (Upstash free tier, Redis Cloud, etc.).

### 3. Mapbox — Optional (one of three real provider choices)
- **What uses it:** `route-planning/repository.ts.loadMapsProvider()` when `MAP_PROVIDER=mapbox`. Calls Mapbox Geocoding v5 (forward + reverse), Optimized Trips v1, Directions Matrix v1.
- **Mock in code?** Yes — `createMockMapsProvider()` returns deterministic results. Selected when `MAPBOX_TOKEN` is missing.
- **Local fallback:** mock provider, default behaviour.
- **Free tier:** 50k map loads/month, 100k geocodes/month. Enough for an MVP pilot.
- **Setup:** `MAPBOX_TOKEN=pk.xxxxxxxxxxxxxxxxxxxxx` in `.env`, set `MAP_PROVIDER=mapbox`, restart backend.

### 4. Google Maps Platform — Optional
- **What uses it:** same hook as Mapbox when `MAP_PROVIDER=google`. Calls Geocoding API + Directions API (with `optimize:true` waypoints) + Distance Matrix API.
- **Mock in code?** Yes (see #3).
- **Free tier:** $200/month credit ≈ 28k geocodes or 40k routes free.
- **Setup:** `GOOGLE_MAPS_API_KEY=AIza...` in `.env`, set `MAP_PROVIDER=google`, restart.

### 5. OSRM + Nominatim — Optional, **free, open-source**
- **What uses it:** same hook when `MAP_PROVIDER=osrm`. Calls OSRM `/trip` + `/table` and Nominatim `/search` + `/reverse`.
- **Mock in code?** Yes.
- **Free public servers:** `router.project-osrm.org` and `nominatim.openstreetmap.org` — strict usage policy: low QPS, real User-Agent. Suitable for dev + tiny production loads.
- **Self-host:** Docker images for both are mature; OSRM needs a preprocessed `.osm.pbf` extract for your region.
- **Setup:** `MAP_PROVIDER=osrm`, `OSRM_USER_AGENT=YourApp/1.0 (you@example.com)`, optional `OSRM_BASE_URL` / `NOMINATIM_BASE_URL`.

### 6. Sentry — Optional
- **What uses it:** `src/http/sentry.ts.captureError()` posts a Sentry envelope on every 5xx response when `SENTRY_DSN` is set. Today it's a hand-rolled fetch (no `@sentry/node` dep).
- **Mock in code?** When `SENTRY_DSN` is unset, `captureError` is a no-op.
- **Free tier:** 5k events/month, 1 user. Plenty for an MVP.
- **Open-source alternative:** **GlitchTip** is Sentry-API-compatible and self-hostable under MIT. Same `SENTRY_DSN` URL pattern.
- **Setup:** `SENTRY_DSN=https://<key>@<region>.ingest.sentry.io/<project>` in `.env`, restart.

### 7. Expo / EAS — **Required for installable mobile**
- **What uses it:** the mobile app is now an Expo project (`app.config.ts`, `babel-preset-expo`, `index.js` → `registerRootComponent`). `pnpm dev` runs `expo start --dev-client`; `pnpm build:android` runs `eas build`.
- **Mock in code?** Not applicable — Expo is the runtime, not a service.
- **Free tier:** 30 cloud builds/month per account.
- **Open-source alternative:** bare `react-native init` + Metro + manual fastlane signing. No cloud builds. Higher operational cost.
- **Setup:**
  ```powershell
  cd apps/mobile-field-sales
  pnpm exec eas login
  pnpm exec eas init       # generates EAS_PROJECT_ID
  pnpm build:android       # cloud build → installable APK
  ```

### 8–10. Push providers — Optional
- **What uses it:** today, nothing — `PUSH_PROVIDER=log` is the default and means push events are written to backend stdout. The notification module exists (`modules/notification/index.ts`) but is a stub.
- **Recommendation:** Expo Push (free, unlimited) when standardising on Expo. FCM (Android only, free, unlimited) if going bare RN.
- **Setup:** set `PUSH_PROVIDER=expo` (or `fcm` / `onesignal`) + the corresponding token vars.

### 11–13. Object storage — Optional
- **What uses it:** today, nothing — `OBJECT_STORAGE_PROVIDER=local` writes to `.local/object-storage/` and there's no upload code yet. Will be needed once visit attachments / photos land.
- **Recommendation:**
  - Local dev: MinIO in docker-compose (S3-compatible)
  - Production cheap: Cloudflare R2 (free 10 GB + zero egress fees)
  - Production AWS-native: S3

### 14–15. Email / SMS — Optional
- **What uses it:** Nothing wired yet — there's no password-reset endpoint or rep-invite flow. When you add them, prefer **Resend** (100 emails/day free, modern API). SMS has no free tier worth recommending; Twilio's trial credit gets you started.

### 16. Auth provider — Optional (future)
- **What uses it:** today, internal email+bcrypt+JWT (`auth-service.ts`). When SSO is needed, swap the login endpoint for an OIDC redirect against **Keycloak** (self-hosted, free, mature).

### 17. WebSocket infrastructure — Built-in
- **What uses it:** `apps/backend-medusa/src/realtime/ws-gateway.ts` attaches a `ws` server to the same HTTP server. No external service.
- **Scale:** in-memory subscriber set; for >1 backend instance, replace the `Set<Subscriber>` with a Redis pub/sub channel (one file change).

### 18. CDN — Optional
- Not strictly needed for an internal pilot. **Cloudflare** in front of the dashboard origin gives you free CDN + DDoS protection.

### 19–20. Analytics — Optional (not wired)
- Recommend **PostHog** (free tier or self-hosted) for product analytics and **Plausible** (paid or self-hosted) for marketing analytics. Neither is wired today.

### 21. Electron auto-updater — Optional
- `electron-builder.json` exists but `ELECTRON_UPDATER_PROVIDER=none` by default. When releasing, use the GitHub Releases provider — totally free.

## What This Means for "I want to run the MVP locally with zero signups"

You can run the entire platform **right now** with no external accounts and no API keys:

```env
# .env (already configured)
DATABASE_URL=postgres://fieldsales:fieldsales@localhost:15432/fieldsales
REDIS_URL=redis://localhost:6379
MAP_PROVIDER=mock           # deterministic mock returns fake-but-realistic results
PUSH_PROVIDER=log           # writes push events to backend stdout
OBJECT_STORAGE_PROVIDER=local
SENTRY_DSN=                 # empty → captureError is a no-op
```

The only signup you can't avoid eventually is **Expo / EAS** if you want a mobile dev client on a device. Everything else has a working mock or local-Docker substitute.
