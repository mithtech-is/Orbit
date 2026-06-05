# Mobile order flow audit (pre-implementation)

**Date:** 2026-05-28
**Companion:** [order-flow-audit.md](order-flow-audit.md) (server-side trace), [order-system-final-verification.md](order-system-final-verification.md) (Medusa bridge verification)

## TL;DR

**Mobile reps cannot create orders today.** The mobile app has zero order screens. The sync engine has no `order.create` mutation type. This document traces what exists and what's missing before the sprint to build it.

## What already exists (backend)

| Surface | Location | State |
|---|---|---|
| `POST /api/v1/field-orders` | [apps/backend-medusa/src/api/v1/field-orders/route.ts](../../apps/backend-medusa/src/api/v1/field-orders/route.ts) | ✅ Working — RBAC `order:create`, rep-owned, calls workflow |
| `GET /api/v1/field-orders` | same file | ✅ Working — `report:read`, returns header + `medusaOrderId` |
| `GET /api/v1/products` | [products/route.ts](../../apps/backend-medusa/src/api/v1/products/route.ts) | ✅ Working — returns `field_product` rows with `inventory_available` |
| `runCreateFieldOrderWorkflow` | [workflows/commerce/create-field-order.ts](../../apps/backend-medusa/src/workflows/commerce/create-field-order.ts) | ✅ Working — emits `field_order.created` audit event |
| `createFieldOrder` repo | [modules/commerce/repository.ts](../../apps/backend-medusa/src/modules/commerce/repository.ts) | ✅ Working — PG txn with inventory lock, calls Medusa bridge after commit |
| Medusa draft-order bridge | [integrations/medusa-client.ts](../../apps/backend-medusa/src/integrations/medusa-client.ts) | ✅ Working — verified live in prior round |
| `POST /api/v1/sync/push` | [sync/push/route.ts](../../apps/backend-medusa/src/api/v1/sync/push/route.ts) | ✅ Working — for visit + tracking mutations |
| `dispatchMutation` | [modules/sync/dispatch.ts](../../apps/backend-medusa/src/modules/sync/dispatch.ts) | ⚠️ Missing `order.create` handler — has `visit.check_in`, `visit.check_out`, `tracking.location.batch` only |
| `mutation_record` idempotency table | sync module | ✅ Working — PK `(organisation_id, idempotency_key)` already guarantees no double-apply |

## What already exists (mobile)

| Surface | State |
|---|---|
| `LoginScreen` | ✅ |
| `RouteTodayScreen` | ✅ |
| `VisitCheckInScreen` | ✅ |
| Sync engine `createOfflineSync` | ✅ — enqueueMutation + flush with idempotency-key + per-mutation status |
| Token storage + API client | ✅ |
| Product catalog screen | ❌ **doesn't exist** |
| Order cart / review screen | ❌ **doesn't exist** |
| Order history screen | ❌ **doesn't exist** |
| Navigation route for orders | ❌ — `AppNavigator` only knows about Login → RouteToday → VisitCheckIn |

## Mobile sync engine has no order-creation mutation type registered

```ts
// apps/backend-medusa/src/modules/sync/dispatch.ts:30-37
switch (type) {
  case "visit.check_in":       return handleVisitCheckIn(...)
  case "visit.check_out":      return handleVisitCheckOut(...)
  case "tracking.location.batch": return handleLocationBatch(...)
  default: return { status: "rejected", error: `Unknown mutation type: ${type}` };
}
```

If the mobile app today queued `{ type: "order.create", payload: { ... } }`, the server would reject it with "Unknown mutation type". This is the single most important backend gap to close.

## What this sprint must add

| Component | Where | Notes |
|---|---|---|
| `handleOrderCreate` dispatch handler | [dispatch.ts](../../apps/backend-medusa/src/modules/sync/dispatch.ts) | Calls `runCreateFieldOrderWorkflow` exactly like the REST POST does. Same RBAC (rep-owned). |
| Product list screen | `apps/mobile-field-sales/src/screens/ProductCatalogScreen.tsx` | Fetch `/api/v1/products`, allow add-to-cart |
| Cart / review screen | `apps/mobile-field-sales/src/screens/OrderReviewScreen.tsx` | Show outlet + line items + total + Submit |
| Order history screen | `apps/mobile-field-sales/src/screens/OrderHistoryScreen.tsx` | Fetch `/api/v1/field-orders` + show pending offline queue items |
| Navigation routes | `apps/mobile-field-sales/src/navigation/AppNavigator.tsx` | Add 3 new routes; entrypoint from VisitCheckInScreen |
| Online submit path | new helper or apiClient call | `POST /api/v1/field-orders` — already creates Medusa draft |
| Offline submit path | new mutation type in offline-queue | `enqueueMutation({ type: "order.create", payload })` |
| Test for `order.create` dispatch | `apps/backend-medusa/src/modules/sync/dispatch.test.ts` or new file | Idempotency + duplicate prevention |

## How idempotency will work (no duplicate orders)

1. Mobile generates `idempotencyKey = "order_<deviceId>_<localId>_<timestamp>"` per order.
2. Online path: `POST /api/v1/field-orders` body includes `id` (same as idempotencyKey-derived). PG `INSERT … VALUES (id PRIMARY KEY)` errors on duplicate — caller catches and treats as "already created".
3. Offline path: `enqueueMutation({ idempotencyKey, type: "order.create", payload: { ... } })`. Sync engine sends batches with `idempotencyKey` per mutation. Server's `mutation_record (organisation_id, idempotency_key)` PRIMARY KEY guarantees the dispatch runs at most once. The dispatch handler itself uses the same `idempotencyKey`-derived order id, so even if `mutation_record` doesn't catch (e.g. clear cache), the inner PG insert still rejects.

Net effect: **three layers of duplicate prevention** — client cache, sync-record PK, PG order-id PK.

## What the demo flow will look like (target)

1. Field rep opens app → sees today's route
2. Tap a stop → check in → notes/outcome
3. New button on visit screen: **"Create order"** → opens ProductCatalogScreen
4. Browse products (with `field_product.inventory_available` shown as "Available stock")
5. Tap product → quantity selector → add to cart → repeat
6. Tap **"Review order"** → OrderReviewScreen shows outlet + line items + total
7. Tap **"Submit order"**
   - **Online**: real-time POST → success toast → navigates to OrderHistoryScreen → row appears with status `synced` and the new Medusa order id
   - **Offline**: queued locally → "Saved offline · will sync when reconnected" → user can keep going
8. On reconnect (network change or pull-to-refresh): existing flush logic drains the queue → server processes `order.create` → reps see the row flip from `pending` to `synced`
9. Manager sees the new order on the web dashboard's `/field-orders` page AND the Medusa admin's draft-orders tab — both already wired from prior round.

## What I will NOT do in this sprint

- Photo capture on order (separate workstream — needs native camera + storage)
- Voice notes on order (separate)
- Customer-facing order printout / PDF (different feature, ERP-side concern)
- Pricing tiers per outlet/territory (different feature — current price is `field_product.unit_price_cents` single price per SKU)
- Order edit / cancel from mobile (low priority — manager can do this from web)
- Real device walkthrough — I can build it but you have to run it.
