# ERPNext integration plan

**Status:** **architecture-only** — no live ERPNext sync code exists yet. This document defines the contract, ownership boundaries, and runtime layout that a future ERPNext adapter will plug into.

**Companion code:**
- [apps/backend-medusa/src/integrations/erp-provider.ts](../../apps/backend-medusa/src/integrations/erp-provider.ts) — `ErpProvider` interface + `createNoopErpProvider()`
- [apps/backend-medusa/src/integrations/erp-event-bus.ts](../../apps/backend-medusa/src/integrations/erp-event-bus.ts) — in-process pub/sub for ERP-bound events

---

## 1. Why ERPNext

Orbit is the **field execution layer**: it captures what reps do (visits, orders, leads, route adherence). For real-world deployments the org already runs an ERP for invoicing, inventory accounting, GL, payroll. ERPNext is a common choice for SMB and mid-market in India + Southeast Asia, fits our existing pilot customer profile, and is open-source so we can develop against it without a paid sandbox.

## 2. Ownership boundaries

This is the most important section. Get this wrong and you end up with split-brain data.

| Domain | Source of truth | Replica direction | Notes |
|---|---|---|---|
| **Customer** (outlet) | Orbit `outlet` | push to ERPNext on create/update | Orbit decides who a rep visits. ERPNext gets a customer row so invoices have a counterparty. |
| **Product catalog** | ERPNext `Item` | pull into Orbit `field_product` | ERPNext is where the org's SKU master lives. Orbit sees a denormalised mirror updated nightly + on webhook. |
| **Inventory level** | ERPNext `Stock Ledger Entry` | pull (read-only) | Orbit's `field_product.inventory_available` becomes a cached reflection of the warehouse the rep ships from. |
| **Sales order** | Orbit `field_order` (creation), ERPNext `Sales Order` (lifecycle from "confirmed" onwards) | Orbit pushes on create; ERPNext pushes status back via webhook | Mirror is *one creation* → ERPNext owns subsequent status. Orbit's `field_order.status` becomes a cached mirror of ERPNext's `docstatus` once linked. |
| **Invoice / payment** | ERPNext | pull (read-only) for "show invoice in app" | Orbit never writes invoices. |
| **Employee** | ERPNext `Employee` | pull to Orbit `app_user` (link only — Orbit keeps its own auth) | Mapping table joins them. |
| **Attendance / leave** | ERPNext | Orbit pushes GPS-clock-in events; ERPNext is the system of record | See §"Attendance push" below. |

**Rule of thumb:** if the data has accounting consequences (invoice, GL, payroll), ERPNext owns it. If the data is about field reality (where the rep was, what they observed, who they pitched), Orbit owns it.

## 3. Runtime architecture

```
                   ┌──────────────────────────────────────────────┐
                   │ Orbit backend (dev-server.ts on :9000)  │
                   │                                              │
   ┌───────────┐   │  ┌──────────────┐   ┌────────────────────┐  │
   │ Web /     │───►  │ POST /api/   │──►│ workflow / repo    │  │
   │ Mobile    │   │  │ v1/...       │   │ writes to PG       │  │
   └───────────┘   │  └──────────────┘   └──────────┬─────────┘  │
                   │                                ▼            │
                   │                   ┌──────────────────────┐  │
                   │                   │ emitErpEvent(...)    │  │
                   │                   │ (in-process bus)     │  │
                   │                   └──────────┬───────────┘  │
                   │                              ▼              │
                   │                   ┌──────────────────────┐  │
                   │                   │ ERPNextProvider      │  │
                   │                   │ (registered at boot) │  │
                   │                   └──────────┬───────────┘  │
                   │                              ▼              │
                   │                   ┌──────────────────────┐  │
                   │                   │ HTTP POST to         │  │
                   │                   │ /api/method/...      │  │
                   │                   └──────────┬───────────┘  │
                   │                              │              │
                   │              ┌───────────────┼──────────┐   │
                   │              │ ERPNext mapping table    │   │
                   │              │ (local_id ↔ erpnext_id)  │   │
                   │              └──────────────────────────┘   │
                   └──────────────────────────────────────────────┘
                                       ▲
                                       │  webhooks (ERPNext → Orbit)
                                       │  POST /api/v1/integrations/erpnext/webhook
                                       ▼
                   ┌──────────────────────────────────────────────┐
                   │ ERPNext (self-hosted or Frappe Cloud)        │
                   └──────────────────────────────────────────────┘
```

