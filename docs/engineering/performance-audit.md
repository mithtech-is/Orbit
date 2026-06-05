# Performance Audit — Orbit Field Sales Platform

**Date:** 2026-05-29
**Method:** Static analysis of the actual codebase (no profiler run yet — see load-testing-plan.md to generate runtime numbers). Every finding cites `file:line`.
**Scope:** backend (`apps/backend-medusa`), web dashboard, mobile app, shared packages.

> Reading note: this is a *single-process Node HTTP scaffold* (`apps/backend-medusa/src/dev-server.ts`), not the Medusa runtime, and not a clustered deployment. Almost every "Critical" below stems from that one architectural fact plus a handful of fetch-all-then-filter queries and three unindexed tables.

---

## Severity summary

| # | Finding | Severity | Where |
|---|---------|----------|-------|
| C1 | DB pool capped at pg default **max=10** connections, no tuning | **Critical** | `db/client.ts:7-9` |
| C2 | WebSocket fan-out is in-process `Set`, no Redis pub/sub → cannot run >1 backend instance | **Critical** | `realtime/ws-gateway.ts:17,118-127` |
| C3 | `field_order`, `field_product`, `notification` tables have **zero indexes** → seq scans | **Critical** | `db/schema.sql:147-175` |
| C4 | Fetch-all-then-filter-in-app for rep-scoped reads (`/field-orders`, `/visits`, `/tracking`) | **Critical** | `field-orders/route.ts:22-23`, `tracking/route.ts:33-34` |
| C5 | `location_ping` grows unbounded; retention is row-by-row `DELETE`, not partitioned | **Critical** | `tracking/repository.ts:247-258`, `internal/jobs/retention-scheduler.ts` |
| C6 | Rep mobile poll pulls **whole org** session list every 30s (`listSessions`) | **Critical** | `tracking/route.ts:33`, `use-active-tracking.ts:133` |
| H1 | Mobile delta-sync works, but cursor columns are unindexed → filtered seq scans per pull | **Medium** | `sync/pull/route.ts:78-128`, `schema.sql` |
| H2 | Sync push processes mutations serially, ≥4 DB round-trips each, no batch txn | **High** | `sync/push/route.ts:65-137` |
| H3 | `audit_log` write on every mutation (incl. every ping batch, every sync row) | **High** | `sync/push/route.ts:116`, `dispatch.ts` |
| H4 | `getRepActivity` triple `LEFT JOIN` (visit×order×session) fans out before aggregation | **High** | `reports/repository.ts:52-73` |
| H5 | Rate limiter + retention scheduler are per-process in-memory → wrong under >1 instance | **High** | `http/rate-limit.ts:17`, `retention-scheduler.ts:12` |
| H6 | `broadcastEvent` re-`JSON.stringify`s the same payload once per subscriber | **High** | `ws-gateway.ts:123` |
| M1 | `getReportSummary` runs 6 `COUNT(*)` incl. unindexed `field_order` on dashboard load | **Medium** | `reports/repository.ts:13-32` |
| M2 | Local (mock) optimiser runs on the request event loop, O(n²) NN + 2-opt, no cache | **Medium** | `maps-provider/mock-provider.ts:48-170`, `route-planning/repository.ts:34-43` |
| M3 | `queryLatestPingsForActiveSessions` `DISTINCT ON (user_id)` not covered by any index | **Medium** | `tracking/repository.ts:81-99` |
| M4 | Medusa bridge is a synchronous in-request HTTP call when configured | **Medium** | `workflows/commerce/create-field-order.ts:54-84` |
| M5 | Body parser buffers entire request into memory, no size cap | **Medium** | `dev-server.ts:54-66` |
| L1 | JWT verified in-process on every request (CPU, not I/O) | **Low** | `auth/auth-middleware.ts` |
| L2 | No HTTP keep-alive/compression tuning; one Node process, no cluster | **Low** | `dev-server.ts:50-52` |
| L3 | Mobile re-renders: 60s home reload + 30s session poll + 20s heartbeat per rep | **Low** | `HomeScreen.tsx:184`, `use-active-tracking.ts:133-135` |

---

## CRITICAL

