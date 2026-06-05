# ERPNext Integration — Orbit (dormant, opt-in plugin)

**Status:** ✅ Built into the codebase · 🟢 **CONNECTED** to a dedicated ERPNext 16 + Frappe CRM instance (`routepilot-crm`, http://localhost:8082) for lead capture. Still a clean pluggable seam — point `ERPNEXT_BASE_URL` elsewhere or set `ERPNEXT_ENABLED=false` to detach.

The integration ships as a **pluggable, off-by-default module**. With it disabled (the default), the registered provider is a **no-op** and the app behaves exactly as if ERP did not exist — no ERP HTTP calls, no mapping writes, core flows (outlets, orders, sync) run unchanged. You connect it to a specific ERPNext only by setting env vars and restarting; it is **not wired to any live instance now**.

> The integration was developed against ERPNext 16 (Frappe REST + DocType API, which is stable across v15→v16) and then **intentionally disconnected**. It is now a clean seam awaiting your target instance.

---

## What it does when enabled

| Orbit action | → | ERPNext / CRM DocType | Idempotency |
|---|---|---|---|
| Create outlet (+ backfill) | → | **Customer** | `erp_entity_mapping` per outlet; links to existing same-named Customer instead of duplicating |
| Create order (line products) + backfill | → | **Item** (`item_code` = SKU) | `item_code` is the PK → naturally idempotent |
| Create order (REST + offline sync) | → | **Sales Order** (`po_no` = Orbit order id) | `erp_entity_mapping` per order |
| Create/update lead (`POST/PUT /api/v1/leads`) + backfill | → | **CRM Lead** (Frappe CRM; `source`=Walk In, lead's outlet → `organization`, assigned rep → `lead_owner` + ToDo assignment) | `erp_entity_mapping` per lead (entity_type `lead`); re-push of unchanged lead is a no-op |
| CRM Lead changed in the CRM (status/name) | → | Orbit **lead** (via secured inbound webhook) | reverse-mapped by `erp_id`; updates name+status only, no echo back out |

### Per-rep assignment (app → CRM)
Each lead's `assigned_user_id` is resolved to the rep's `app_user.email`. If no CRM
User exists for that email, one is auto-created (System User, **Sales User** role,
no welcome email); the lead is then set to that `lead_owner` **and** assigned via a
Frappe ToDo so it lands in the rep's CRM queue. If the user can't be ensured, the
lead still syncs — just unassigned (a bad `lead_owner` Link would otherwise reject it).

### Two-way sync (CRM → app)
A Frappe **Webhook** on the `routepilot-crm` instance (doctype `CRM Lead`, event
`on_update`) POSTs the changed lead to `POST /api/v1/integrations/erp/webhook`
(`apps/backend-medusa/src/api/v1/integrations/erp/webhook/route.ts`). The handler:
- is **secret-gated** (`X-Orbit-Webhook-Secret` === `ERPNEXT_WEBHOOK_SECRET`, fail-closed) and unauthenticated by design (caller is the CRM server);
- reverse-maps the CRM docname → local lead via `erp_entity_mapping`, then applies status+name only (preserving outlet/priority/assignee);
- does **not** call `syncLeadToErp`, so there's no echo loop.
- Container→host reachability uses `http://host.docker.internal:9000`. Leads created
  *natively in the CRM* (no mapping) are acknowledged + ignored (no tenant to resolve) — a documented follow-up.

All pushes are **best-effort**: errors are caught + logged so ERP downtime never blocks a rep's order/outlet create. Order matters for a Sales Order — Customer + Items are pushed first, then the order references them.

---

## Architecture (the seam)

```
Orbit write path
  outlets POST ─┐
  orders POST  ─┤  syncOutletToErp / syncFieldOrderToErp   (integrations/erp-sync.ts)
  sync dispatch ┘        │  erpEnabled() gate → returns immediately if disabled
                         ▼
                  getErpProvider()                          (integrations/erp-provider.ts)
                         │  noop (default)  OR  ErpNextProvider (when configured)
                         ▼
                  ERPNext REST (token auth)                 (integrations/erpnext-provider.ts)
                         │  id mappings persisted in        erp_entity_mapping
```

- **Pluggable:** `ErpProvider` is an interface. At boot, `registerErpProvider(createErpNextProvider())` runs **only if `ERPNEXT_ENABLED=true` + keys are present**; otherwise the no-op provider stays registered.
- **Hard off-switch:** `erp-sync.ts` checks `erpEnabled()` (provider name !== "noop") at the top of every sync function — disabled means zero DB reads / HTTP calls.
- **Idempotent:** `erp_entity_mapping (organisation_id, provider, entity_type, local_id) → erp_id + hash`. Re-pushing an unchanged record is a no-op.

### Files (kept in the codebase, dormant)
- `integrations/erpnext-provider.ts` — REST provider (Customer/Item/Sales Order).
- `integrations/erp-sync.ts` — coordinator + `erpEnabled()` master gate.
- `integrations/erp-mapping-repository.ts` — mapping persistence.
- `integrations/erp-provider.ts` / `erp-event-bus.ts` — interface + bus.
- `api/v1/integrations/erp/route.ts` — admin status/backfill endpoints.
- Table `erp_entity_mapping` (`db/schema.sql` + migration `1700000000002`).
- Plugin works the same whether reached via the **backend**, **Electron** (which wraps the web dashboard), or **mobile** (orders flow through the same backend endpoints + offline sync).

---

## How to connect it to YOUR ERPNext later

1. Create a dedicated ERPNext API user (scoped role with API access — not Administrator) and generate an **API key + secret** for it.
   - Find the real site name first: `bench --site <site> ...` — it is the site directory under `sites/`, **not** the docker-compose service name.
2. Set these (in `apps/backend-medusa/.env.scaffold` for the dev scaffold, or real env in prod):
   ```bash
   ERPNEXT_ENABLED=true
   ERPNEXT_BASE_URL=https://your-erpnext.example.com
   ERPNEXT_API_KEY=<key>
   ERPNEXT_API_SECRET=<secret>
   ERPNEXT_COMPANY=<an existing Company on that instance>
   ERPNEXT_CURRENCY=INR
   ERPNEXT_CUSTOMER_GROUP=Commercial      # MUST be a NON-GROUP (leaf) customer group
   ERPNEXT_TERRITORY=All Territories
   ```
3. Restart the backend. Verify with:
   ```bash
   curl -H "Authorization: Bearer <admin-jwt>" http://localhost:9000/api/v1/integrations/erp/status
   # ok:true → then POST .../integrations/erp/backfill to push existing outlets+products
   ```

### Gotchas baked into the code/docs (learned the hard way)
- **Customer Group must be a leaf**, not the tree root. ERPNext rejects `All Customer Groups` ("Cannot select a Group type Customer Group"). The default is now `Commercial`; override `ERPNEXT_CUSTOMER_GROUP` to match your instance's leaf groups.
- **Wrong site name silently 401s** — generate keys against the actual site (`ls sites/`).
- **"Failed to decrypt key … Encryption key is invalid"** on a restored/borrowed site → set the api_secret via the bench console of the running backend (holds the live `encryption_key`) + `bench clear-cache`.

---

## Admin API (returns no-op/empty while disabled)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/integrations/erp/status` | `organisation:manage` | provider name + connection ping + mapping counts |
| POST | `/api/v1/integrations/erp/backfill` | `organisation:manage` | push all outlets + products (no-op when disabled) |

---

## ERPNext features available to integrate next (v16 + HRMS)
Reuse the same `ErpProvider` seam — prioritised by field-sales value:
1. **HR: Attendance / Employee Checkin** (if HRMS installed) — push geofenced check-ins as `Employee Checkin` + `Attendance`; map reps to `Employee`. Closes the audit's attendance/payroll gap by reusing ERPNext HR.
2. **Payments & outstanding** — push field collections as `Payment Entry`; pull customer outstanding for the rep ledger.
3. **Sales Invoice + Delivery Note** — promote the draft Sales Order for full order-to-cash.
4. **Stock / Warehouse (Bin)** — pull live stock so reps see real availability.
5. **Pricing Rule / Promotional Scheme** — honour distributor schemes in field orders.
6. **Inbound webhooks** — ERPNext `Webhook` → Orbit `handleWebhook` (interface hook exists) for two-way sync.

---

## Current state (this build)
- **CONNECTED** to a dedicated, isolated ERPNext 16 + Frappe CRM instance stood up
  for Orbit — Compose project `routepilot-crm`, site `crm.localhost`,
  http://localhost:8082. See `infra/erpnext-crm/` (compose + runbook). This is
  **separate** from any other ERPNext you run (e.g. the HR `rosemount` on :8080) —
  different project, network, volumes, and port; the connector only ever calls
  `ERPNEXT_BASE_URL`.
- `ERPNEXT_ENABLED=true` in `apps/backend-medusa/.env.scaffold`, pointing at
  `http://localhost:8082` with the `routepilot@crm.local` API user. Company
  `Orbit` (INR); customer group `Commercial`; CRM lead source `Walk In`.
- Lead capture verified end-to-end at the connector level: token-auth
  `POST /api/resource/CRM Lead` creates a CRM Lead (e.g. `CRM-LEAD-2026-00001`).
- ⚠️ The API key/secret in `.env.scaffold` are **local dev credentials**. For
  production, mint a fresh scoped API user and inject secrets via real env.
