# Top 20 High-Impact Features — Orbit

**Date:** 2026-05-29
**Basis:** the verified gaps in `feature-completeness-audit.md` + `competitive-gap-analysis.md`. Each item is scored 1–5 on five axes:
**CV** customer value · **Moat** hard-for-competitors-to-copy · **AI** AI-driven · **Rev** revenue-generating · **Mgr** manager productivity. **Effort** = build size on the current stack (S/M/L). **Status** ties to the audit (table-stakes gap vs differentiator).

Two buckets: **(A) close table-stakes** (you can't win deals without these), **(B) differentiators** (why they switch *to you*). Build A first — they're the price of entry — but interleave the cheap differentiators that exploit your offline/commerce/OSS moat.

---

## Priority shortlist (build in this order)
1. Geofenced + selfie **Attendance** (A) — universal gap, blocks every SMB deal.
2. **Push/WhatsApp notifications** (A) — your notification layer is a stub; everything realtime depends on it.
3. **Recurring beat plans (PJP)** (A) — turns one-off route plans into the daily operating rhythm.
4. **Payment collection + outlet ledger** (A) — core to distribution selling; pairs with your transactional orders.
5. **Expense & claims** (A) — table-stakes for field teams.
6. **AI route optimisation (real provider + traffic + capacity)** (B) — you already have the seam; make it the headline.
7. **Offline-first survey/form builder** (B) — exploits your sync moat.
8. **Fraud / mock-GPS detection** (B) — exploits your tracking + audit moat.

---

## The 20

### A — Table-stakes (close the competitive gap)

**1. Geofenced + selfie attendance & leave** — CV5 Moat2 AI2 Rev3 Mgr5 · Effort M
Check-in/out with face/selfie + geofence, working-hours from `organisation_setting`, leave requests. *Why:* every competitor ships it; you have geofence + sessions already — extend `work_session`.

**2. Notification delivery (push + WhatsApp + email)** — CV5 Moat2 AI2 Rev3 Mgr5 · Effort M
Replace the stub `notification/service.ts` with a real dispatcher (FCM/APNs via Expo, WhatsApp Cloud API, SMTP) + `/notifications` API + preferences. *Why:* unlocks alerts (visit done, order synced, route assigned, geofence breach) — currently managers must refresh.

**3. Recurring beat plans / PJP** — CV5 Moat3 AI3 Rev3 Mgr5 · Effort M
Weekly/monthly recurring outlet visit schedules per rep, auto-generating daily route plans. *Why:* you have per-day route plans; the market operates on recurring beats. Feed the optimiser you already have.

**4. Payment collection + outlet ledger / outstanding** — CV5 Moat3 AI2 Rev4 Mgr4 · Effort M
Record collections against orders, track outstanding/credit per outlet, receipts. *Why:* distribution selling is order→collect; pairs naturally with your transactional `field_order`.

**5. Expense & travel claims** — CV4 Moat2 AI3 Rev2 Mgr4 · Effort M
Distance-based auto-claims from tracked km (you already store pings), receipt capture + approval workflow. *Why:* table-stakes; your GPS history makes auto-mileage a quick differentiator.

**6. Targets, incentives & gamification** — CV4 Moat3 AI3 Rev4 Mgr4 · Effort M
Per-rep targets (visits, orders, value), leaderboard, incentive calc. *Why:* drives adoption + revenue; builds on your reports module.

**7. Distributor/DMS & secondary sales** — CV4 Moat4 AI3 Rev4 Mgr3 · Effort L
Distributor hierarchy, stock at distributor, secondary sales capture, schemes/claims. *Why:* required to sell to CPG; large but high-value. Leverage Medusa for stock.

**8. ERPNext / Tally / SAP connector** — CV4 Moat4 AI1 Rev4 Mgr2 · Effort L
Implement the `ErpProvider` interface that already exists (currently no-op). *Why:* enterprise procurement requirement; the seam is built — wire a real ERPNext adapter first (OSS-aligned).

**9. BI analytics dashboards** — CV4 Moat2 AI3 Rev3 Mgr5 · Effort M
Trends, cohort/route efficiency, market coverage heatmaps (you have PostGIS). *Why:* managers expect more than counts; uses data you already collect.

**10. Server-side pagination + saved views** — CV3 Moat1 AI1 Rev1 Mgr4 · Effort S
*Why:* not glamorous, but unbounded lists (visits/orders) break at scale and hurt every manager screen. Cheap, enables everything else.

### B — Differentiators (why they switch to Orbit)

**11. AI route optimisation v2 (traffic + capacity + time windows)** — CV5 Moat4 AI5 Rev3 Mgr5 · Effort M
Default a real provider (`MAP_PROVIDER=osrm` self-hosted is free), add time windows, vehicle capacity, multi-day. *Why:* you already have the seam + 2-opt; make road/traffic-aware routing the headline. Hard to copy without your optimiser foundation.

**12. Fraud & mock-GPS detection** — CV5 Moat5 AI4 Rev2 Mgr5 · Effort M
Detect spoofed GPS, impossible travel speed, geofence anomalies, selfie liveness — surfaced in the audit log you already write. *Why:* huge trust pain in field sales; your tracking + immutable audit trail make this uniquely credible.

**13. Offline-first survey / form builder** — CV5 Moat4 AI3 Rev3 Mgr4 · Effort M
Drag-build forms (merchandising audits, competitor pricing, feedback) that sync via your existing delta engine. *Why:* exploits your offline moat; competitors' forms break offline.

**14. Shelf / planogram AI (photo recognition)** — CV5 Moat5 AI5 Rev4 Mgr4 · Effort L
On-device/cloud image recognition for shelf share, OOS, planogram compliance from a rep photo. *Why:* premium CPG feature (Bizom-tier); strong moat + revenue; pairs with your visit flow.

**15. Voice notes + AI visit summaries** — CV4 Moat4 AI5 Rev2 Mgr4 · Effort M
Rep dictates a visit note; transcribe + summarise + extract action items/next-best-action. *Why:* fast adoption win; AI moat; trivial to attach to your visit records.

**16. WhatsApp ordering & automation** — CV5 Moat4 AI4 Rev5 Mgr3 · Effort M
Retailers order via WhatsApp → lands as a `field_order` (you have the order pipeline); automated order confirmations/reminders. *Why:* revenue-generating, sticky, exploits your commerce backbone.

**17. AI next-best-action / sales nudges** — CV5 Moat4 AI5 Rev4 Mgr4 · Effort M
Per-rep, per-outlet suggestions (upsell, reorder timing, churn-risk outlets) from your order/visit history. *Why:* BeatRoute-tier guided selling; differentiator + revenue.

**18. Real-time geofence/SLA alerts to managers** — CV4 Moat3 AI3 Rev2 Mgr5 · Effort S
Once #2 ships: push a manager alert on geofence breach, missed beat, long idle, big order. *Why:* turns your live tracking from passive map into active management. Cheap on top of WS + notifications.

**19. White-label + self-host marketplace** — CV4 Moat5 AI1 Rev4 Mgr1 · Effort M
Lean into OSS: white-label branding (you already templatized the logo), one-click self-host, BYO-Maps/BYO-ERP. *Why:* a positioning no SaaS incumbent can match; opens data-residency-sensitive markets.

**20. Predictive replenishment / auto-suggest orders** — CV5 Moat5 AI5 Rev5 Mgr3 · Effort L
Forecast each outlet's reorder from order history + seasonality; pre-fill the order cart. *Why:* highest revenue lever (bigger baskets), strong AI moat, builds directly on your transactional order + inventory data.

---

## Scoring rollup (highest combined value first)
| # | Feature | CV | Moat | AI | Rev | Mgr | Sum | Effort |
|---|---|---|---|---|---|---|---|---|
| 20 | Predictive replenishment | 5 | 5 | 5 | 5 | 3 | 23 | L |
| 14 | Shelf/planogram AI | 5 | 5 | 5 | 4 | 4 | 23 | L |
| 11 | AI route optimisation v2 | 5 | 4 | 5 | 3 | 5 | 22 | M |
| 12 | Fraud / mock-GPS detection | 5 | 5 | 4 | 2 | 5 | 21 | M |
| 16 | WhatsApp ordering | 5 | 4 | 4 | 5 | 3 | 21 | M |
| 17 | AI next-best-action | 5 | 4 | 5 | 4 | 4 | 22 | M |
| 13 | Offline survey builder | 5 | 4 | 3 | 3 | 4 | 19 | M |
| 1 | Attendance + leave | 5 | 2 | 2 | 3 | 5 | 17 | M |
| 4 | Payment + ledger | 5 | 3 | 2 | 4 | 4 | 18 | M |
| 2 | Notifications delivery | 5 | 2 | 2 | 3 | 5 | 17 | M |
| 7 | Distributor/DMS | 4 | 4 | 3 | 4 | 3 | 18 | L |

> **Read this as:** the *highest-scoring* items (predictive replenishment, shelf AI, AI routing, fraud detection, WhatsApp ordering, next-best-action) are your **differentiators and lean on moats you already have** (offline sync, tracking+audit, commerce backbone, route optimiser). But you must **ship the table-stakes block first** (attendance, notifications, beat plans, payments, expense) or you won't get into the evaluations where the differentiators win. Sequence: table-stakes to qualify → AI/commerce differentiators to close.
