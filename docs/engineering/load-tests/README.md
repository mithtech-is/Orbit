# Orbit Load Tests

Runnable scripts referenced by `../load-testing-plan.md`. Each maps to a scenario
and a hypothesised break-point from `../performance-audit.md`.

## Prereqs
- A running backend (`:9000`) + Postgres seeded beyond the 8-user demo (see plan §0).
- `k6` (https://k6.io) and/or `locust` (`pip install locust`).

## Env (shared)
```
export BASE_URL=http://localhost:9000
export WS_URL=ws://localhost:9000/ws/tracking
export ORG_ID=mithtech
export REP_EMAIL=rep1@acme-fieldsales.test
export MANAGER_EMAIL=manager@acme-fieldsales.test
export PASSWORD=admin123
```

## k6 scripts (`k6/`)
| File | Scenario | Tests |
|---|---|---|
| `auth.js` | 2.1 | login limiter + bcrypt CPU |
| `dashboard-read.js` | 2.2 | manager read mix (C1/C3) |
| `tracking-ingest.js` | 2.3 | ping write path (C5/H3) |
| `ws-fanout.js` | 2.4 | WS connections + fan-out (C2/H6) |
| `orders-and-sync.js` | 2.5+2.7 | order contention + sync (H1/H2/M4) |
| `route-preview.js` | 2.6 | optimiser on event loop (M2) |
| `lib.js` | — | shared login/session helpers |

```
k6 run k6/dashboard-read.js
STOP_COUNT=250 k6 run k6/route-preview.js
```

## Locust (`locust/`)
```
cd locust && locust   # UI at http://localhost:8089
```
`locustfile.py` models a realistic rep day (ping/poll/today/order) + a manager
dashboard mix, and fails if rep-day p95 > 800ms.

## Reading results
Record, per scenario: VUs at first threshold breach, p95 there, error rate,
DB connections waiting, top slow query, Node event-loop lag. Map each back to a
finding ID (C1…L3) to confirm/refute the static audit.