### C1 — Database connection pool capped at 10
```ts
// apps/backend-medusa/src/db/client.ts:5-13
export function getDatabasePool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://…/fieldsales"
    });   // ← no max, min, idleTimeoutMillis, connectionTimeoutMillis
  }
  return pool;
}
```
`node-postgres` defaults to **`max: 10`**. Every API handler grabs a pooled connection for the duration of its query. Several handlers issue **multiple sequential queries while holding a connection** — e.g. `createFieldOrderWithInventory` opens an explicit `client` with `BEGIN … FOR UPDATE … COMMIT` (`commerce/repository.ts:48-91`) and holds it across N product lookups.

**Consequence:** the *entire backend* can run at most 10 concurrent DB operations. The 11th waits in the pool queue. With ~20-50ms queries you cap at roughly **200-500 DB ops/sec per process** before queueing latency explodes. This is the first thing that breaks under load.

**Fix:** set `max` from env (start 20-40 per instance), add `idleTimeoutMillis`, `connectionTimeoutMillis`, and a statement timeout; size against Postgres `max_connections` and a pgBouncer in front for >2 instances. (Applied — see performance fixes section / migration.)

### C2 — WebSocket gateway is single-process, in-memory
```ts
// apps/backend-medusa/src/realtime/ws-gateway.ts:17
const subscribers = new Set<Subscriber>();
// :118-127
export function broadcastEvent(event: RealtimeEvent): number {
  for (const subscriber of subscribers) {            // iterate ALL sockets
    if (subscriber.socket.readyState !== OPEN) continue;
    if (!canSubscriberReceive(subscriber.context, event)) continue;
    subscriber.socket.send(JSON.stringify(event));   // re-serialize per socket
  }
}
```
The subscriber registry lives in a module-level `Set` in one Node process. A location ping recorded on **instance A** calls `broadcastEvent` against **A's `Set` only** — managers connected to **instance B never receive it**. There is **no Redis pub/sub, no fan-out bus**. This makes the live map silently wrong the moment you run more than one backend replica behind a load balancer.

It also bounds vertical scale: a single Node process terminating thousands of WS connections + serializing JSON per broadcast is CPU-bound on the main thread.

**Fix path:** publish events to Redis (`PUBLISH org:{id}:tracking …`); each instance subscribes and fans out to *its* local sockets only. Pre-serialize the JSON once per event, not per subscriber (see H6).

### C3 — Three hot tables have no indexes
From `db/schema.sql`:
- `field_order` (`:156-165`) — **no index at all**. `listFieldOrders` does `WHERE organisation_id = $1 ORDER BY created_at DESC` (`commerce/repository.ts:17-22`) → **sequential scan + in-memory sort** of the whole table on every Orders page load and every rep order list.
- `field_product` (`:147-154`) — **no index**. Product catalog + the `FOR UPDATE` lookup in order creation (`commerce/repository.ts:54-58`) scan by `(id, organisation_id)`. PK is `id` only, so the tenant filter is unindexed.
- `notification` (`:167-175`) — **no index** on `(organisation_id, user_id)`.

**Consequence:** these degrade linearly with table size. At 1M `field_order` rows a tenant-filtered seq-scan+sort is hundreds of ms and holds a pool connection (compounds C1).

**Fix:** add the indexes (migration `1700000000001`):
```sql
CREATE INDEX field_order_tenant_created_idx ON field_order (organisation_id, created_at DESC);
CREATE INDEX field_order_rep_idx           ON field_order (organisation_id, rep_user_id, created_at DESC);
CREATE INDEX field_product_tenant_idx      ON field_product (organisation_id);
CREATE INDEX notification_user_idx         ON notification (organisation_id, user_id, created_at DESC);
```

### C4 — Fetch-all-then-filter-in-app (rep scoping done in JS, not SQL)
```ts
// apps/backend-medusa/src/api/v1/field-orders/route.ts:22-23
const rows = await listFieldOrders(actor.organisationId);          // WHOLE org
const filtered = canSeeAll ? rows : rows.filter(r => r.rep_user_id === actor.userId);
```
Same shape in `tracking/route.ts:33-34` (`querySessionsToday(org)` then `.filter(s => s.user_id === actor.userId)`). A single rep requesting their own orders/sessions causes the server to **load every order/session in the organisation into memory**, then discard 99% of it. This is both a CPU/memory tax and an amplifier of C1/C3.

**Fix:** push the predicate into SQL — `listFieldOrdersForRep(org, userId)`, `queryActiveSessionsForUser(org, userId)` — so reps read O(their rows) not O(org rows). (Applied for field-orders + tracking; see fixes section.)

