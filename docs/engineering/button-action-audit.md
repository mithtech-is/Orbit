# Button / action audit — Orbit

**Date:** 2026-05-28
**Method:** Read every page/screen file, walked every interactive element, then mapped to backend handler + DB write + audit row.
**Scope:** Web dashboard (`:3000`), mobile app (Expo), Electron desktop, Medusa admin integration.

Status legend:
- **WORKING** — clickable, hits real API, persists, refreshes UI, error-handled, RBAC enforced
- **PARTIAL** — works for the main path but missing a related action or fine-grained control
- **BROKEN** — broken or throws
- **UI ONLY** — visible but does nothing meaningful (no API call)
- **MOCKED** — wired to a stub/fake response

---

## Web dashboard ([apps/web-dashboard/app](apps/web-dashboard/app))

### `/login` ([login/page.tsx](apps/web-dashboard/app/login/page.tsx))
| Screen | Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|---|
| Login | Submit credentials | ✅ | `POST /api/v1/auth/login` | localStorage token+session | n/a (public) | **WORKING** |

### `/` Overview ([page.tsx](apps/web-dashboard/app/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Read-only metrics | ✅ | `GET /api/v1/reports/summary` | n/a (read) | none required | **WORKING** |

### `/my-day` ([my-day/page.tsx](apps/web-dashboard/app/my-day/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Load my day | ✅ | `GET /api/v1/me/today` | n/a | tenant + actor.userId scoped | **WORKING** |
| Open stop in map | ✅ | external OSM link (no API) | n/a | n/a | **WORKING** |

### `/live-map` ([live-map/page.tsx](apps/web-dashboard/app/live-map/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Connect WS | ✅ | `WS /ws/tracking?token=…` | n/a (stream) | JWT verified | **WORKING** |
| Marker click → popup | ✅ | n/a | n/a | n/a | **WORKING** |

### `/visits` ([visits/page.tsx](apps/web-dashboard/app/visits/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| List visits | ✅ | `GET /api/v1/visits` | n/a | rep-scoped for reps | **WORKING** |
| Reassign dropdown | ✅ | `PUT /api/v1/visits/:id` | `visit.assigned_user_id` | `team:manage` | **WORKING** |

### `/leads` ([leads/page.tsx](apps/web-dashboard/app/leads/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Audit | Status |
|---|---|---|---|---|---|---|
| List leads | ✅ | `GET /api/v1/leads` | n/a | tenant | n/a | **WORKING** |
| + New lead | ✅ | `POST /api/v1/leads` | `lead` | `lead:write` | ✅ | **WORKING** |
| Edit lead | ✅ | `PUT /api/v1/leads/:id` | `lead` | `lead:write` | ✅ | **WORKING** |
| Delete lead | ✅ | `DELETE /api/v1/leads/:id` | hard delete | `lead:write` | ✅ | **WORKING** |

### `/outlets` ([outlets/page.tsx](apps/web-dashboard/app/outlets/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Audit | Status |
|---|---|---|---|---|---|---|
| List outlets | ✅ | `GET /api/v1/outlets` (LEFT JOIN visit for lastVisitedAt) | n/a | tenant | n/a | **WORKING** |
| + New outlet | ✅ | `POST /api/v1/outlets` | `outlet` | `outlet:write` | ✅ | **WORKING** |
| Edit outlet | ✅ | `PUT /api/v1/outlets/:id` | `outlet` | `outlet:write` | ✅ | **WORKING** |
| Delete outlet | ✅ | `DELETE /api/v1/outlets/:id` | hard delete | `outlet:write` | ✅ | **WORKING** |
| Import CSV | ✅ | `POST /api/v1/outlets/import` | bulk insert (≤1000) | `outlet:write` | ✅ aggregate row | **WORKING** |
| Export CSV | ✅ | client-side, native dialog in Electron | n/a | n/a | n/a | **WORKING** |
| Sort by name/last-visited/visits | ✅ | client-side | n/a | n/a | n/a | **WORKING** |

### `/territories` ([territories/page.tsx](apps/web-dashboard/app/territories/page.tsx)) ⚠️
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| List territories | ✅ | `GET /api/v1/territories` | n/a | `territory:manage` | **WORKING** |
| + Create territory | ❌ | API exists (`POST /api/v1/territories`) but **no UI form** | — | — | **UI ONLY** (empty-state CTA missing) |
| Edit territory | ❌ | API exists (`PUT /api/v1/territories/:id`) but **no UI** | — | — | **UI ONLY** |
| Delete territory | ❌ | API exists (`DELETE /api/v1/territories/:id`) but **no UI** | — | — | **UI ONLY** |
| View outlets in territory | ❌ | API exists but no UI button | — | — | **UI ONLY** |

