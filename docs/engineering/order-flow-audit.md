# Order flow audit — current state (pre-Medusa-bridge)

**Date:** 2026-05-28
**Method:** Traced every codepath from UI submit → backend handler → workflow → repository → DB write, plus inspected DB schema and the Medusa-side state.

## TL;DR

**Orders today never touch Medusa.** They live entirely in a custom `field_order` PG table in the **`fieldsales` database**. The Medusa runtime serves Medusa's own admin against a *separate* `medusa` database that has its own (empty) `order` / `cart` / `product` tables. The two systems share nothing.

That's why orders do not appear in `:9001/app/orders` — Medusa literally has no rows.

---

## Current end-to-end trace

### 1. UI submit
[apps/web-dashboard/app/field-orders/page.tsx:54](apps/web-dashboard/app/field-orders/page.tsx:54) → `apiClient.createFieldOrder({ outletId, source: "online", lines: [{ productId, quantity }] })`

The mobile app **has no order capture screen** today — see button-action-audit.md. Reps cannot create orders from mobile.

### 2. API route
[apps/backend-medusa/src/api/v1/field-orders/route.ts:29](apps/backend-medusa/src/api/v1/field-orders/route.ts:29) `POST /api/v1/field-orders`

- `authenticateRequest` (JWT) ✅
- `requireTenantPermission(actor, { organisationId, ownerUserId: actor.userId }, "order:create")` ✅
- Validates `outletId` + at least one positive-quantity line ✅
- Calls `runCreateFieldOrderWorkflow(...)` ✅
- On success: writes audit row via the workflow's `emit` hook ✅
- Returns `{ id, outletId, repUserId, source, status, totalCents, provider: "field_order_pg" }`

**Note the `provider: "field_order_pg"` literal** — even the type system admits Medusa is not involved. The other allowed value `"medusa_cart_order"` is defined but never set anywhere in the codebase.

### 3. Workflow seam
[apps/backend-medusa/src/workflows/commerce/create-field-order.ts](apps/backend-medusa/src/workflows/commerce/create-field-order.ts)

