# Scalability Readiness Report (CTO view) — Orbit

**Date:** 2026-05-29
**Author:** Engineering audit (evidence-based; every claim traces to code in `apps/`, `packages/`, `db/schema.sql`).
**Bottom line up front:** Orbit is an excellent **pilot / single-tenant-at-a-time** system. As deployed today (one Node process, in-memory WS + rate-limit, pg pool of 10, three unindexed hot tables, whole-org rep reads) it **does not survive multi-thousand concurrent users without specific, known fixes**. The good news: the bottlenecks are concentrated and fixable, not architectural rot. (Two things are *better* than a first pass suggested: mobile sync is genuinely **delta/cursor-based**, and route optimisation is **pluggable** with real Mapbox/Google/OSRM behind an env flag — see corrections in `performance-audit.md`.)

This report covers **Part 1 (per-tier scalability)** and **Part 9 (CTO questions)**. Evidence detail lives in `performance-audit.md`.

---

## PART 1 — Per-tier scalability verdicts

The single biggest constraint is the deployment model: **one Node HTTP process** (`dev-server.ts:50-52`, `attachWsGateway` on the same server) with a **pg pool capped at 10** (`db/client.ts:7`). Several reads also **fetch the whole org then filter in JS** (`field-orders/route.ts:22-23`, `tracking/route.ts:33-34`). Numbers below assume the current single instance unless stated.

### 100 concurrent users — ✅ Works today
- **Backend:** fine. Even with the 10-connection pool, 100 users at human pace (a few req/min each) stay well under ~200-500 DB ops/s.
- **Database:** fine. Org-scoped tables are small; seq scans on `field_order`/`field_product` are cheap at low row counts.
- **Redis:** not actually on the hot path yet (rate-limit + WS are in-memory). No bottleneck.
- **WebSocket:** fine — one process easily holds 100 sockets; broadcast O(100) per ping is trivial.
- **Mobile sync:** the 30s whole-org `listSessions` poll (C6) returns ~100 rows — negligible.
- **Route planner:** ≤30-stop mock optimise is sub-millisecond.
- **Medusa:** off by default; if on, ~100 orders/day is nothing.
- **Browser/dashboard:** fine.
- **Verdict:** production-usable for a single pilot org of ~100.

### 1,000 concurrent users — ⚠️ Degrades; needs the quick wins
- **Fails first at the DB pool + fetch-all reads.** With 1,000 reps, the 30s `listSessions` poll alone is ~33 req/s, **each returning a ~1,000-row org-wide payload and doing a full `work_session` scan** (C6). Combined with unindexed `field_order` seq-scans (C3) and the 10-connection ceiling (C1), p95 latency climbs and the pool starts queueing.
- **WebSocket:** one process can hold ~1,000 sockets, but every ping broadcast is O(1,000) with a per-socket `JSON.stringify` (H6) — CPU on the main thread becomes visible.
- **Sync:** delta `sync/pull` (cursor + LIMIT 500) keeps payloads small, but its cursor columns are unindexed (H1) so each pull seq-scans — fine at 1k, watch as tables grow.
- **Verdict:** **fails at ~1,000 because of the 10-connection pool + whole-org polling/seq-scans.** Add indexes (C3), SQL-scope reads (C4/C6), raise the pool (C1), pre-serialize WS (H6) → comfortably handles 1,000 on one beefy instance.

### 10,000 concurrent users — ❌ Fails without structural changes
- **Fails at the single process + in-memory WS.** Tracking ingestion alone: 10,000 reps × 1 ping / 20s = **~500 writes/s** into `location_ping`, each currently followed by an O(connections) broadcast and (via sync path) an audit insert (H3). One Node process + a 10-conn pool cannot absorb this.
- **WebSocket (C2) is now a hard wall:** to handle 10k sockets you must run multiple instances, but the gateway's in-memory `Set` means **events broadcast on instance A never reach instance B's clients**. The live map breaks the moment you scale out. Requires Redis pub/sub.
- **`location_ping` (C5):** ~14M rows/day; the 6-hourly bulk `DELETE` retention causes bloat/lock pressure. Requires partitioning.
- **Rate-limit/retention (H5):** per-process state is now wrong across instances.
- **Verdict:** **fails at ~10,000 because of single-process WS fan-out, the 10-conn pool, unpartitioned ping ingestion, and per-process limiter state.** Needs: horizontal backend + pgBouncer, Redis WS pub/sub, partitioned `location_ping`, Redis rate-limit, delta sync.

