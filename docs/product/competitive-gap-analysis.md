# Competitive Gap Analysis — Orbit vs. the Field-Sales Market

**Date:** 2026-05-29
**Orbit side:** grounded in the 2026-05-29 code audit (`docs/engineering/feature-completeness-audit.md`).
**Competitor side:** based on each vendor's well-established public positioning and category norms for SFA/DMS/FSM tools. Live web verification was limited (US-only search returns thin results for these India-centric products), so **treat competitor feature claims as "category-typical, verify against current vendor sites before quoting externally."** The *Orbit* claims are code-verified.

---

## Orbit today — verified capability baseline

**Real and working (code-verified):**
- Multi-tenant auth + RBAC with two-tier scoping (rep-owns vs manager-sees-all), real bcrypt + JWT.
- Outlets/Leads/Territories CRUD (+ outlet CSV import, PostGIS spatial indexes).
- Visits with geofenced check-in/out + manager reassign.
- GPS tracking: consent → work session → ping ingestion → **live map** (WebSocket).
- **Route optimisation**: priority-aware nearest-neighbour + 2-opt, pluggable provider (mock default; Mapbox/Google/**OSRM** behind `MAP_PROVIDER`).
- Orders with **transactional inventory** (oversell protection) + best-effort **Medusa** commerce bridge.
- **Offline-first**: idempotent delta sync, conflict capture, 3-attempt retry queue.
- Reports (org summary + per-rep activity), full **audit log** (filter + CSV export).
- Org settings (geofence radius, retention, working hours/days, currency, timezone).
- **Three clients**: Next.js web dashboard, Electron desktop, React Native mobile.
- **Free/OSS-first**: MapLibre + OSM, self-hostable, no mandatory paid Maps key.

**Stub / missing (code-verified gaps):** notifications delivery (push/WhatsApp/email), ERP connector, attendance/payroll, expense/claims, surveys/forms, distributor DMS (secondary sales, schemes, stock), payment collection, targets/incentives, recurring beat plans (PJP), photo/shelf AI, BI analytics. Plus the scale limits in `scalability-readiness-report.md`.

---

## Head-to-head

### 1. Unolo
- **What they do better:** Mature **attendance** (geofenced + selfie/face), **expense management**, task management, forms/data collection, polished tracking with battery optimisation, established Android footprint and onboarding. Notifications actually fire.
- **What Orbit does better:** True **offline-first delta sync with conflict handling** (Unolo is more online-centric); **transactional order+inventory** with an e-commerce backbone (Medusa); **OSS/self-host** option (data residency, no per-seat lock-in); **desktop (Electron)** client; cleaner multi-tenant RBAC model.
- **Missing vs them:** attendance, expense, selfie check-in, forms, push notifications.
- **Their weaknesses:** SaaS-only (no self-host/data-residency story), thinner commerce/inventory, less of an offline guarantee.

### 2. Delta Sales App
- **What they do better:** Very strong **SMB distribution** flows — beat plan, **party/outlet ledger**, **payment/collection**, **expense**, **attendance**, order taking, and aggressive **low pricing**. Deep in the Indian distributor/retailer reality.
- **What Orbit does better:** Engineering rigor (idempotent sync, audit trail, RBAC), **route optimisation quality** (2-opt vs simple beat lists), transactional inventory, web+desktop+mobile parity, OSS option.
- **Missing vs them:** ledger/outstanding, payment collection, expense, attendance, beat plan (recurring PJP).
- **Their weaknesses:** SMB-grade depth (less enterprise RBAC/audit), limited platform breadth, weaker realtime tracking UX.

### 3. Dista
- **What they do better:** **Location-intelligence platform** — strong Google-Maps-based **AI route/territory optimisation**, geospatial analytics, lead/territory design, enterprise integrations. Maps/geo is their core competence.
- **What Orbit does better:** **No paid-Maps lock-in** (MapLibre/OSM/OSRM, free); offline-first; built-in commerce/inventory; lower TCO; faster to self-host for a single org.
- **Missing vs them:** advanced geo-analytics, traffic-aware ETA at scale, sophisticated territory design, BI dashboards.
- **Their weaknesses:** heavier/enterprise-priced, Google-Maps cost dependency, overkill for SMB, less commerce depth.

### 4. BeatRoute
- **What they do better:** **AI-guided selling** — rep nudges/next-best-action, **goal-based selling**, B2B ordering, **distributor management**, retail-execution scorecards. Strong CPG/route-to-market playbook.
- **What Orbit does better:** Open commerce backbone (Medusa), offline rigor, OSS/self-host, transparent RBAC; simpler to stand up.
- **Missing vs them:** AI sales guidance, goal/scheme-based selling, DMS/secondary sales, retail-execution KPIs.
- **Their weaknesses:** CPG-specialised (less general), enterprise pricing/onboarding, SaaS-only.

### 5. SalesDiary
- **What they do better:** End-to-end **FMCG SFA + DMS** — beat planning, attendance, order, retailer management, **secondary sales/distributor stock**, analytics. Broad distribution feature coverage.
- **What Orbit does better:** Modern stack + offline-first sync, route optimisation quality, web/desktop/mobile parity, OSS option, cleaner audit/RBAC.
- **Missing vs them:** DMS/secondary sales, beat planning, attendance, distributor analytics.
- **Their weaknesses:** legacy UX in places, SaaS lock-in, less developer-extensible.

### 6. Bizom
- **What they do better:** **Market leader** in Indian retail intelligence — deep **DMS**, **predictive/auto ordering**, **photo/shelf recognition (image AI)**, distributor + secondary sales, enterprise CPG analytics, scale proven across large field forces.
- **What Orbit does better:** Cost/OSS, self-host/data-residency, offline-first engineering, embedded commerce/inventory, faster single-org deployment. (Orbit is a *platform you own*, Bizom is a *suite you rent*.)
- **Missing vs them:** DMS depth, shelf AI, predictive ordering, enterprise analytics, proven 100k-rep scale.
- **Their weaknesses:** enterprise cost + onboarding, closed/SaaS, heavyweight for SMB, customisation requires vendor.

### 7. Salesforce Field Service
- **What they do better:** Enterprise **FSM** — work-order lifecycle, **AI scheduling/dispatch optimisation (Einstein)**, asset/IoT, contractor management, vast ecosystem/AppExchange, global scale & compliance.
- **What Orbit does better:** Purpose-built for **field *sales*** (not service), dramatically **lower cost & complexity**, offline-first, OSS/self-host, embedded ordering — no Salesforce-platform tax or implementation army.
- **Missing vs them:** scheduling/dispatch AI, asset/IoT, deep CRM, ecosystem, enterprise scale/compliance certifications.
- **Their weaknesses:** different segment (service, not beat-sales), very high cost/complexity, overkill for distribution/retail beat selling, slow to deploy.

---

## Where Orbit is structurally differentiated (defensible)
1. **Offline-first with real conflict handling** — most SMB competitors are online-centric; this is genuinely hard to copy well.
2. **Embedded commerce/inventory (Medusa)** — orders aren't just "captured", they hit a real transactional inventory + e-commerce backbone. Unusual in this category.
3. **OSS / self-host / no-paid-Maps** — data residency + TCO story that SaaS incumbents can't match.
4. **Three first-class clients (web + Electron + mobile)** sharing one typed API + sync engine.
5. **Clean multi-tenant RBAC + audit** — enterprise-grade governance primitives already in place.

## Where Orbit is behind table-stakes (must close to compete)
1. **Attendance** (geofenced + selfie) — *every* SMB competitor has it; Orbit has none.
2. **Expense / claims**, **payment collection / ledger** — core to distribution selling.
3. **Notifications** (push + WhatsApp) — currently a stub.
4. **Recurring beat plans (PJP)** — Orbit has per-day route plans, not recurring beats.
5. **DMS / secondary sales / schemes** — required to sell to CPG/distribution.
6. **Surveys/forms**, **targets/incentives**, **BI analytics** — standard expectations.

## One-line positioning
> Orbit is the **engineering-grade, offline-first, self-hostable** field-sales platform with a real commerce backbone — strongest where data integrity, ownership, and order-to-inventory matter. To win deals it must close the **attendance / expense / payment / beat-plan / notifications** table-stakes gap that SMB incumbents (Unolo, Delta, SalesDiary) ship by default, and the **DMS + shelf-AI** depth the enterprise leaders (Bizom, BeatRoute) own.