`runCreateFieldOrderWorkflow` is a thin wrapper that:
- Lazy-requires `createFieldOrder` from `commerce/repository.ts` (lazy because Medusa's workflow loader uses ts-node CJS — see [final-go-no-go-report.md])
- Calls it
- Emits a `field_order.created` event (consumed only by the audit-log writer in the route)
- Returns `{ id, status, totalCents, provider: "field_order_pg" }`

The file's own docstring (lines 9–15) acknowledges this is a temporary seam:
> *"Once the Medusa native cart/order modules are wired into the runtime, only the implementation behind `runCreateFieldOrderWorkflow` needs to change."*

That cutover is the work this Phase 3 begins.

### 4. Repository
[apps/backend-medusa/src/modules/commerce/repository.ts:66](apps/backend-medusa/src/modules/commerce/repository.ts:66) `createFieldOrder`

Inside one PG transaction:
1. `SELECT FOR UPDATE` on `field_product` rows for the requested productIds (locks them).
2. Validates each line has matching product, positive quantity, and sufficient `inventory_available`.
3. Sums `unit_price_cents * quantity` for total.
4. `UPDATE field_product SET inventory_available = inventory_available - quantity` per line.
5. `INSERT INTO field_order (id, organisation_id, outlet_id, rep_user_id, status='accepted', source, total_cents)` — **header only**.
6. Commits.

### 5. Storage

```
fieldsales=> \d field_order
 id              | text                     | PK
 organisation_id | text                     | FK → organisation
 outlet_id       | text                     | FK → outlet
 rep_user_id     | text                     | FK → app_user
 status          | text                     |
 source          | text                     |
 total_cents     | integer                  |
 created_at      | timestamptz              |
```

**There is no `field_order_line` table.** Line item details exist *only* in:
- `audit_log.metadata` (as a JSON snapshot at creation time, not queryable in any structured way)
- The inventory decrement (`field_product.inventory_available` is mutated but we don't keep the per-order quantity)

So today there is **no way to look up "which products were on order X"** after creation, except by parsing audit_log JSON.

### 6. Read side
[apps/backend-medusa/src/api/v1/field-orders/route.ts:8](apps/backend-medusa/src/api/v1/field-orders/route.ts:8) `GET /api/v1/field-orders`

- `report:read` permission gate ✅
- `listFieldOrders(organisationId)` → `SELECT … FROM field_order WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT 200` ✅
- Returns header rows only.

The dashboard and any other consumer never sees line items.

### 7. Reports use
[apps/backend-medusa/src/modules/reports/repository.ts] (not re-read; per Session 9 progress doc):
- `report.summary.orderCount` = `COUNT(*) FROM field_order WHERE organisation_id = $1`
- `report.summary.totalOrderCents` = `SUM(total_cents)`
- `report.rep-activity.ordersTotal` per rep
- `report.rep-activity.orderTotalCents` per rep

Used by `/reports` and `/team-scorecard`. All sourced from `field_order` — Medusa-side orders would not contribute to these counts unless we bridge both directions.

### 8. Mobile offline sync path
[apps/mobile-field-sales/src/sync/offline-queue.ts] + sync handlers:
- Mobile can enqueue a `visit.check_in`, `visit.check_out`, `tracking.ping`, `consent.recorded` mutation but **does not have an `order.create` mutation type registered**.
- Even if a mobile order screen existed, the sync engine would not know how to apply it.

---

## What's in Medusa right now

```
medusa=> SELECT count(*) FROM product;        -- 0
medusa=> SELECT count(*) FROM "order";        -- 0
medusa=> SELECT count(*) FROM cart;           -- 0
medusa=> SELECT count(*) FROM customer;       -- 0
medusa=> SELECT count(*) FROM region;         -- 0
medusa=> SELECT count(*) FROM sales_channel;  -- typically 1 default created during init
medusa=> SELECT count(*) FROM stock_location; -- typically 1 default
medusa=> SELECT count(*) FROM "user";         -- 1  (admin@mithtech.local)
```

Medusa has its 113-table schema applied (Session 13 work) plus the admin login user, but no business data. The Medusa admin's empty product/order/customer pages are not a bug — they're an accurate reflection of state.

---

## Why the two systems were never bridged before

A few honest reasons, in priority order:

1. **Domain mismatch.** Orbit orders are field-sales captures (rep visits outlet, takes order). Medusa orders model checkout (customer pays at till). Mapping them requires deciding: who is the "customer" — the outlet, the rep, or the field-rep tenant? Each has tradeoffs we haven't picked.

2. **Database separation.** We chose to run Medusa in a separate `medusa` DB to avoid 17-table name collisions. That means atomic cross-system writes are not possible — either we accept "best-effort" dual-write or we move everything into Medusa's DB.

3. **Product catalog overlap.** `field_product` exists. Medusa's `product` exists. Today these are separate; mirroring them requires deciding which is the source of truth.

4. **Inventory split-brain.** Today `field_product.inventory_available` is the only stock counter. Medusa's inventory module has its own `inventory_item` + `inventory_level`. Same product would need two counters or one would shadow the other.

5. **Pricing.** `field_product.unit_price_cents` is single-currency, no rules. Medusa's pricing has price lists, rules, customer-group-based pricing. They're orders-of-magnitude apart in complexity.

---

## What "real Medusa integration" actually means (target state)

The user's headline ask: *"orders visible in Medusa admin, stored in real Medusa entities, not custom-only orders."*

This Phase 3 will implement **Option B: dual-write bridge** (small enough to ship + verify in one pass):

1. **Keep `field_order` as Orbit's source of truth.** It has the rep/outlet metadata our domain needs, the tenant scoping, the audit history. Removing it would break /reports, /team-scorecard, /my-day, /audit-log entirely.
2. **Add `field_order.medusa_order_id`** column to track the cross-system linkage.
3. **Seed Medusa with the minimum required scaffolding** (region, currency, sales channel, stock location, a placeholder "Orbit orders" customer).
4. **After every successful `createFieldOrder`, asynchronously call Medusa's admin API** to create a matching order. If Medusa is down, the local order still succeeds; the link can be backfilled later.
5. **Store the Medusa order id back on the `field_order` row** so the UI can show "View in Medusa admin" deep links.
6. **Surface the linkage** on the web `/field-orders` page.

What this delivers vs. doesn't:

| Ask | Delivered? |
|---|---|
| Orders visible in Medusa admin UI | ✅ as Medusa draft orders |
| Orders stored in real Medusa entities (`order` table) | ✅ |
| Products linked to Medusa product catalog | ⚠️ partial — uses a single placeholder Medusa product per order line; mirroring the full catalog is a follow-up |
| Inventory updates Medusa | ❌ stays in `field_product` only; Medusa inventory is not the source of truth in this design |
| Order lifecycle (status transitions) real | ⚠️ creation only; cancel/fulfil/refund flows are not bridged |
| Orbit dashboard still shows orders | ✅ unchanged path |
| No duplicate shadow order system | ⚠️ honest answer: yes, there's still a shadow — `field_order` remains as the canonical Orbit record. This is documented and intentional for pilot scope. |
| Mobile offline orders | ❌ requires a mobile order-capture screen that doesn't exist yet — separate workstream |
| Idempotent retry on offline sync | ❌ same as above |

The alternative — a full cutover removing `field_order` and treating Medusa as sole source of truth — is a 1–2 week project that would also require rewriting the mobile sync engine, /reports, /team-scorecard, and /my-day. For the pilot, the dual-write bridge is the honest minimum that makes the headline ask true.
