# Scale / Load / Reliability / Feature Audit — Index (2026-05-29)

This audit answers one question: **can Orbit survive real customer scale?** Short answer: **excellent business logic, scaling not yet built — runs a 100-user pilot today, ~1,000 with the quick wins applied here, needs structural work (Redis pub/sub, ping partitioning, horizontal API) before 10k.**

## Deliverables
| Part | Document |
|---|---|
| 1 + 9 | Per-tier scalability + CTO answers → [`scalability-readiness-report.md`](./scalability-readiness-report.md) |
| 2 | Load-test plan → [`load-testing-plan.md`](./load-testing-plan.md) + runnable scripts in [`load-tests/`](./load-tests/) (k6 + Locust) |
| 3 | Performance risks (ranked C/H/M/L) → [`performance-audit.md`](./performance-audit.md) |
| 4 | Feature completeness per module → [`feature-completeness-audit.md`](./feature-completeness-audit.md) |
| 5 | Button verification → [`button-verification-report.md`](./button-verification-report.md) |
| 6 | Fixes applied → this file, "What was fixed" |
| 7 | Competitive gap analysis → [`../product/competitive-gap-analysis.md`](../product/competitive-gap-analysis.md) |
| 8 | Top 20 high-impact features → [`../product/high-impact-features.md`](../product/high-impact-features.md) |

## What was fixed in this pass (Part 6) — backend tests 49/49 green, web + backend typecheck clean, verified live
1. **7 performance indexes** added to `db/schema.sql` + migration `1700000000001_perf-indexes.sql` and **applied to the live DB** (C3/M3/H1). Verified via `EXPLAIN`: `field_order_rep_idx` (Index Scan) and `location_ping_user_idx` (Index Only Scan) are now used — no seq scan/sort.
2. **Rep reads scoped in SQL, not JS** — `/field-orders` and `/tracking` (C4/C6). Verified live: manager `repScoped=false count=8`, rep `repScoped=true count=2`; rep `/tracking` returns only their own sessions instead of the whole org.
3. **DB pool tuned from env** — `DB_POOL_MAX` (default 20, was hard-capped at 10), plus idle/connection timeouts (C1).
4. **WebSocket payload serialized once per event**, not once per subscriber (H6).
5. **Orders → Create order** button now has an in-flight guard (`submitting`) — the one genuinely PARTIAL control.
6. Button-audit false positive corrected: Tracking → Stop session was already correctly wired (shared `busy` state).

## Honest corrections made during the audit (evidence beat assumptions)
- **Route optimisation is NOT mock-only** — it's pluggable via `MAP_PROVIDER` (mapbox/google/osrm wired in `route-planning/repository.ts:142-160`); mock is just the default.
- **Sync pull IS delta/cursor-based**, not a full snapshot (`sync/pull/route.ts`). The real issue is unindexed cursor columns.
- **Notifications** is a bare module stub (`listTenantModules()` only) — no persist/dispatch/API.
- A sub-agent's claims of backend `optimizer.ts`/`osrm-client.ts` files and a "missing" `notification/service.ts` were **false** and were not relied upon.

## Top structural work still required (not done here — needs infra decisions)
- **Redis pub/sub for WebSocket** (C2) — required to run >1 backend instance; unlocks 10k.
- **Partition `location_ping`** + DROP-partition retention (C5) — required for sustained ping ingestion.
- **Horizontal API + pgBouncer**, **Redis rate-limit + single-runner retention** (H5), **queue-based ping ingestion** for 50k–100k.
- **Real notification delivery**, **default a real route provider**, **server-side pagination**.
