# High-Level Architecture

```mermaid
graph LR
  RN["React Native Mobile"] --> API["Medusa API Routes"]
  WEB["Next.js Manager Dashboard"] --> API
  DESK["Electron Operations App"] --> API
  API --> WF["Medusa Workflows"]
  WF --> MOD["Custom Field Sales Modules"]
  WF --> COM["Medusa Commerce Modules"]
  MOD --> PG[("PostgreSQL + PostGIS")]
  COM --> PG
  WF --> REDIS[("Redis queues/pub-sub")]
  API --> WS["WebSocket Gateway"]
  REDIS --> WS
  WS --> WEB
  WS --> DESK
  MOD --> MAPS["Maps Provider Interface"]
  MAPS --> MOCK["Local Mock Provider"]
  MAPS --> EXT["Mapbox / Google / HERE / OSRM"]
  WF --> OBJ["Object Storage Adapter"]
  WF --> PUSH["Push Provider Adapter"]
```

The backend owns tenant-aware business workflows. Client applications do not embed routing, permission, tenant or order business rules. They call typed API contracts and subscribe to authorised event streams.

PostgreSQL/PostGIS is the source of truth. Redis accelerates queue processing and fan-out but is never the only durable record. External maps, object storage and push notification providers are behind interfaces so local development and tests use deterministic mock providers.
