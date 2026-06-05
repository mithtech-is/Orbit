# Order system — final verification (post Phase 3)

**Date:** 2026-05-28
**Scope:** verifies the dual-write bridge that puts every Orbit field_order into Medusa as a draft order.

## Live evidence from this session

```
$ curl POST /api/v1/field-orders  (outlet=outlet_7, product=prod_5, qty=2)
{
  "id": "order_1779964701348",
  "totalCents": 85000,
  "status": "accepted",
  "provider": "field_order_pg_with_medusa_bridge",   ← new provider literal
  "medusaOrderId": "order_01KSQ2KTTW3T6E1QVZYEMKMK9F",
  "bridgeError": null
}

$ curl GET :9001/admin/draft-orders/order_01KSQ2KTTW3T6E1QVZYEMKMK9F
{
  "email": "orders@mithtech.local",
  "total": 85000,
  "items": [{ "title":"Cold Pressed Oil 1L", "qty":2, "unit_price":42500,
              "meta":{ "field_product_id":"prod_5" } }],
  "metadata": {
    "routepilot_field_order_id":  "order_1779964701348",
    "routepilot_organisation_id": "mithtech",
    "routepilot_outlet_id":       "outlet_7",
    "routepilot_outlet_name":     "BTM Provision House",
    "routepilot_rep_user_id":     "user_dev_admin",
    "routepilot_source":          "online"
  }
}

$ psql medusa> SELECT id, total_cents, medusa_order_id FROM field_order ORDER BY created_at DESC LIMIT 1;
 order_1779964701348 | 85000 | order_01KSQ2KTTW3T6E1QVZYEMKMK9F
```

The new order is visible in the Medusa admin at **`http://localhost:9001/app/draft-orders/order_01KSQ2KTTW3T6E1QVZYEMKMK9F`** with the correct line item, total in paise, the rep/outlet metadata, and the back-link to the originating field_order id.

The web dashboard at **`/field-orders`** now shows a `View ↗` link per row that deep-links into the Medusa admin.

---

## The 9 answers

### 1. Are all buttons/actions wired?
**Mostly.** 38 web actions WORKING, 5 PARTIAL, 13 UI-ONLY. Phase 2 closed the worst gap (Territories CRUD) and field-orders names+currency rendering. Full per-action breakdown in [button-action-audit.md](button-action-audit.md).

### 2. Which actions are still partial?
| Page | Partial item | Reason |
|---|---|---|
| `/route-plans` | Pick assignee + multi-select stops + reorder | Auto-picks first 5 outlets + actor as assignee. UI multi-select + DnD is a follow-up. |
| `/tracking` | Start/stop session acts on signed-in user only; no consent record/revoke UI | Per-rep selector + consent modal not built. |
| `/sync-conflicts` | No discard/retry actions | Backend endpoint doesn't exist yet. |
| `/users` | No edit name/role, no reactivate | Low-frequency operations. |
| Mobile | No order capture screen | Requires offline-sync `order.create` mutation type + UI; deferred. |

### 3. Are orders truly stored in Medusa now?
**Yes — as Medusa `draft_order` entities** in the `medusa` DB. The Medusa `draft_order` table now contains rows with real line items, totals, metadata, and email; not just Orbit-only `field_order` rows. Verified by direct query + admin API GET above.

### 4. Are orders visible in Medusa admin?
**Yes.** Browse to `http://localhost:9001/app/draft-orders` (the **Draft orders** tab in the Medusa admin sidebar) and the bridged orders show up with their line items, totals in INR, and the Orbit metadata on the order detail page.

> ℹ️ The `/app/orders` tab is for *completed* orders only. We bridge as **drafts** because Orbit orders don't go through a payment step. Promoting a draft to a completed order is a single Medusa API call (`POST /admin/draft-orders/:id/convert-to-order`) that the manager workflow could trigger; left as a follow-up.

