# Scaling Orbit to 10k concurrent users

**Date:** 2026-05-29
**Goal:** remove the hard blockers from `scalability-readiness-report.md` that prevented running more than one backend process, and make the highest-volume path (tracking ingestion + live map) survive ~10k active reps.

This documents what was **implemented + verified**, and the **deployment topology** to actually run at 10k.

---

## What was implemented + verified

| Audit blocker | Fix | File | Verified |
|---|---|---|---|
| **C2** WebSocket fan-out was a single in-process `Set` (couldn't run >1 instance) | **Redis pub/sub**: `broadcastEvent` PUBLISHes to `routepilot:ws`; every instance subscribes + fans out to its local sockets. Local fan-out fallback if no Redis. | `realtime/ws-gateway.ts`, `redis/client.ts` | ✅ cross-instance proof: ping on :9000 → WS client on :9001 (`RESULT=SUCCESS`) |
| **C5** `location_ping` unbounded + DELETE retention | **Monthly RANGE partitioning** + `DROP PARTITION` retention; partitions auto-provisioned at boot + each sweep | `migrations/1700000000003`, `internal/jobs/partition-manager.ts` | ✅ `partitioned=true`, monthly partitions + default, existing rows preserved |
| **C1** pg pool hard-capped at 10 | pool size + timeouts from env (`DB_POOL_MAX` default 20) | `db/client.ts` | ✅ |
| **H5** rate limiter per-process | **Redis fixed-window limiter** (`checkRateLimitAsync`); in-memory fallback | `http/rate-limit.ts`, `dev-server.ts` | ✅ |
| **H5** retention ran on every instance | **Redis leader lock** (`SET NX PX`) — one sweeper per tick | `internal/jobs/retention-scheduler.ts` | ✅ |
| **H6** per-subscriber JSON serialize | serialize once per event | `realtime/ws-gateway.ts` | ✅ |
| **C3/M3/H1** unindexed hot tables | 7 indexes | `migrations/1700000000001` | ✅ EXPLAIN-confirmed |
| **C4/C6** whole-org rep reads | SQL-scoped reads | `field-orders`, `tracking` routes | ✅ live |

**Graceful degradation:** with no `REDIS_URL` and an un-partitioned table, the backend runs exactly like the single-instance dev scaffold. Set `REDIS_URL` + apply the partition migration + run multiple instances → it becomes correctly clustered, **no code change between dev and scaled prod.**

---

## Deployment topology for 10k

```
                clients (web, mobile, electron)  — HTTPS + WSS
                              │
                       ┌──────▼──────┐  L7 LB (nginx). Sticky NOT required for WS:
                       │  load bal.  │  Redis pub/sub lets any instance serve any socket.
                       └──────┬──────┘
            ┌─────────────────┼─────────────────┐
       ┌────▼────┐       ┌────▼────┐        ┌────▼────┐
       │ backend │  ...  │ backend │   ...  │ backend │   8–16 stateless instances (PORT per container)
       └────┬────┘       └────┬────┘        └────┬────┘
            │  pub/sub + limiter + leader-lock   │
            └──────────────► Redis ◄─────────────┘
            │                                     │
            └──────────► pgBouncer ◄──────────────┘   transaction pooling
                              │
                       ┌──────▼──────┐  primary + read replicas
                       │  Postgres   │  (location_ping partitioned)
                       └─────────────┘
```

**Capacity reasoning (from the audit's numbers):**
- **Ingestion:** 10k reps × 1 ping / 20s ≈ **500 writes/s**. With partitioning + the `(org,user,recorded_at)` index + a 20-conn pool per instance behind pgBouncer, comfortably absorbed across 8–16 instances. For 50k+ move to a batch endpoint → Redis Stream → COPY consumer (next step).
- **WebSocket:** sockets spread across instances; each broadcast = one Redis PUBLISH + local fan-out per instance. No instance holds all 10k sockets.
- **Reads:** rep reads are SQL-scoped; point dashboards/reports at a **read replica** and cache report summaries in Redis (next step).

### Required env for a scaled instance
```bash
NODE_ENV=production
DATABASE_URL=postgres://user:pass@pgbouncer:6432/fieldsales
REDIS_URL=redis://redis:6379
DB_POOL_MAX=20
JWT_SECRET=...  APP_URL=...  AUTH_CORS=...
RETENTION_SWEEP_ENABLED=true   # only the Redis leader actually runs it
```

---

## Multi-instance verification (the C2 proof)

`apps/backend-medusa/scripts/verify-ws-fanout.mjs` connects a WS client to instance **B** (:9001), records a ping through instance **A** (:9000), and asserts B's client receives it via Redis:

```bash
REDIS_URL=redis://localhost:6379 PORT=9000 pnpm --filter @orbit/backend-medusa exec tsx src/dev-server.ts &
REDIS_URL=redis://localhost:6379 PORT=9001 pnpm --filter @orbit/backend-medusa exec tsx src/dev-server.ts &
node apps/backend-medusa/scripts/verify-ws-fanout.mjs   # -> RESULT=SUCCESS
```
Before the Redis change a socket on :9001 would never see an event broadcast on :9000 — this is the proof horizontal scale works.

---

## Still recommended before true 10k production (not done here)
1. **Batch ping ingestion → Redis Stream → COPY consumer** (turns 500 writes/s into a few bulk COPYs/s). Needed for 50k+.
2. **Read replicas** for dashboards/reports + **materialized report rollups** (the `getRepActivity` fan-out join, audit H4).
3. **Redis-cached report summary** (audit M1).
4. **pgBouncer** (transaction pooling) in front of Postgres.
5. **Per-tenant rate quotas** + observability (DB pool saturation, WS conn count, ingestion lag).

Sequenced in `scalability-readiness-report.md` Part 9. Run the k6/Locust suites in `load-tests/` on real infra to produce the runtime break-point numbers.