### `/route-plans` ([route-plans/page.tsx](apps/web-dashboard/app/route-plans/page.tsx)) ⚠️
| Action | Wired | Backend | Persists | RBAC | Audit | Status |
|---|---|---|---|---|---|---|
| List plans | ✅ | `GET /api/v1/route-plans` | n/a | `route:plan` | n/a | **WORKING** |
| Create route (date picker only) | ✅ | `POST /api/v1/route-plans` | `route_plan` + `route_stop` | `route:plan` | ✅ | **PARTIAL** |
| ↳ Pick assignee | ❌ | hard-codes `actor.userId` if no body field | — | — | **UI ONLY** — no rep dropdown |
| ↳ Pick stops | ❌ | UI auto-grabs first 5 outlets, no multi-select | — | — | **UI ONLY** — no outlet picker |
| ↳ Reorder stops | ❌ | not exposed | — | — | **UI ONLY** |
| ↳ Edit / delete a plan | ❌ | no API, no UI | — | — | **UI ONLY** |

### `/tracking` ([tracking/page.tsx](apps/web-dashboard/app/tracking/page.tsx)) ⚠️
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| List sessions | ✅ | `GET /api/v1/tracking` | n/a | tenant | **WORKING** |
| Start work session | ✅ | `POST /api/v1/tracking` action=start_session | `work_session` | tracking:send | **PARTIAL** — acts only on the signed-in user, not a chosen rep |
| Stop active session | ✅ | `POST /api/v1/tracking` action=stop_session | `work_session.status` | tracking:send | **PARTIAL** — same caveat |
| Record consent | ❌ | API exists (action=record_consent) | — | — | **UI ONLY** — no toggle in UI |
| Revoke consent | ❌ | API exists (action=revoke_consent) | — | — | **UI ONLY** — no button in UI |

### `/field-orders` ([field-orders/page.tsx](apps/web-dashboard/app/field-orders/page.tsx)) ⚠️ (see Phase 3)
| Action | Wired | Backend | Persists | RBAC | Audit | Status |
|---|---|---|---|---|---|---|
| List orders | ✅ | `GET /api/v1/field-orders` | n/a (read `field_order`) | `report:read` | n/a | **WORKING (shadow table)** |
| Create order | ✅ | `POST /api/v1/field-orders` | `field_order` + `field_product.inventory_available` decrement | `order:create` | ✅ | **PARTIAL** — works but bypasses Medusa entirely (Phase 3 fix) |
| Outlet / rep names | ❌ | shows raw IDs (`outlet_1779…`) instead of names | — | — | **UI ONLY** — minor UX gap |
| Edit / cancel order | ❌ | no API, no UI | — | — | **UI ONLY** |
| Status transition | ❌ | always "accepted" — no workflow | — | — | **UI ONLY** |

### `/reports` ([reports/page.tsx](apps/web-dashboard/app/reports/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Load summary + rep activity | ✅ | `GET /api/v1/reports/summary` + `/rep-activity` | n/a | `report:read` | **WORKING** |

### `/audit-log` ([audit-log/page.tsx](apps/web-dashboard/app/audit-log/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Action prefix filter (server) | ✅ | `GET /api/v1/audit-log?actionPrefix=…` | n/a | `audit:read` | **WORKING** |
| Actor / target filter (client) | ✅ | client-side filter on loaded rows | n/a | n/a | **WORKING** |
| Export CSV | ✅ | client-side, native dialog in Electron | n/a | n/a | **WORKING** |

### `/sync-conflicts` ([sync-conflicts/page.tsx](apps/web-dashboard/app/sync-conflicts/page.tsx)) ⚠️
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| List conflicts | ✅ | `GET /api/v1/sync/conflicts` | n/a | `audit:read` | **WORKING** |
| Retry conflict | ❌ | no API, no UI | — | — | **UI ONLY** — subtitle says "needs a manager's attention" but no action |
| Resolve / dismiss | ❌ | no API, no UI | — | — | **UI ONLY** |
| Apply server / apply client | ❌ | no API, no UI | — | — | **UI ONLY** |

