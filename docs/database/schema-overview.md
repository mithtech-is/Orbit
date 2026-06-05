# Database Schema Overview

Authoritative DDL: [apps/backend-medusa/src/db/schema.sql](../../apps/backend-medusa/src/db/schema.sql). PostgreSQL 16 with the `postgis` and `pgcrypto` extensions enabled.

## Conventions

- **Tenancy:** every business table carries `organisation_id text NOT NULL REFERENCES organisation(id) ON DELETE CASCADE`. There are no global business records.
- **IDs:** human-readable `text` primary keys (e.g., `outlet_42`, `wses_1716908800000`) rather than UUIDs. Append-only tables (`audit_log`, `consent_log`) generate UUIDs server-side via `gen_random_uuid()::text`.
- **Composite tenant PKs:** `location_ping` uses `(organisation_id, id)` as its primary key so the table can later be partitioned by tenant without breaking inserts.
- **Geospatial types:** outlet locations are `geography(Point, 4326)` for distance queries; territory boundaries are `geometry(MultiPolygon, 4326)` for containment. Both columns have GIST indices.
- **Indices:** every tenant-scoped query has a leading `organisation_id` index. Time-series and live-table queries get `(organisation_id, …, time DESC)` composite indices.
- **Cascades:** organisation deletion cascades to all dependent tenant data. User deletion cascades to user-owned resources where ownership is required (visit, work_session, location_ping, notification, team_member); for assignment-only references (lead.assigned_user_id, outlet.…, route_plan.assigned_user_id — currently RESTRICT via NOT NULL + ON DELETE CASCADE on route_plan) the policy is documented per-column below.

## Table-by-Table

### `organisation`
Tenant root.
| Column | Type | Notes |
|---|---|---|
| id | text PK | e.g., `org_acme` |
| name | text NOT NULL | |
| slug | text NOT NULL UNIQUE | tenant URL slug |
| created_at | timestamptz NOT NULL DEFAULT now() | |

### `organisation_setting`
1:1 with `organisation`; tenant-level policy.
| Column | Type | Notes |
|---|---|---|
| organisation_id | text PK / FK → organisation | |
| geofence_radius_meters | int NOT NULL DEFAULT 100 | check-in geofence radius |
| raw_location_retention_days | int NOT NULL DEFAULT 90 | retention job target |
| normal_tracking_distance_meters | int NOT NULL DEFAULT 100 | ping deduplication threshold |
| active_visit_tracking_distance_meters | int NOT NULL DEFAULT 25 | denser tracking during an active visit |
| working_hours_start / _end | text NOT NULL DEFAULT '09:00' / '18:00' | enforces "no tracking outside session" rule |

### `app_user`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| email | text NOT NULL | UNIQUE per `(organisation_id, email)` |
| name | text NOT NULL | |
| role | text NOT NULL | mirrors `Role` enum in `packages/shared-types` |
| password_hash | text NULL | bcrypt hash, NULL means SSO-only or invited-not-yet-set |
| active | bool NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

### `role_permission`
Tenant-customisable RBAC mapping. Composite PK `(organisation_id, role, permission)`. Seeded from `permissionsByRole` in `scripts/seed-demo-data.ts`; aligns with `docs/security/rbac-permission-matrix.md`.

### `team` + `team_member`
- `team(id PK, organisation_id FK, name)` — sales team within a tenant.
- `team_member(team_id, user_id)` composite PK — both FKs ON DELETE CASCADE.

