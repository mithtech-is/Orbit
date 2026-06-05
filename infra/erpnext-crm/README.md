# Orbit ERPNext + Frappe CRM (lead capture)

A **separate, isolated** ERPNext 16 + Frappe CRM instance for Orbit/Orbit
lead capture. It does **not** touch any other ERPNext you run (e.g. the HR
`frappe-hr-v16` / `rosemount` instance on port 8080) — different Compose project,
network, volumes, and host port.

| | This instance | Your existing HR instance |
|---|---|---|
| Compose project | `routepilot-crm` | `frappe-hr-v16` |
| Compose file | `infra/erpnext-crm/crm.yml` | `~/erpnext-local/frappe-hr-v16/hr.yml` |
| Site | `crm.localhost` | `rosemount` |
| URL | http://localhost:8082 | http://localhost:8080 |
| Apps | frappe, erpnext, **crm** | frappe, erpnext, hrms, education |
| Volumes | `routepilot-crm_*` | `frappe-hr-v16_*` |

## Access
- **ERPNext desk / CRM:** http://localhost:8082  → log in `Administrator` / `admin`
- **Frappe CRM app:** http://localhost:8082/crm (requires login)
- **API user (used by Orbit):** `routepilot@crm.local`
  - Roles: System Manager, Sales Manager, Sales User
  - API key/secret were generated and written to `apps/backend-medusa/.env.scaffold`.
  - ⚠️ Local dev creds. For production, create a fresh scoped API user and inject
    credentials via real env / a secrets manager — never commit them.

## Lifecycle
```bash
# Start / stop / status (run from the repo root)
docker compose -f infra/erpnext-crm/crm.yml up -d
docker compose -f infra/erpnext-crm/crm.yml stop
docker compose -f infra/erpnext-crm/crm.yml ps

# Tear down (KEEPS data volumes)
docker compose -f infra/erpnext-crm/crm.yml down
# Tear down AND delete all data (destructive, this instance only)
docker compose -f infra/erpnext-crm/crm.yml down -v
```

## How it was built (runtime install, no custom image)
The base `frappe/erpnext:v16` image does not ship Frappe CRM, so `crm` is installed
onto the shared `apps` volume at runtime and made importable in every container via
`PYTHONPATH` (the same pattern your `hr.yml` uses for hrms/education). To reproduce
on a fresh volume set:

```bash
P="docker compose -f infra/erpnext-crm/crm.yml exec -T backend bash -lc"
# 1. bring it up (create-site installs erpnext on crm.localhost)
docker compose -f infra/erpnext-crm/crm.yml up -d
# 2. fetch + install the CRM app (develop branch matches frappe v16)
$P 'cd /home/frappe/frappe-bench && bench get-app --branch develop --skip-assets crm'
$P 'cd /home/frappe/frappe-bench && grep -qx crm sites/apps.txt || echo crm >> sites/apps.txt'
$P 'cd /home/frappe/frappe-bench && ./env/bin/pip install -e apps/crm'
$P 'cd /home/frappe/frappe-bench && bench --site crm.localhost install-app crm'
$P 'cd /home/frappe/frappe-bench && bench --site crm.localhost migrate'
$P 'cd /home/frappe/frappe-bench && bench --site crm.localhost execute crm.install.after_install'  # seed statuses/sources
# 3. build the CRM SPA (node/yarn live under nvm, not on the login PATH)
$P 'export PATH=/home/frappe/.nvm/versions/node/v24.12.0/bin:$PATH; cd /home/frappe/frappe-bench/apps/crm && yarn install && yarn build'
$P 'export PATH=/home/frappe/.nvm/versions/node/v24.12.0/bin:$PATH; cd /home/frappe/frappe-bench && bench build --app crm'
# 4. (optional) complete ERPNext setup wizard so a Company + masters exist
docker compose -f infra/erpnext-crm/crm.yml restart backend frontend websocket queue-short queue-long scheduler
```

## Orbit wiring
- Connector: `apps/backend-medusa/src/integrations/erpnext-provider.ts`. Orbit
  records map to ERPNext as: outlet → **Customer**, field_product → **Item**,
  field_order → **Sales Order** (selling rep attached as a `sales_team` entry),
  lead → **CRM Lead** (token auth), and **sales-facing users → Sales Person**.
- A captured lead (`POST /api/v1/leads`) mirrors to CRM best-effort (errors are
  logged, never block the rep's write). Inviting a user (`POST /api/v1/users`)
  with a sales role mirrors them to a Sales Person the same way. Backfill all
  existing records from the dashboard **Integrations** page → "Backfill customers
  + products + leads + reps".
- **Sales reps → Sales Person:** users with role `field_sales_representative` or
  `sales_manager` become leaf nodes under the `Sales Team` group in the Sales
  Person tree (Selling workspace). Same-named reps are disambiguated by appending
  their email. Override the parent group with `ERPNEXT_SALES_PERSON_PARENT`.
- Status mapping: Orbit `new`→`New`, plus aliases (`won`→`Converted`,
  `lost`→`Unqualified`, …); unknowns fall back to `ERPNEXT_CRM_DEFAULT_LEAD_STATUS`.
- **Per-rep assignment:** the lead's assigned rep (`app_user.email`) becomes the
  CRM Lead `lead_owner` + a ToDo assignment; a CRM User (Sales User role) is
  auto-created for the rep if missing.
- **Two-way (CRM → app):** a Frappe Webhook on `CRM Lead` (`on_update`) POSTs to
  `http://host.docker.internal:9000/api/v1/integrations/erp/webhook` with header
  `X-Orbit-Webhook-Secret` = `ERPNEXT_WEBHOOK_SECRET`. Status/name changes made
  in the CRM flow back to the app. Webhook is named "Orbit CRM Lead Sync" in
  the CRM (Settings → Webhooks). Recreate it with the script in
  `/tmp/mkwh2.py`-style (see session) or the Webhook UI if the volume is wiped.
- Env (in `apps/backend-medusa/.env.scaffold`): `ERPNEXT_ENABLED=true`,
  `ERPNEXT_BASE_URL=http://localhost:8082`, key/secret, `ERPNEXT_COMPANY=Orbit`,
  `ERPNEXT_CRM_LEAD_SOURCE="Walk In"`, `ERPNEXT_CRM_DEFAULT_LEAD_STATUS=New`,
  `ERPNEXT_SALES_PERSON_PARENT="Sales Team"` (optional). Restart the backend after
  changing these.
- **API-user roles (gotcha):** `System Manager` does NOT auto-grant module
  doctypes. The API user `routepilot@crm.local` needs `Sales Master Manager` to
  create **Sales Person** and `Item Manager` to create **Item**, on top of the
  `Sales Manager`/`Sales User`/`Accounts *`/`Support Team` roles. Add a missing
  role via `bench`:
  ```bash
  echo 'import frappe; u=frappe.get_doc("User","routepilot@crm.local"); u.append("roles",{"role":"Sales Master Manager"}); u.save(ignore_permissions=True); frappe.db.commit()' \
    | docker exec -i routepilot-crm-backend-1 bench --site crm.localhost console
  ```

## Notes / gotchas
- The `develop` branch of Frappe CRM is required for frappe v16 (`main` targets v15).
- `bench get-app` runs `yarn` which isn't on the login PATH in this image — drive it
  with `PATH=/home/frappe/.nvm/versions/node/v24.12.0/bin:$PATH`.
- `crm.localhost` resolves to 127.0.0.1 automatically; the frontend forces the site
  via `FRAPPE_SITE_NAME_HEADER` so `http://localhost:8082` works too.