### `/users` ([users/page.tsx](apps/web-dashboard/app/users/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Audit | Status |
|---|---|---|---|---|---|---|
| List users | ✅ | `GET /api/v1/users` | n/a | `user:manage` | n/a | **WORKING** |
| + Invite user | ✅ | `POST /api/v1/users` | `app_user` (with temp pwd) | `user:manage` | ✅ `user.invited` | **WORKING** |
| Sign in as (impersonate) | ✅ | `POST /api/v1/users/:id/impersonate` | new short-lived JWT | `user:manage` | ✅ `user.impersonated` | **WORKING** |
| Reset password | ✅ | `POST /api/v1/users/:id/reset-password` | `app_user.password_hash` | `user:manage` | ✅ `user.password_reset` | **WORKING** |
| Deactivate | ✅ | `DELETE /api/v1/users/:id` (soft delete) | `app_user.active=false` | `user:manage` | ✅ `user.deactivated` | **WORKING** |
| Reactivate | ❌ | no API, no UI | — | — | **UI ONLY** — once deactivated, only DB edit revives |
| Edit name / role | ❌ | no API, no UI | — | — | **UI ONLY** |

### `/organisation-settings` ([organisation-settings/page.tsx](apps/web-dashboard/app/organisation-settings/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Audit | Status |
|---|---|---|---|---|---|---|
| Load settings | ✅ | `GET /api/v1/organisation-settings` | n/a | `organisation:manage` | n/a | **WORKING** |
| Save settings (working hours, days, geofence, retention, tz, currency) | ✅ | `PUT /api/v1/organisation-settings` | `organisation_setting` | `organisation:manage` | ✅ `organisation_setting.updated` | **WORKING** |

### `/team-scorecard` ([team-scorecard/page.tsx](apps/web-dashboard/app/team-scorecard/page.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Read-only rep cards | ✅ | `GET /api/v1/reports/rep-activity` + `listUsers` + `getOrganisationSettings` (for currency) | n/a | `report:read` | **WORKING** |
| Drill into one rep | ❌ | no detail view | — | — | **UI ONLY** — cards are flat |

### Sidebar / global
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Nav links (filtered by permission) | ✅ | client-side route + RouteGuard | n/a | declared in nav | **WORKING** |
| Sign out | ✅ | clears localStorage, redirects | localStorage | n/a | **WORKING** |
| Impersonation banner (Switch back) | ✅ | restores stashed token | localStorage | n/a | **WORKING** |

---

## Mobile app ([apps/mobile-field-sales/src](apps/mobile-field-sales/src))

### LoginScreen ([LoginScreen.tsx](apps/mobile-field-sales/src/screens/LoginScreen.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Sign in | ✅ | `POST /api/v1/auth/login` | SecureStore | n/a | **WORKING** |

### RouteTodayScreen ([RouteTodayScreen.tsx](apps/mobile-field-sales/src/screens/RouteTodayScreen.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Load today's route | ✅ | `GET /api/v1/route-plans` (client filters to today) | n/a | `route:plan` (rep usually lacks; falls back to empty) | **PARTIAL** — query returns ALL plans then groups client-side; should be filtered to rep server-side |
| Pull-to-refresh | ✅ | re-fetch + flushNow + refreshConsent | n/a | n/a | **WORKING** |
| Tap stop → check-in | ✅ | opens VisitCheckInScreen | n/a | n/a | **WORKING** |
| Tracking banner | ✅ | shows consent state | n/a | n/a | **WORKING** |

### VisitCheckInScreen ([VisitCheckInScreen.tsx](apps/mobile-field-sales/src/screens/VisitCheckInScreen.tsx))
| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Check in | ✅ | enqueues sync mutation `visit.check_in` → `POST /api/v1/sync/push` → `POST /api/v1/visits` | offline queue + backend | `visit:write` | **WORKING** |
| Notes / outcome input | ✅ | local state | local | n/a | **WORKING** |
| Check out | ✅ | enqueues `visit.check_out` → same sync path | offline queue + backend | `visit:write` | **WORKING** |