The bus + provider pattern means Orbit's domain code never imports ERPNext-specific types. Swapping in a different ERP (Tally, SAP B1, Odoo) is "implement `ErpProvider` for the new system + register it at boot".

## 4. Synchronisation directions

### 4.1 Orbit → ERPNext (push)

Triggered by `emitErpEvent` calls from the relevant workflows.

| Event | When | ERPNext call | Idempotency strategy |
|---|---|---|---|
| `outlet.created` | After PG insert commits | `POST /api/resource/Customer` | Mapping table `erp_entity_map.local_id` PK — re-emit no-ops if already mapped |
| `outlet.updated` | After PG update commits | `PUT /api/resource/Customer/{erpId}` | Skip if payload hash matches `erp_entity_map.hash` |
| `field_product.created` *(only if reverse-mirror is enabled)* | After PG insert commits | `POST /api/resource/Item` | Same |
| `field_order.created` | After PG insert + Medusa bridge commit | `POST /api/resource/Sales Order` | `erp_entity_map.local_id = field_order.id` PK |
| `visit.checked_out` (with GPS) | After PG checkout commits | `POST /api/method/erpnext.hr.doctype.employee_checkin.employee_checkin.add_log` | Mapping per visit |

### 4.2 ERPNext → Orbit (pull + webhook)

ERPNext webhooks land on `POST /api/v1/integrations/erpnext/webhook` (route to be added when we wire the first adapter), signed with a shared secret. The route deserialises and calls `getErpProvider().handleWebhook()`.

| Webhook event | What we do |
|---|---|
| `Item updated` | Upsert `field_product` row |
| `Item Price updated` | Update `field_product.unit_price_cents` |
| `Stock Ledger Entry on submit` | Recompute `field_product.inventory_available` from ERPNext's level |
| `Sales Order status change` | Update `field_order.status` (e.g. `accepted` → `processing` → `delivered`) |
| `Sales Invoice on submit` | Store invoice id on `field_order.metadata` for "view invoice" links |
| `Payment Entry on submit` | Mark order as paid |

Polling fallback: every 15 min, a job (registered via `internal/jobs/...`) reconciles "anything created in the last N minutes that we don't have a mapping for" by hitting `GET /api/resource/Item?modified=[">", "<timestamp>"]`.

## 5. Auth

ERPNext supports two patterns:

1. **API key + API secret** as a header pair on the user's profile (`Authorization: token <key>:<secret>`). Simplest, recommended for our adapter.
2. **OAuth2 client** (since v13). More work to bootstrap, better for multi-tenant SaaS where each customer connects their own ERPNext.

For pilot we go with #1 — one API key per Orbit tenant, stored in `organisation_setting.erpnext_credentials` (encrypted at rest, separate from the regular `organisation_setting` table to keep secret-scope clean).

## 6. Queueing + retries

The in-process `emitErpEvent` bus is **fire-and-forget by design** so Orbit's user-facing latency stays unaffected by ERPNext slowness. For reliability:

- Wrap each subscriber in a "1 retry with exponential backoff" wrapper (jittered to avoid herd) before giving up.
- On final failure, persist the envelope to `erp_event_dlq (organisation_id, event_name, payload jsonb, last_error, attempts, created_at)` — a future operator UI lists rows for manual retry.
- For multi-replica deployments, replace the in-process bus with a Redis-backed queue (BullMQ recommended). The `ErpProvider` interface stays the same.

## 7. Conflict handling

The only place we genuinely conflict: **sales order status** (Orbit creates with `status=accepted`, ERPNext can move it through `Submitted` / `To Deliver` / `Completed` / `Cancelled`).

Rule: **once a `field_order.erp_sales_order_id` exists, ERPNext's status wins.** Orbit's status becomes read-only. The user cannot "cancel" a synced order from Orbit — they must do it in ERPNext (or via a "request cancellation" action that forwards the request as a webhook to ERPNext for approval).

For outlets/products: **timestamp-wins (last-writer-wins)** on per-field basis. The mapping table's `lastSyncedAt` resolves stale-update collisions.

## 8. Mapping table

