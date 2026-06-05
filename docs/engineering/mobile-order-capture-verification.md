# Mobile order capture — final verification

**Date:** 2026-05-28
**Companions:** [mobile-order-flow-audit.md](mobile-order-flow-audit.md) · [order-system-final-verification.md](order-system-final-verification.md)

## TL;DR

The full **field rep → mobile → order → Medusa** path is wired and live-verified up to the backend. Mobile UI screens are built and typechecked, but I have not tapped them on a real device. Backend dispatch handler, idempotency, dual-DB write, and Medusa bridge are all confirmed via curl.

## The 8 honest answers

### 1. Can a field rep create an order from mobile?
**Build: YES. Real-device tap-through: not by me.** Three new screens exist + are wired into the navigator:
- `ProductCatalogScreen` — fetches `/api/v1/products`, search + filter, add/remove with quantity stepper, stock cap enforcement, bottom cart bar that opens the review screen
- `OrderReviewScreen` — line items, total, notes, online-first submit with offline fallback
- `OrderHistoryScreen` — pending offline queue + failed retry + server-side history with deep-link to Medusa
- Entry points: "+ Create order" button on `VisitCheckInScreen` (mid-visit) **and** "Orders" header button on `RouteTodayScreen` (anywhere)

Mobile typecheck: ✅ clean. Web typecheck: ✅ clean (after JSX-import + React-19 migration). 86/86 tests pass.

### 2. Does the order reach Medusa?
**YES — verified live.** Both online (`POST /api/v1/field-orders`) and offline (`POST /api/v1/sync/push` with `type: order.create`) paths go through `runCreateFieldOrderWorkflow` → `createFieldOrder` → `bridgeFieldOrderToMedusa`. Live evidence:

```
POST /api/v1/sync/push  (mutation type=order.create, source=offline)
→ 200 status: "applied"
  result: { id: "order_offline_test_…", medusaOrderId: "order_01KSQ4Z3NQMK1QEFJRCX69V0HR",
            totalCents: 42500, provider: "field_order_pg_with_medusa_bridge", bridgeError: null }
```

Cross-DB confirmation:
```
fieldsales=> SELECT id, total_cents, medusa_order_id FROM field_order WHERE id='order_offline_test_…';
 order_offline_test_…  |  42500  |  order_01KSQ4Z3NQMK1QEFJRCX69V0HR

medusa=> SELECT id, metadata->>'routepilot_field_order_id' FROM "order" WHERE metadata->>'routepilot_field_order_id'='order_offline_test_…';
 order_01KSQ4Z3NQMK1QEFJRCX69V0HR  |  order_offline_test_…
```

### 3. Does the order appear in the web dashboard?
**YES** — the `/field-orders` web page lists from `GET /api/v1/field-orders` which now returns `medusaOrderId` per row. The "Medusa" column on each row has a **View ↗** link that deep-links to `:9001/app/draft-orders/:id`. This was shipped two rounds ago and is unchanged.

### 4. Does the order appear in mobile order history?
**Build: YES, three sections live in the UI:**
- **Queued** (yellow): mutations enqueued offline, not yet sent. Shown from `sync.queue.pending().filter(m => m.type === "order.create")`.
- **Failed / needs attention** (red): mutations that hit max-attempts. Shown from `sync.queue.failed()`. New "Retry pending orders" button on the header triggers `flushNow()`.
- **Synced** (white/green): server-side history from `apiClient.listFieldOrders()`. Shows total, source, time, and "Synced to Medusa" badge if `medusaOrderId` is present.

Pull-to-refresh re-flushes + re-fetches.

### 5. Does offline order sync work?
**YES — live-verified on the backend.** The mobile path:
1. `OrderReviewScreen.handleSubmit` attempts online `POST /api/v1/field-orders` first.
2. On any failure (network, fetch error, server error), falls back to `sync.enqueueMutation({ type: "order.create", payload: { id, outletId, source: "offline", lines, ... } })`.
3. Calls `flushNow()` once — silent if still offline; otherwise immediately drains.
4. On any later reconnect (pull-to-refresh on RouteToday or OrderHistory, or AppState change), the offline queue retries via the existing `useOfflineSync` hook.

The new backend dispatch handler (`order.create` case in [dispatch.ts](apps/backend-medusa/src/modules/sync/dispatch.ts)) calls the same `runCreateFieldOrderWorkflow` the REST POST uses, so the Medusa bridge fires identically. Audit row written. Reports update.

**Real-device offline test (toggle airplane mode → create order → restore) was not performed by me** — it's a manual step you'll need to do.

### 6. Are duplicates prevented?
**YES — three independent layers, all verified:**

| Layer | What catches | Live verification |
|---|---|---|
| Mobile client | `MutationQueue` deduplicates by `idempotencyKey` (set in `mutation-queue.ts`) | Existing test `apps/mobile-field-sales/src/sync/offline-queue.test.ts` |
| Sync route | `mutation_record (organisation_id, idempotency_key)` PRIMARY KEY — replay of same key returns cached result without re-running dispatch | Just verified: replay of `order_offline_test_…` returned identical `medusaOrderId`, no new DB rows |
| Repository | `field_order.id` PRIMARY KEY → PG rejects with `duplicate key` error; dispatch handler converts that to `{ status: "applied", result: { deduplicated: true } }` | Unit test `dispatch.test.ts → "treats duplicate-key error as idempotent success"` |

After the replay test, count of rows for this idempotency key: **1 in `field_order`, 1 in `medusa.order`**. No duplicates.

### 7. Are tests passing?
**YES — 86/86, 23 test files.**

