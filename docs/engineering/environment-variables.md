# Environment Variables

Use `.env.example` as the source template. Do not commit real secrets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL/PostGIS connection string for backend. |
| `REDIS_URL` | Redis connection for queues, cache and WebSocket pub/sub. |
| `MEDUSA_BACKEND_URL` | Backend base URL used by clients and local tooling. |
| `MEDUSA_JWT_SECRET` | Local JWT signing secret. |
| `MEDUSA_COOKIE_SECRET` | Local cookie/session secret. |
| `NEXT_PUBLIC_API_BASE_URL` | Dashboard API endpoint. |
| `NEXT_PUBLIC_WS_URL` | Dashboard WebSocket endpoint. |
| `NEXT_PUBLIC_MAP_PROVIDER` | `mock` for local development; `mapbox` when configured. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public map rendering token when Mapbox is enabled. |
| `MOBILE_API_BASE_URL` | Mobile API endpoint. |
| `OBJECT_STORAGE_PROVIDER` | `local` for development or `s3` for cloud. |
| `PUSH_PROVIDER` | `log`, `fcm` or `onesignal`. |
| `SENTRY_DSN` | Error monitoring DSN. |
| `ELECTRON_UPDATER_PROVIDER` | Desktop update provider. |
| `DEMO_*` | Demo tenant and user credentials for seed scripts. |