```sql
CREATE TABLE erp_entity_map (
  organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  provider text NOT NULL,              -- 'erpnext' | future providers
  entity_type text NOT NULL,           -- 'customer' | 'product' | 'sales_order' | ...
  local_id text NOT NULL,              -- Orbit id (outlet_xxx, field_order_xxx, ...)
  erp_id text NOT NULL,                -- ERPNext docname
  last_synced_at timestamptz NOT NULL,
  direction text NOT NULL,             -- 'push' | 'pull' | 'bidirectional'
  hash text,                           -- md5 of normalised payload — skip no-op syncs
  metadata jsonb,
  PRIMARY KEY (organisation_id, provider, entity_type, local_id),
  UNIQUE (organisation_id, provider, entity_type, erp_id)
);

CREATE INDEX erp_entity_map_lookup_idx
  ON erp_entity_map (organisation_id, provider, entity_type, last_synced_at DESC);
```

This is **not** in our schema yet — add it as a new migration when implementing the first ERPNext adapter (don't ALTER existing tables; clean separation).

## 9. ERPNext-side bootstrap (one-time per tenant)

When an org admin enables the ERPNext integration in `/organisation-settings` (UI to be built), the adapter's `bootstrap()` method does:

1. **Validate creds** via `GET /api/method/frappe.auth.get_logged_user`.
2. **Discover defaults**: company, default warehouse, default price list. Cache on `organisation_setting.erpnext_metadata`.
3. **Optional**: create a dedicated "Orbit" Sales Person + Sales Team in ERPNext so all pushed orders are attributed cleanly.
4. **Test webhook delivery**: register a webhook with ERPNext pointing at our endpoint and trigger a synthetic event.

## 10. Open questions for pilot customer discovery

Before implementing the adapter, get these answered:

1. **Self-hosted ERPNext or Frappe Cloud?** Affects auth (API key vs OAuth), webhook reachability, and TLS setup.
2. **Single Company or multi?** ERPNext supports multi-company; we need to decide if a Orbit org maps to one Company or many.
3. **Existing customer master?** If the org already has customers in ERPNext, we need a "map existing" step rather than blindly pushing new Customer docs from Orbit.
4. **Tax + currency handling.** Indian GST flows have specific Item Tax templates and Tax Categories. The adapter must respect them, not hardcode.
5. **Item / Product naming convention.** Orbit's `field_product.sku` ↔ ERPNext's `Item.item_code`. Does the customer want lookup by SKU or by `name`?
6. **Sales Order workflow.** ERPNext often has a customer-specific approval workflow (draft → submit → approved → delivery). The adapter needs to know the entry state.

## 11. What ships with the pilot vs what is on-demand

| Capability | When |
|---|---|
| `ErpProvider` interface + no-op default | ✅ **ships now** (this PR) |
| In-process event bus | ✅ **ships now** (this PR) |
| ERPNext adapter (the actual HTTP client) | **on pilot customer signing up** with ERPNext as their ERP — typically 5–7 days work |
| Webhook ingestion route | Same |
| `erp_entity_map` migration | Same |
| Org-settings UI for ERPNext credentials | Same |
| Operator UI for DLQ retry | After first pilot identifies actual retry patterns |
| Multi-tenant OAuth flow | Reserved for first customer that requires it (today's API-key flow works for self-hosted) |

## 12. Implementation checklist (when you build the adapter)

1. Add migration for `erp_entity_map` + `organisation_setting.erpnext_credentials` (encrypted column).
2. Create `apps/backend-medusa/src/integrations/erpnext/provider.ts` implementing `ErpProvider`.
3. Add `apps/backend-medusa/src/integrations/erpnext/client.ts` — typed wrapper over ERPNext REST API.
4. Register subscribers in `dev-server.ts` boot: `subscribeErpEvent("field_order.created", erpnextProvider.pushSalesOrder.bind(...))` etc.
5. Add `POST /api/v1/integrations/erpnext/webhook` route, signed-body verification.
6. Add settings UI section to `/organisation-settings` for credentials + ping/test button.
7. Add operator UI at `/admin/integrations/dlq` for failed-event retry.
8. Add integration tests using the [Frappe REST recorder](https://frappeframework.com/docs/v15/user/en/api/rest) capture fixtures so tests don't need a live ERPNext.
