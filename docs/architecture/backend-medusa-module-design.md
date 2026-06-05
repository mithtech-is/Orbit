# Backend Medusa Module Design

## Custom Modules

| Module | Responsibility |
|---|---|
| `organisation` | Tenants, teams, memberships and tenant settings. |
| `identity-and-access` | Users, roles, permissions, manager/rep relationships and device registrations. |
| `territory` | Territory polygons, assignments and geospatial containment. |
| `lead-and-outlet` | Leads, outlets, addresses, customer links and lifecycle. |
| `visit` | Scheduled visits, check-in/out, outcomes, notes and proof attachments. |
| `tracking` | Consent, work sessions, raw pings, cleaned trails and last-known location. |
| `route-planning` | Route plans, stops, optimisation requests, versions and actual summaries. |
| `sync` | Device cursors, mutation records, idempotency, conflicts and sync errors. |
| `notification` | Push requests, in-app notifications and alert preferences. |
| `audit-and-compliance` | Audit logs, data export/deletion requests, retention jobs and consent history. |

## Workflow Rule

Medusa workflows perform multi-step operations such as assigning leads, generating routes, starting tracking, recording check-ins, creating field orders and cleaning up expired location data. API routes remain thin: validate request, authorise tenant/role, invoke workflow or query service, return typed response.

## Commerce Integration

Products, variants, pricing, inventory, carts and orders stay aligned with Medusa commerce capabilities. Field orders link outlet/customer records to Medusa customer/order records instead of creating a parallel commerce subsystem.