### C5 — `location_ping` unbounded, DELETE-based retention
`location_ping` (`schema.sql:217-227`) is the highest-volume table. Retention is a per-tenant `DELETE … WHERE recorded_at < now() - interval` (`tracking/repository.ts:247-258`) fired every 6h in-process (`retention-scheduler.ts:4`).

**Volume math (evidence-grounded from the ping cadence):** `use-active-tracking.ts` emits a ping every `intervalSeconds` (default 20s) plus a heartbeat. At a sustained workday that is ~`8h × 3600 / 20 ≈ 1,440 pings/rep/day`.
- 1,000 active reps → **1.44M rows/day**
- 10,000 → **14.4M/day**
- 100,000 → **144M/day**

A single big `DELETE` of tens of millions of rows every 6h causes table bloat, autovacuum pressure, lock contention, and WAL spikes — it will not keep up at the upper tiers.

**Fix path:** convert `location_ping` to a **time-partitioned table** (daily/weekly `PARTITION BY RANGE (recorded_at)`); retention becomes `DROP PARTITION` (instant, no bloat). Consider down-sampling old pings.

### C6 — Rep poll pulls the whole org's session list every 30s
`use-active-tracking.ts:63` calls `apiClient.listSessions()` every 30s (`:133`). That endpoint (`tracking/route.ts:32-34`) returns `querySessionsToday(organisationId)` — **all sessions in the org today** — then the *client* finds its own. So in a 1,000-rep org, **every rep downloads a ~1,000-row payload every 30s** and the DB does a full `work_session` scan per poll.

- Request rate: `reps / 30s`. 10,000 reps → ~333 req/s, each returning the entire org session set.
- DB cost: `reps/30s` full-ish scans of `work_session`.
- Egress: O(reps²) rows transferred org-wide per 30s window.

**Fix:** the mobile poller only needs *its own* active session — add a rep-scoped query and have the client call that. (Applied — `queryActiveSessionsForUser` + SQL filter in tracking GET.)

---

## HIGH

### H1 — Delta sync exists, but its cursor columns are unindexed *(corrected — earlier draft wrongly called this a full snapshot)*
`sync/pull/route.ts` **is** a cursor-based delta pull: per-resource, `WHERE … created_at > $since … ORDER BY _cursor ASC LIMIT 500`, writing the new cursor back to `sync_cursor` (`:45-58, 78-128`). That's the right design. **The problem is the index coverage:** the delta predicates filter/sort on columns that have **no supporting index**:
- `outlet.created_at`, `lead.created_at`, `route_plan.created_at` — none are indexed (the existing indexes are on `(organisation_id, status)` / `(organisation_id)` etc., `schema.sql:72,96-97`). `route_plan` has `(organisation_id, route_date DESC, created_at DESC)` which *partially* helps.
- `visit` uses a **computed cursor** `COALESCE(checked_out_at, checked_in_at, visit_date::timestamptz)` (`:84,87`) — an expression that **cannot use a plain column index** at all without a matching expression index.

So each delta pull does a tenant-filtered **seq scan + sort** of the resource table. Cheap now, linear with table growth.
**Fix path:** add `(organisation_id, created_at)` indexes on `outlet`/`lead`; add an **expression index** for the visit cursor, or add a real `updated_at` column maintained by a trigger and index that. (Lower priority than the C-items because LIMIT 500 + delta keeps payloads small.)

### H2 — Serial sync-push with ≥4 round-trips per mutation
`sync/push/route.ts:65-137` loops mutations **sequentially**; each iteration does `findMutationByKey` (1 query) → `dispatchMutation` (1+ queries; `order.create` adds a transaction + optional Medusa HTTP) → `recordMutation` (1) → `writeAuditLog` (1). A 50-mutation offline backlog = **200+ sequential round-trips on one held connection**. Under C1's 10-connection cap, two reps syncing large backlogs can saturate the pool.
**Fix path:** wrap each mutation in its own txn, pipeline independent reads, and consider a single multi-row `recordMutation`/audit insert.

### H3 — Audit-log write amplification
`writeAuditLog` is called per sync mutation (`sync/push/route.ts:116`), per order event (`dispatch.ts:83`), per CRUD. `audit_log` is indexed for reads (`audit_log_tenant_time_idx`) but every write is an extra INSERT in the request path. At the ping/sync volumes above this doubles write load on the busiest paths.
**Fix path:** batch audit writes, or move to an async append (Redis stream / queue consumer) off the request path.