### `outlet`
Customer retail location.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| name | text NOT NULL | |
| location | geography(Point, 4326) NOT NULL | inserted via `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Indices: `outlet_organisation_idx`, `outlet_location_gix` (GIST).

### `territory`
Polygon coverage area used for assignment + containment.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| name | text NOT NULL | |
| boundary | geometry(MultiPolygon, 4326) NOT NULL | |

Indices: `territory_organisation_idx`, `territory_boundary_gix` (GIST).
Read path currently returns the `ST_Envelope` bounding box (see `modules/territory/repository.ts`); point-in-polygon queries are pending.

### `lead`
Pre-conversion customer record.
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| outlet_id | text NULL FK → outlet (ON DELETE SET NULL) | |
| name | text NOT NULL | |
| status | text NOT NULL | `new`, `qualified`, `assigned`, … |
| priority | int NOT NULL DEFAULT 1 | |
| assigned_user_id | text NULL FK → app_user (ON DELETE SET NULL) | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Indices: `lead_tenant_status_idx (organisation_id, status)`, `lead_assignee_idx (organisation_id, assigned_user_id)`.

### `route_plan`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| assigned_user_id | text NOT NULL FK → app_user | |
| route_date | date NOT NULL | |
| status | text NOT NULL | `planned`, `assigned`, `in_progress`, `completed` |
| planned_distance_meters | int NOT NULL | from the optimiser |
| planned_duration_minutes | int NOT NULL | |
| provider | text NOT NULL | currently `mock` (greedy inline); will become `mapbox` / `osrm` once provider abstraction is wired |
| provider_reference | text NOT NULL | provider-side trace id |
| created_at | timestamptz NOT NULL DEFAULT now() | **Added 2026-05-28 to fix B1** — `repository.ts` orders by this column |

Index: `route_plan_tenant_date_idx (organisation_id, route_date DESC, created_at DESC)`.

### `route_stop`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| route_plan_id | text NOT NULL FK → route_plan (ON DELETE CASCADE) | |
| outlet_id | text NOT NULL FK → outlet (ON DELETE CASCADE) | |
| stop_order | int NOT NULL | 1-indexed sequence |
| status | text NOT NULL | `pending`, `completed`, `skipped` |
| expected_duration_minutes | int NOT NULL | |

Index: `route_stop_plan_idx (route_plan_id, stop_order)`.

### `visit`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id | text NOT NULL FK | |
| outlet_id | text NOT NULL FK → outlet (ON DELETE CASCADE) | |
| assigned_user_id | text NOT NULL FK → app_user (ON DELETE CASCADE) | |
| visit_date | date NOT NULL | |
| status | text NOT NULL | `scheduled`, `in_progress`, `completed`, `exception` |
| outcome | text NULL | post check-out result code |
| notes | text NULL | |
| checked_in_at | timestamptz NULL | |
| checked_out_at | timestamptz NULL | |
| check_in_latitude / _longitude | double precision NULL | |
| geofence_status | text NULL | `within`, `exception` |

Indices: `visit_tenant_date_idx (organisation_id, visit_date, status)`, `visit_assignee_status_idx (organisation_id, assigned_user_id, status)`.

### `field_product`, `field_order` *(deprecation candidates)*
Standalone catalogue + order tables used by seed only. **Will be replaced by Medusa product/order modules** in Phase 14; field-specific concerns (source = `online | offline | sync_failed`, rep_user_id) will live as Medusa metadata or sidecar tables linking to `medusa.order.id`.

### `notification`
In-app notification record. (id PK, organisation_id, user_id, type, title, status, created_at). No delivery state, no preferences, no fan-out yet.

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | text PK DEFAULT gen_random_uuid()::text | |
| organisation_id | text NOT NULL FK | |
| actor_user_id | text NULL | system actions may have no actor |
| action | text NOT NULL | dotted name, e.g., `visit.checked_in`, `lead.assigned` |
| target_type | text NOT NULL | e.g., `visit`, `lead`, `organisation` |
| target_id | text NOT NULL | |
| metadata | jsonb NOT NULL DEFAULT '{}' | structured context |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Index: `audit_log_tenant_time_idx (organisation_id, created_at DESC)`.
**Write path is not yet wired** in domain workflows — only the demo seed writes one row.

### Privacy / Tracking tables

#### `consent_log`
Append-only consent ledger. Latest row per `(organisation_id, user_id)` is authoritative; `granted = false` (or `revoked_at NOT NULL`) blocks new sessions and `recordConsent(granted=false)` cascade-stops any active session.

#### `work_session`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| organisation_id, user_id | text NOT NULL FK | |
| consent_id | text NULL FK → consent_log | session is bound to the consent that authorised it |
| status | text NOT NULL DEFAULT 'active' | `active` or `stopped` |
| started_at / ended_at | timestamptz | |
| started_latitude / _longitude | double precision NULL | |

Partial index `work_session_active_idx ON (organisation_id, user_id, status) WHERE status = 'active'` — enforces "at most one active session per rep" lookup in O(1).

#### `location_ping`
| Column | Type | Notes |
|---|---|---|
| id | text NOT NULL | client-generated UUID |
| organisation_id | text NOT NULL FK | |
| work_session_id | text NOT NULL FK → work_session (ON DELETE CASCADE) | session must exist to write |
| user_id | text NOT NULL FK → app_user (ON DELETE CASCADE) | |
| latitude / longitude | double precision NOT NULL | |
| accuracy_meters | double precision NULL | |
| recorded_at | timestamptz NOT NULL DEFAULT now() | |
| PK | `(organisation_id, id)` | tenant-sharded |

Index: `location_ping_session_idx (organisation_id, work_session_id, recorded_at DESC)`.
**Write endpoint not yet implemented** — schema is ready for Phase 12.

## Foreign-Key Map (tenant resources)

```
organisation ─┬─< app_user ─┬─< team_member >── team
              │             ├─< role_permission
              │             ├─< work_session ─< location_ping
              │             ├─< consent_log
              │             ├─< notification
              │             ├─< visit (assigned)
              │             ├─< route_plan (assigned)
              │             └─< field_order (rep_user_id)
              ├─< outlet ─< route_stop >── route_plan
              ├─< territory
              ├─< lead (outlet_id NULL-able, assigned_user_id NULL-able)
              ├─< field_product
              ├─< field_order
              └─< audit_log
```

## Retention

`organisation_setting.raw_location_retention_days` (default 90) is the target for the not-yet-implemented retention job. Recommended approach: a scheduled job that `DELETE FROM location_ping WHERE recorded_at < now() - interval` per tenant, with deletion counts written to `audit_log` (action `tracking.location.retained`).

## Migration Notes

The schema is currently applied wholesale by `scripts/seed-demo-data.ts` via `client.query(schemaSql)` before seeding. Because `CREATE TABLE IF NOT EXISTS` does not add columns to existing tables, every additive change must also include a guard:

```sql
ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type> ...;
```

…immediately after the `CREATE TABLE`. See `route_plan.created_at` for the canonical example.

A real migration tool (MikroORM via Medusa, or `node-pg-migrate`) is not yet adopted; doing so is a Phase 15 hardening item.

## Future Tables (named but not created)

- `device_registration` (Phase 13 sync) — device id, user id, last-seen cursor, push token.
- `mutation_record` (Phase 13 sync) — idempotency key, payload hash, status, conflict reason.
- `sync_cursor` (Phase 13 sync) — per-device per-table watermarks.
- `data_export_request` / `data_deletion_request` (Phase 15 compliance) — GDPR-style workflow rows.
