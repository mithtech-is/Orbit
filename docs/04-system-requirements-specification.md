# System Requirements Specification

## Functional Requirements

| ID | Requirement |
|---|---|
| FR-001 | The system shall support multiple organisations with isolated tenant data. |
| FR-002 | The system shall enforce role and permission checks for all API operations. |
| FR-003 | Managers shall create, optimise and assign daily route plans to reps. |
| FR-004 | Mobile reps shall view assigned route plans, leads, outlets and products offline. |
| FR-005 | Mobile reps shall capture check-in, check-out, visit outcome, notes, evidence and orders offline. |
| FR-006 | Tracking shall require consent and active work session. |
| FR-007 | Location ingestion shall deduplicate client-generated event IDs and store durable records. |
| FR-008 | Managers shall receive authorised live location and visit events over WebSockets. |
| FR-009 | Geofence exceptions shall support manager review. |
| FR-010 | Raw location retention and anonymisation jobs shall be configurable per tenant. |
| FR-011 | Medusa commerce modules shall supply products, pricing, inventory and order structures. |
| FR-012 | Sync shall support cursor-based pulls, mutation pushes, retries, idempotency and conflict records. |

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-001 | API input must be validated before workflows execute. |
| NFR-002 | PostgreSQL/PostGIS is the authoritative store for business and geospatial data. |
| NFR-003 | Redis supports queues, pub/sub and real-time horizontal scaling. |
| NFR-004 | WebSocket subscriptions must be tenant and role filtered. |
| NFR-005 | Electron renderer must not have direct Node.js access. |
| NFR-006 | Local development must run without paid maps, push or object storage providers by using mocks. |
| NFR-007 | All sensitive access, location history reads and policy changes must be audited. |