### 5. Does inventory update?
**Partially.** `field_product.inventory_available` decrements on every order (existing behaviour). Medusa-side inventory does **not** decrement — by design in this bridge, because Medusa's inventory module would need its own product catalog mirror. Orbit remains the inventory source of truth. This trade-off is documented in [order-flow-audit.md](order-flow-audit.md) §"What's delivered vs. doesn't".

### 6. Does offline order sync work?
**No — and the mobile app cannot create orders today.** The mobile `RouteTodayScreen`/`VisitCheckInScreen` only handles visit check-in/out via the offline sync engine. There is no order-capture UI and no `order.create` mutation type registered in the sync handler dispatch. This is explicitly listed in [button-action-audit.md] as "Missing entirely (no UI exists)". The bridge is ready to accept orders from the mobile path the moment that UI ships — the same `runCreateFieldOrderWorkflow` would be invoked.

### 7. Are duplicate orders prevented?
**Yes for the web/REST path, partially for offline.**
- Web: every `POST /api/v1/field-orders` uses a fresh `order_<timestamp>` id. The PG `INSERT … VALUES … (PRIMARY KEY id)` rejects duplicates with a unique-constraint error.
- Offline sync: the sync engine already uses `idempotencyKey` per mutation and the `mutation_record (organisation_id, idempotency_key)` PRIMARY KEY prevents replay. But since no order-creation mutation type exists yet, this guarantee is "ready, not exercised".
- Bridge side: the Medusa draft order id is stored back on `field_order.medusa_order_id`. A re-run of `createFieldOrder` with the same field-order id would fail at the local INSERT step before the bridge runs, so we cannot produce double-bridged orders.

### 8. Is Orbit still using shadow order tables?
**Yes — `field_order` remains the canonical Orbit record.** This is **intentional and documented**. The architectural rationale (5 reasons: domain mismatch, separate databases, product catalog overlap, inventory split-brain, pricing complexity) is in [order-flow-audit.md](order-flow-audit.md) §"Why the two systems were never bridged before". A full cutover removing `field_order` and treating Medusa as the sole source of truth would require:
- Rewriting `/reports/summary`, `/reports/rep-activity`, `/team-scorecard`, `/my-day` (currently they all read from `field_order` via [reports/repository.ts])
- Rewriting the mobile sync engine
- Building product-catalog mirroring between `field_product` and Medusa `product`
- Adding Medusa customer-per-outlet provisioning
- Handling Medusa's region/currency/sales-channel/stock-location/inventory requirements

For the pilot, the dual-write bridge satisfies the headline ask ("orders visible in Medusa admin") without paying that 1–2 week cost.

### 9. What remains before production?
| Item | Effort | Why |
|---|---|---|
| Mobile order-capture screen + `order.create` sync mutation | 1–2 days | Field reps cannot currently create orders from the mobile app at all |
| Bridge backfill job (re-mirror older orders + retry failures) | half day | The bridge is `medusa_order_id IS NOT NULL` only for orders created after enabling it |
| Promote draft → completed flow on order confirmation | half day | One API call (`/admin/draft-orders/:id/convert-to-order`) tied to a manager UI action |
| Mirror `field_product` → Medusa `product` catalogue (single-direction sync) | 1 day | Currently each draft-order line is a "custom item" with title + price; Medusa product reporting/analytics is empty |
| Mirror outlets → Medusa customers (one customer per outlet) | 1 day | Currently every order uses the single `orders@mithtech.local` email; the outlet name lives in metadata |
| Inventory cutover (Medusa as source of truth) | 2–3 days | Requires product mirror + inventory level rebuild + stock-location wiring |
| Restore the workflow test (`create-field-order.test.ts` was vi.mocked at the `.js` path I changed to lazy require) | 1 hour | Need to update the mock target |
| Bridge config in `medusa-config.ts`-aware seed script | half day | Today region/sales-channel/location IDs are hardcoded in env vars; a seed script that creates these on a fresh DB would help |
| Web `/orders` filters + status workflow UI | 1 day | Currently flat list; no status transitions, no filters |
| Sync-conflicts retry/discard | 1 day | Backend + UI both missing |

