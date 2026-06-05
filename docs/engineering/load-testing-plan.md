# Load Testing Plan — Orbit

**Date:** 2026-05-29
**Goal:** Turn the *static* findings in `performance-audit.md` into *measured* numbers, and find the exact RPS/connection count where each subsystem breaks.
**Targets under test:** Orbit backend `:9000` (HTTP + `ws://…/ws/tracking`), Postgres `:15432`, optionally Medusa `:9100`.

> The runnable scripts live in `docs/engineering/load-tests/`. They are parameterised by env vars so you can point them at local or staging. Start gentle — the current single-instance + pool-of-10 will show queueing fast (that's the point).

---

## 0. Pre-flight

1. Seed a realistic dataset (not the 8-user demo). Suggested fixture sizes per tier:
   | Tier | reps | outlets | leads | field_orders | location_ping |
   |---|---|---|---|---|---|
   | small | 100 | 2k | 5k | 10k | 1M |
   | medium | 1,000 | 20k | 50k | 200k | 30M |
   | large | 10,000 | 100k | 250k | 2M | 300M |
2. Capture baselines while idle: `pg_stat_activity` count, `pg_stat_database` xact rate, backend RSS, WS `subscriberCount()`.
3. Metrics to watch during every run:
   - **DB pool saturation** — connections waiting (the pool-of-10 is the prime suspect, `db/client.ts:7`).
   - **p50/p95/p99 latency** per endpoint.
   - **Error rate** (429 from `http/rate-limit.ts`, 500s, WS disconnects).
   - **Postgres**: slow-query log, seq-scan counts on `field_order`/`field_product` (`pg_stat_user_tables`).
   - **Node**: event-loop lag, RSS (watch the unbounded body parser M5 + WS `Set`).

---

## 1. Tooling

- **k6** (Grafana) — HTTP + WS, scriptable thresholds. Primary tool. `docs/engineering/load-tests/k6/`.
- **Locust** (Python) — user-journey modelling, nice for the "realistic rep day" mix. `docs/engineering/load-tests/locust/`.
- Use k6 for raw throughput/break-point; Locust for behavioural mixes and stakeholder-readable charts.

Install: `winget install k6` / `choco install k6`; `pip install locust`.

---

## 2. Scenarios → break-point hypotheses

| # | Scenario | Script | Hypothesised first failure (from audit) |
|---|---|---|---|
| 2.1 | Auth storm | `k6/auth.js` | login bucket 10/min/IP (`rate-limit.ts:22`) → 429s; then bcrypt CPU |
| 2.2 | Dashboard read mix | `k6/dashboard-read.js` | unindexed `field_order` seq-scan (C3) + pool-of-10 (C1) ~1k VUs |
| 2.3 | Tracking ingestion | `k6/tracking-ingest.js` | pool + per-ping audit + WS fan-out; ~500 writes/s = 10k reps (C5) |
| 2.4 | WebSocket fan-out | `k6/ws-fanout.js` | one-process `Set`, per-socket JSON (C2/H6) — CPU climbs ~few-k sockets |
| 2.5 | Order creation | `k6/orders.js` | `FOR UPDATE` contention on hot products + pool; Medusa inline if on (M4) |
| 2.6 | Route preview | `k6/route-preview.js` | event-loop block for large stop sets (M2) |
| 2.7 | Sync engine | `k6/sync.js` | serial push ≥4 round-trips/mutation (H2); full-snapshot pull bytes (H1) |
| 2.8 | Realistic rep day | `locust/locustfile.py` | combined — whole-org session poll (C6) dominates at ~1k reps |

Recommended ramp for each: stages `0→50→200→500→1000→2000` VUs, 2 min each, with thresholds `http_req_failed<1%` and `http_req_duration p95<800ms`. The stage where a threshold breaks **is** the break-point — record it against the hypothesis.

---

## 3. What to record (report template)

For each scenario produce:
```
scenario, tier, VUs_at_break, p95_at_break_ms, error_rate_at_break,
db_connections_waiting, top_slow_query, node_eventloop_lag_ms, notes
```
Then map each break-point back to a performance-audit finding ID (C1…L3) to confirm or refute it.

---

## 4. Acceptance gates (what "ready for tier N" means)

- **1,000 users:** 2.2 + 2.8 sustain p95 < 800ms, errors < 1% for 15 min after quick-wins applied.
- **10,000 users:** 2.3 sustains 500 writes/s with ingestion lag < 5s; 2.4 holds 10k sockets across ≥2 instances with **zero missed broadcasts** (requires Redis pub/sub — until then this gate *cannot* pass, by design, proving C2).
- **100,000 users:** only meaningful after the streaming-ingestion topology (see scalability-readiness-report Part 9).

---

## 5. Running

```bash
# env shared by all scripts
export BASE_URL=http://localhost:9000
export WS_URL=ws://localhost:9000/ws/tracking
export ORG_ID=mithtech
export REP_EMAIL=rep1@acme-fieldsales.test
export MANAGER_EMAIL=manager@acme-fieldsales.test
export PASSWORD=admin123

# k6
k6 run docs/engineering/load-tests/k6/dashboard-read.js
k6 run --vus 500 --duration 2m docs/engineering/load-tests/k6/tracking-ingest.js
k6 run docs/engineering/load-tests/k6/ws-fanout.js

# Locust (web UI on :8089)
cd docs/engineering/load-tests/locust && locust
```

See each script header for scenario-specific env vars. Scripts log in once per VU, reuse the JWT, and (for ingestion) start a work session + record consent first so pings are accepted by `tracking/route.ts`.
