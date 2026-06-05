# Seed Data and Demo Guide

## Demo Tenant

The current seed fixture creates:

- Organisation: `Acme Field Sales`
- Users:
  - `admin@acme-fieldsales.test`
  - `manager@acme-fieldsales.test`
  - `ops@acme-fieldsales.test`
  - `rep1@acme-fieldsales.test`
  - `rep2@acme-fieldsales.test`
  - `rep3@acme-fieldsales.test`
- Team: `Bengaluru Central`
- Initial outlets:
  - Indiranagar Fresh Mart
  - Koramangala Daily Needs
  - MG Road Super Store

## Print Seed JSON

```powershell
corepack pnpm seed:demo:json
```

## Insert Seed Data Into PostgreSQL

Start infrastructure:

```powershell
docker compose --env-file .env.example -f infra/docker/docker-compose.yml up -d
```

Run the seed:

```powershell
corepack pnpm seed:demo
```

The seed command creates the Phase 2 tenant/RBAC schema, enables PostGIS, inserts users, role permissions, team membership, outlets and an audit log entry.

## Docker-Verified Seed Path

If the Windows host PostgreSQL driver cannot authenticate through Docker Desktop's port proxy, use the Docker-network verified path:

```powershell
Get-Content -LiteralPath 'apps\backend-medusa\src\db\schema.sql' |
  docker exec -i fieldsales-postgres psql -U fieldsales -d fieldsales

corepack pnpm --silent seed:demo:sql |
  docker exec -i fieldsales-postgres psql -v ON_ERROR_STOP=1 -U fieldsales -d fieldsales
```

Validation on 2026-05-27 confirmed the seeded counts:

| Table | Count |
|---|---:|
| `organisation` | 1 |
| `app_user` | 6 |
| `outlet` | 15 |
| `territory` | 2 |
| `lead` | 20 |
| `route_plan` | 3 |
| `visit` | 15 |
| `field_order` | 3 |
| `notification` | 3 |