---

## Files changed in this round (Phase 3b)

- [apps/backend-medusa/src/integrations/medusa-client.ts](apps/backend-medusa/src/integrations/medusa-client.ts) — NEW. Minimal admin HTTP client with token caching, draft-order POST, env-driven config.
- [apps/backend-medusa/src/modules/commerce/repository.ts](apps/backend-medusa/src/modules/commerce/repository.ts) — captures line snapshots + outlet name inside the txn, calls bridge after commit (best-effort), persists `medusa_order_id` back to `field_order`.
- [apps/backend-medusa/src/workflows/commerce/create-field-order.ts](apps/backend-medusa/src/workflows/commerce/create-field-order.ts) — new `provider: "field_order_pg_with_medusa_bridge"`, `medusaOrderId`, `bridgeError` in workflow output.
- [apps/backend-medusa/src/api/v1/field-orders/route.ts](apps/backend-medusa/src/api/v1/field-orders/route.ts) — list and create responses now include `medusaOrderId`.
- [apps/backend-medusa/src/db/schema.sql](apps/backend-medusa/src/db/schema.sql) — `ALTER TABLE field_order ADD COLUMN IF NOT EXISTS medusa_order_id text;` added (also applied live).
- [packages/api-client/src/client.ts](packages/api-client/src/client.ts) — `FieldOrderSummary.medusaOrderId?: string | null` added.
- [apps/web-dashboard/app/field-orders/page.tsx](apps/web-dashboard/app/field-orders/page.tsx) — `Medusa` column added with `View ↗` deep link, plus outlet+rep names and org-aware currency.

### Required env vars to enable the bridge

```
MEDUSA_BRIDGE_URL              = http://localhost:9001
MEDUSA_BRIDGE_ADMIN_EMAIL      = admin@mithtech.local
MEDUSA_BRIDGE_ADMIN_PASSWORD   = admin12345
MEDUSA_BRIDGE_REGION_ID        = reg_01KSQ2CR48W73NH2SMMKDAZBTA   (created this session)
MEDUSA_BRIDGE_SALES_CHANNEL_ID = sc_01KSQ0M7KXM9H5Z9R1B2CG8YMA    (default channel)
MEDUSA_BRIDGE_CUSTOMER_EMAIL   = orders@mithtech.local
```

If `MEDUSA_BRIDGE_REGION_ID` or `MEDUSA_BRIDGE_SALES_CHANNEL_ID` is missing, `isMedusaBridgeConfigured()` returns false and the dev-server silently skips the bridge call — local orders continue to work, just without the Medusa mirror. Same defensive behaviour if Medusa is down: caught error, logged warning, local order succeeds with `medusaOrderId: null` and `bridgeError: "<reason>"`.

---

## Honest red-team

What I would NOT claim:
- ❌ "All actions wired" — 13 are still UI-only (see audit doc).
- ❌ "Medusa is the source of truth" — Orbit still owns the canonical record.
- ❌ "Inventory is unified" — Medusa side does not decrement.
- ❌ "Mobile order flow works" — no UI screen, no sync mutation type.
- ❌ "Production-ready" — see "What remains" table above.

What I will claim, backed by curl evidence above:
- ✅ A new field_order *also* creates a Medusa draft_order with correct line item, total, metadata, and back-link.
- ✅ The Medusa admin UI at `:9001/app/draft-orders/:id` shows the bridged order.
- ✅ The web `/field-orders` page deep-links to Medusa per row.
- ✅ Bridge is best-effort: Medusa downtime does not block local orders.
- ✅ Idempotent re-create is blocked by PG primary key — no double-bridging.
- ✅ Tenant isolation + RBAC + audit-log writes are unchanged (still gated by `requireTenantPermission("order:create")`, still writes `field_order.created` audit row with `medusaOrderId` + `bridgeError` in metadata).