New tests this round (in `apps/backend-medusa/src/modules/sync/dispatch.test.ts`):
- `rejects when outletId or lines missing`
- `calls workflow + invokes the emit hook + returns applied with medusa id`
- `treats duplicate-key error as idempotent success`
- `propagates non-duplicate workflow errors as rejected`
- `normalises invalid source values to 'offline'`
- `rejects unknown mutation types`

Existing 80 still pass.

### 8. Is the full field-rep demo now ready?
**Yes for the backend + the screens. The honest gap: I cannot verify the touch UX without a phone in my hand.**

What I am confident of:
- Backend handles online + offline orders correctly
- Idempotency works across all three layers
- Medusa receives the order with correct metadata
- Web dashboard sees it
- Tests pass
- Typecheck is clean

What I need you to verify on the phone:
- Tap-through navigation (visit → create order → catalog → cart → review → submit)
- Product catalog renders correctly with real product names + stock
- Quantity stepper works smoothly
- "Saved offline" toast appears when network is off
- Order history shows queued + synced correctly
- Pull-to-refresh flushes the queue

## Demo walkthrough script (manual)

This is the run-through to validate Phase 9 yourself. Each step has a verified-working backend behind it; what I can't do is the tap.

### Setup
- Backend `:9000` up with `MEDUSA_BRIDGE_*` env vars set (Medusa region/sales-channel from earlier session)
- Medusa `:9001` up
- Web dashboard `:3000` up
- Mobile Metro `:8081` up with `EXPO_PUBLIC_MOBILE_API_BASE_URL=http://192.168.0.8:9000`
- Phone running Expo Go on the same Wi-Fi

### Online flow
1. Phone: open `exp://192.168.0.8:8081` in Expo Go
2. Sign in as `rep1@acme-fieldsales.test` / `admin123` / `mithtech`
3. *(if no route assigned)* From web, sign in as admin → `/route-plans` → assign a route to `user_rep_1` for today
4. Phone: pull-to-refresh on RouteToday → today's route appears
5. Tap any stop → Check in (allow location prompt)
6. Tap **+ Create order**
7. Browse products → add a couple → tap **Review order**
8. Confirm total → tap **Submit order**
9. Order History opens → row appears with green "synced" status + "Synced to Medusa" badge
10. Switch to web `/field-orders` → new row visible with View ↗ deep-link
11. Click View ↗ → Medusa admin opens the draft order with the line items

### Offline flow
12. Phone: enable airplane mode
13. Pick another stop → check in offline
14. Create a second order via the catalog → submit
15. UI shows "Saved offline" → Order History row has yellow "Queued" pill
16. Restore network
17. Pull-to-refresh on Order History (or tap "Retry pending orders" if shown) → row flips to green "synced"
18. Web `/field-orders` shows the second order with its Medusa View ↗ link
19. Try to create a *third* order with the same idempotency key (via direct curl from your terminal) → server returns same `medusaOrderId`, no new row

## Files changed this round

### Backend
- [apps/backend-medusa/src/modules/sync/dispatch.ts](../../apps/backend-medusa/src/modules/sync/dispatch.ts) — added `handleOrderCreate` case + idempotency-safe duplicate-key handling
- [apps/backend-medusa/src/modules/sync/dispatch.test.ts](../../apps/backend-medusa/src/modules/sync/dispatch.test.ts) — NEW, 6 tests covering happy path + edge cases + dedup
- [packages/sync-engine/src/mutation-queue.ts](../../packages/sync-engine/src/mutation-queue.ts) — added `failed()` + `all()` accessors

### Mobile
- [apps/mobile-field-sales/src/screens/ProductCatalogScreen.tsx](../../apps/mobile-field-sales/src/screens/ProductCatalogScreen.tsx) — NEW
- [apps/mobile-field-sales/src/screens/OrderReviewScreen.tsx](../../apps/mobile-field-sales/src/screens/OrderReviewScreen.tsx) — NEW (online+offline submit)
- [apps/mobile-field-sales/src/screens/OrderHistoryScreen.tsx](../../apps/mobile-field-sales/src/screens/OrderHistoryScreen.tsx) — NEW
- [apps/mobile-field-sales/src/screens/VisitCheckInScreen.tsx](../../apps/mobile-field-sales/src/screens/VisitCheckInScreen.tsx) — added `onCreateOrder` prop + button
- [apps/mobile-field-sales/src/navigation/AppNavigator.tsx](../../apps/mobile-field-sales/src/navigation/AppNavigator.tsx) — 3 new routes + Orders header button

### Cross-cutting upgrade
- Upgraded Expo SDK 52 → 54 (matched user's Expo Go version)
- Upgraded web-dashboard React 18 → 19 (matched mobile to resolve type-hoist conflict)
- Added `import type { JSX } from "react"` to 28 files (React 19 removes global `JSX` namespace)

## Known caveats

- **Real-device test not performed by me.** Only typecheck + curl + DB queries verified.
- **Expo Go may reject this build on first load** because `expo-location` background-flag plugin is custom-native. If so, the only path is `eas build` for a real dev client APK.
- **Inventory still single-source.** `field_product.inventory_available` decrements; Medusa inventory does not.
- **Currency display in mobile** is a plain `(cents / 100).toFixed(2)` without symbol — to add localised symbol we'd need to pass the org settings down. Easy follow-up.
- **No order cancellation from mobile** — manager can cancel from web only.
- **No photo / voice on order** — separate feature.

## Final verdict

**Pilot-ready for the order capture demo, with mobile UX needing your touch-validation.** The bridge proves orders reach Medusa from offline; idempotency proves no duplicates; tests prove the contracts hold. The remaining "manager creates order from mobile" experience is real, but until you've tapped through it on a phone, treat it as "built but not field-tested."