### 50,000 concurrent users — ❌ Not close today
- Ping ingestion ~2,500 writes/s; sync-pull bandwidth and serial sync-push (H2) dominate. Requires a dedicated **ingestion pipeline** (batch endpoint → queue → COPY into partitioned table), read replicas for dashboards/reports, and a connection-pooled, horizontally-scaled API tier.
- The reports fan-out join (H4) and `getReportSummary` COUNTs (M1) must move to pre-aggregated/materialized views or a read replica.
- **Verdict:** needs the 10k fixes **plus** queue-based ingestion, read replicas, and caching.

### 100,000 concurrent users — ❌ Requires a different operational topology
- ~**5,000 ping writes/s** sustained, bursts higher. This is a streaming-ingestion problem, not a CRUD problem.
- **Verdict:** achievable only with: stateless API behind autoscaling + pgBouncer; Kafka/Redis-stream ping ingestion with batched COPY into time-partitioned (or Timescale/Citus) storage; Redis-cluster pub/sub for WS sharded by org; read replicas + materialized report rollups; CDN for the dashboard; per-tenant rate limiting in Redis. See infrastructure section in Part 9.

---

## Bottleneck-by-subsystem (applies across tiers)

| Subsystem | Breaks at ~ | Root cause (evidence) | Fix |
|---|---|---|---|
| **Backend process** | 1k–10k | single Node proc, pool max 10 (`db/client.ts:7`) | cluster/replicas + pgBouncer + tuned pool |
| **Database** | 1k+ | unindexed `field_order`/`field_product`/`notification` (`schema.sql:147-175`); fetch-all reads (C4) | indexes + SQL scoping + read replicas |
| **Redis** | n/a yet | not used on hot path; *absence* is the problem for WS/limiter | introduce Redis pub/sub + token bucket |
| **WebSocket** | 10k | in-memory `Set`, no cross-instance fan-out (`ws-gateway.ts:17`) | Redis pub/sub, pre-serialize (H6) |
| **Mobile sync** | 1k–10k | delta pull w/ unindexed cursors (H1), serial push (H2), whole-org poll (C6) | index cursors, batch push, scoped poll |
| **Route planner** | 50k (or large stop sets) | mock optimiser on event loop; default is mock (`route-planning/repository.ts:34-43`) | use real provider via MAP_PROVIDER; cache |
| **Medusa** | order-rate dependent | inline bridge `fetch` when enabled (`create-field-order.ts:54`) | queue the bridge write |
| **Browser/dashboard** | 10k orgs of data | unbounded lists (no pagination) on visits/orders | server pagination + virtualized tables |

---

## PART 9 — CTO questions, answered

**1. Can 100 users use this today?** **Yes.** Single instance handles a 100-user pilot org with current code. Verified paths: auth, visits, orders, tracking, live map, routes all hit real DB tables.

**2. Can 1,000 users use this today?** **Not reliably.** It will run but p95 latency degrades and the pool queues, primarily from the whole-org 30s session poll (C6), unindexed order/product scans (C3), and the 10-connection cap (C1). **With the four quick wins (indexes, SQL-scoped reads, pool tuning, WS pre-serialize) — yes, on one large instance.**

**3. Can 10,000 users use this today?** **No.** Hard blockers: single-process in-memory WebSocket fan-out (C2), unpartitioned ping ingestion at ~500 writes/s (C5), per-process rate-limit/retention (H5). Requires the structural changes below.

**4. Can 100,000 users use this today?** **No.** Needs a different topology: streaming ping ingestion, horizontal stateless API + pgBouncer, Redis pub/sub WS, read replicas, materialized report rollups.

**5. What breaks first?** In order: (a) the **pg pool of 10** + **whole-org rep reads/polls** around ~1k; (b) the **single-process WebSocket** the moment you add a second instance; (c) **`location_ping` ingestion/retention** around ~10k.