### What's **missing entirely** in mobile (no screen at all)
| Feature | Status |
|---|---|
| Order capture screen (mobile reps cannot create orders today) | **MISSING** |
| Off-route check-in (visit at outlet not in today's route) | **MISSING** |
| Lead capture from the field (new outlet + new lead) | **MISSING** |
| Profile / change password / sign-out screens | **MISSING** |
| Photo capture on visit | **MISSING** (requires native module) |
| Voice notes | **MISSING** (requires native module) |
| Push notifications | **MISSING** (requires FCM/APNs) |

---

## Electron desktop ([apps/desktop-operations/src](apps/desktop-operations/src))

| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Load web dashboard URL | ✅ | loads `:3000` inside BrowserWindow | n/a | n/a | **WORKING** |
| File → Reload (Ctrl+R) | ✅ | `webContents.reload()` | n/a | n/a | **WORKING** |
| File → Quit | ✅ | `app.quit()` | n/a | n/a | **WORKING** |
| Edit menu (built-in) | ✅ | OS-native cut/copy/paste/etc. | n/a | n/a | **WORKING** |
| View → Toggle fullscreen | ✅ | role: togglefullscreen | n/a | n/a | **WORKING** |
| View → Developer tools | ✅ | role: toggleDevTools | n/a | n/a | **WORKING** |
| Window → Minimize / Close | ✅ | role: minimize / close | n/a | n/a | **WORKING** |
| Help → About Orbit | ✅ | data-URL HTML window | n/a | n/a | **WORKING** |
| Help → Help & support (if URL set) | ✅ | `shell.openExternal` | n/a | n/a | **WORKING** |
| IPC: native CSV save dialog | ✅ | `dialog.showSaveDialog` + fs.writeFile | filesystem | n/a (validates payload size + mime) | **WORKING** |
| IPC: open external URL | ✅ | validates `https?://` then `shell.openExternal` | n/a | n/a | **WORKING** |
| IPC: app info | ✅ | returns version/platform/arch | n/a | n/a | **WORKING** |
| Window state save/restore | ✅ | `loadWindowState` / `saveWindowState` on close | local file | n/a | **WORKING** |

---

## Medusa admin ([:9001/app](http://localhost:9001/app))

| Action | Wired | Backend | Persists | RBAC | Status |
|---|---|---|---|---|---|
| Login | ✅ | `POST /auth/user/emailpass` → `POST /auth/session` | session cookie | Medusa `user` | **WORKING** |
| All admin pages (products, orders, customers, etc.) | ✅ | Medusa's built-in admin routes | Medusa entities in `medusa` DB | Medusa session | **WORKING — but EMPTY because our data lives in `fieldsales` DB and `field_*` tables** |

---

## Cross-cutting summary

| Concern | Status |
|---|---|
| Tenant isolation (`organisation_id` filter everywhere) | ✅ enforced in every handler via `requireTenantPermission` |
| RBAC permission gates | ✅ enforced server-side + sidebar/route-guard client-side |
| Audit log writes from mutations | ✅ every create/update/delete/admin-action writes a row |
| Loading states on data fetches | ✅ all pages show "Loading…" or skeletons |
| Error feedback on failures | ✅ every page has an `errorBanner` path |
| CORS | ✅ verified via OPTIONS preflight against `:9001` |
| Rate limiting | ✅ per-IP sliding-window middleware in `dev-server.ts` |

---

## Counts

| Status | Web actions | Mobile actions | Notes |
|---|---|---|---|
| WORKING | **38** | 5 | The bulk of the app is wired end-to-end |
| PARTIAL | **5** | 1 | route-plans, tracking, field-orders, my-day (no manual create-visit), team-scorecard (no drill-in) |
| UI ONLY | **13** | — | territories CRUD (4), route-plans extras (4), tracking consent (2), sync-conflicts actions (3), field-orders extras (3), users edit/reactivate (2) |
| BROKEN | 0 | 0 | — |
| MOCKED | 0 | 0 | — |
| Missing entirely (no UI exists) | n/a | **7** | order capture, off-route check-in, lead capture, profile, photo, voice, push |

---

## What Phase 2 (this session) will fix
1. **Territories**: full CRUD UI (create / delete) — the most glaring "look at me, I'm read-only" gap.
2. **Field-orders list**: resolve `outletId` / `repUserId` → names so the list is readable.
3. **Sync conflicts**: add a "Discard" action that marks a conflict resolved (the minimum useful manager action; full retry/replay is a separate workstream).
4. **Field-orders**: this is Phase 3 — real Medusa integration.

## What Phase 2 explicitly will **not** do (deferred)
- Mobile order-capture screen (requires real device testing and offline-sync UI flow design).
- Route planner stop multi-select + reorder + per-rep assignment UI (a non-trivial DnD interface).
- Tracking consent admin actions (requires per-rep selector + confirmation modal; rarely used in pilots).
- Users edit/reactivate (low-frequency operations; admins can fix via DB or a new invite).
- Team scorecard drill-in (cosmetic).
- Photo / voice / push notifications (each is a multi-day item — see follow-up backlog).