### H4 — `getRepActivity` fan-out join
```sql
-- reports/repository.ts:60-72
FROM app_user u
LEFT JOIN visit v       ON v.assigned_user_id = u.id …
LEFT JOIN field_order o ON o.rep_user_id      = u.id …
LEFT JOIN work_session ws ON ws.user_id       = u.id …
GROUP BY u.id, u.name
```
Three independent one-to-many joins on the same driving row produce a **cartesian intermediate** (visits × orders × sessions per rep) before `COUNT(DISTINCT)` collapses it. Correct, but the intermediate row count explodes for active reps. `field_order` join is also unindexed (C3).
**Fix path:** pre-aggregate each side in subqueries/CTEs, then join the scalars; add the `field_order` rep index.

### H5 — Per-process rate limiter & retention scheduler
`http/rate-limit.ts:17` keeps counters in a process-local `Map` (its comment admits "for multi-instance you'd move the counter to Redis"). `retention-scheduler.ts:12` runs `setInterval` in *every* process (comment: "use leader-election or external cron"). With >1 instance, rate limits are N× too loose and the sweep runs N× concurrently.
**Fix path:** Redis token bucket; move retention to a single cron/worker.

### H6 — Per-subscriber re-serialization
`ws-gateway.ts:123` calls `JSON.stringify(event)` inside the subscriber loop. The payload is identical for every recipient — serialize once before the loop. Cheap fix, meaningful at high connection counts.

---

## MEDIUM

- **M1 `getReportSummary`** (`reports/repository.ts:13-32`) fires 6 `COUNT(*)` in parallel on dashboard load; the `field_order` and `visit`-today counts touch unindexed/partially-indexed paths. Cache for ~30-60s.
- **M2 Local optimiser on the event loop** — the provider is selected from env (`route-planning/repository.ts:34-43`, `createMapsProvider({ provider: MAP_PROVIDER ?? "mock", … })`) and built once as a module singleton (`:43`). **Correction to an earlier draft:** the real Mapbox/Google/OSRM providers *are* wired behind `MAP_PROVIDER` + credentials — it is **not** mock-only; mock is just the default. The event-loop concern applies only to the **mock/local** optimiser (`mock-provider.ts:48-170`): O(n²) nearest-neighbour + 2-opt (O(n²)-per-pass budget), run synchronously on the Node main thread, no result cache. Fine ≤30 stops (sub-ms–ms); blocks the loop for large stop sets. Real providers are network I/O (off-thread) but add latency + cost per call → cache results. **Default deployments run mock**, so most installs get great-circle distances, not road distances.
- **M3** `queryLatestPingsForActiveSessions` (`tracking/repository.ts:81-99`) does `DISTINCT ON (user_id) … ORDER BY user_id, recorded_at DESC`; the only ping index is `(organisation_id, work_session_id, recorded_at)` — it does **not** cover this, forcing a sort. Add `(organisation_id, user_id, recorded_at DESC)`.
- **M4** Medusa bridge (`create-field-order.ts:54-84`) is a synchronous `fetch` inside the order request when configured; a slow Medusa adds latency directly to the rep's order. It's correctly wrapped best-effort (errors swallowed) and **off by default** (needs `MEDUSA_BRIDGE_REGION_ID`), but when on it should be queued, not inline.
- **M5** `parseBody` (`dev-server.ts:54-66`) concatenates the whole request body into memory with **no size limit** — a large CSV import or malicious payload can pressure memory. Add a max-bytes guard.

## LOW

- **L1** JWT verified in-process per request (`auth-middleware.ts`) — CPU cost only, fine until very high RPS.
- **L2** Single Node process, no `cluster`/worker threads, no gzip/br — one core ceiling.
- **L3** Mobile timers per rep: 60s home reload (`HomeScreen.tsx:184`), 30s session poll + 20s heartbeat (`use-active-tracking.ts:133-135`). Battery/render minor; the *network* effect of the 30s poll is C6.

---

## Quick-win remediation order (highest value / lowest risk first)
1. **Add the missing indexes** (C3, M3) — pure migration, no code risk.
2. **SQL-scope rep reads** (C4, C6) — bounded, big memory/CPU win.
3. **Tune the pg pool from env** (C1).
4. **Pre-serialize WS payload** (H6) — one-line.
5. **Cache report summary** (M1).
6. Then the structural items: **Redis WS pub/sub (C2), partition `location_ping` (C5), delta sync (H1), Redis rate-limit + cron retention (H5).** These are required before 10k+.

Runtime numbers to confirm these statically-derived findings: run the suites in `load-testing-plan.md`.