**6. What must be fixed before scale?**
- *Before 1k:* indexes (C3, M3); SQL-scope `/field-orders`, `/visits`, `/tracking` and the mobile session poll (C4, C6); pg pool `max` from env (C1); pre-serialize WS payload (H6); cache report summary (M1). **(Quick wins applied in this pass — see fixes.)**
- *Before 10k:* Redis WS pub/sub (C2); partition `location_ping` + DROP-partition retention (C5); Redis rate-limit + single-runner retention (H5); horizontal API + pgBouncer; index the delta-sync cursor columns (H1).
- *Before 100k:* queue-based batched ping ingestion; read replicas + materialized report views; per-tenant Redis quotas; CDN; shard WS by org.

**7. Infrastructure for 100k users (target topology):**
- **API:** stateless backend in an autoscaling group / K8s HPA (start ~8–16 pods), **pgBouncer** (transaction pooling) in front of Postgres.
- **Postgres:** primary + ≥2 read replicas; `location_ping` time-partitioned (or TimescaleDB/Citus); reports served from replicas + materialized rollups.
- **Ingestion:** mobile → batch ping endpoint → **Redis Streams / Kafka** → consumer does batched `COPY` into the partitioned table; WS broadcast driven off the same stream.
- **Realtime:** Redis (cluster) pub/sub; WS terminators sharded by org; pre-serialized payloads.
- **Cache:** Redis for report summaries, org settings, rate-limit token buckets.
- **Edge:** CDN for the Next.js dashboard; gzip/br.
- **Observability:** the Sentry hook (`http/sentry.ts`) + request logger already exist — add metrics (DB pool saturation, WS conn count, ping write lag) and dashboards.

**8. Strongest modules (most production-ready):**
- **Auth + RBAC** — real bcrypt, JWT, two-tier tenant scoping enforced at every endpoint (`auth/tenant-auth.ts`, gates in every route).
- **Orders/inventory** — atomic `BEGIN … FOR UPDATE … COMMIT` prevents oversell (`commerce/repository.ts:48-91`).
- **Offline sync correctness** — 3-layer idempotency (idempotency key + `mutation_record` PK + PG dup fallback) is genuinely robust (`sync/push/route.ts`, `dispatch.ts:108`).
- **Audit logging** — comprehensive and indexed for reads.

**9. Weakest modules:**
- **Realtime tracking at scale** — correct logic, unscalable transport (C2/C5/C6).
- **Notifications** — a bare Medusa-module stub class (`notification/service.ts` only returns a static `listTenantModules()` list); **no persistence, no dispatch, no API route** (absent from `dev-server.ts`). Effectively non-functional.
- **ERP** — interface + no-op stub only; `registerErpProvider` never called in product code (`integrations/erp-provider.ts:137-145`).
- **Route optimisation quality** — *wiring is fine* (pluggable via `MAP_PROVIDER`, `route-planning/repository.ts:34-43`), but **default installs run the mock** = great-circle distances, not real road/traffic routing. Ship a real provider for production.
- **Sync efficiency** — delta + idempotent (good), but serial push (H2) and unindexed cursors (H1).

**10. What to build next (engineering, before features):**
1. Quick-win perf pass (done this round: indexes + SQL scoping + pool tuning + WS pre-serialize).
2. Redis WS pub/sub + partitioned `location_ping` (unlocks 10k).
3. Index the delta-sync cursor columns + add a maintained `updated_at` (delta exists; make it index-backed).
4. Default a real route provider for production (`MAP_PROVIDER=osrm` self-hosted is free) — the seam already exists.
5. Real notification delivery (FCM/OneSignal) + a `/notifications` API (currently a bare stub).
6. Server-side pagination on all list endpoints.

---

## Honest one-paragraph summary
Orbit's **business logic and data integrity are solid** (auth, RBAC, transactional orders, idempotent **delta** sync, audit trail, pluggable route provider). Its **scaling story is not built yet**: it is a single-process scaffold with in-memory realtime and rate-limiting, a 10-connection pool, three unindexed hot tables, and whole-org rep reads. It will comfortably run a **100-user pilot today**, can be pushed to **~1,000 with the quick wins applied in this pass**, and needs **deliberate infrastructure work (Redis pub/sub, ping partitioning, horizontal API + pgBouncer)** before 10k — and a streaming-ingestion topology before 100k. Notifications and ERP are stubs; route optimisation defaults to mock distances. Nothing here is a rewrite; it's a prioritized hardening backlog.
