# Executive Summary

Orbit is a multi-tenant SaaS platform for organisations that manage field representatives, managers and operations teams. It provides mobile-first field execution, manager visibility, route planning, Medusa-backed ordering and privacy-controlled location tracking.

The MVP focuses on operational reliability: reps receive daily routes, work offline, check in at outlets, capture visit outcomes and create field orders. Managers plan routes, monitor team progress on a live map, review exceptions and track sales/visit performance. Operations users manage leads, outlets, territories, orders, reports and sync failures from web or desktop.

The architecture uses Medusa.js as the backend and commerce engine, PostgreSQL/PostGIS for tenant and geospatial data, Redis for queues/pub-sub, WebSockets for live updates, Next.js for the manager dashboard, React Native for the mobile app and Electron for the desktop operations shell. Field-sales capabilities are custom Medusa domains rather than generic route-handler logic.

Privacy is a first-class product requirement. Location tracking is only allowed after explicit consent and during active work sessions. Raw location retention is configurable, historical access is audited, and analytics should use aggregated or anonymised data after the retention window.

The implementation will proceed in phases. Phase 0 aligns research, scope and architecture. Phase 1 creates the monorepo, local infrastructure, shared contracts, baseline tests and seed-data foundation.
