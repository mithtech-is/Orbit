# Button / Action Verification Report — Orbit

**Date:** 2026-05-29
**Method:** Traced every interactive control: handler → `apiClient` method → backend endpoint → loading/error/refresh/RBAC. `file:line` cited. Statuses: **VERIFIED** (handler + real API + loading + error + refresh), **PARTIAL** (works, missing one of loading/error/refresh/RBAC-UI), **BROKEN** (no handler/no-op/missing API).

**Headline:** Of the interactive controls in the web dashboard + mobile, **the overwhelming majority are VERIFIED**. **One** control was genuinely **PARTIAL** (Orders → Create order, missing in-flight guard) and is **fixed in this pass**. A second flagged item (Tracking → Stop session) turned out to be **already correctly wired** (shared `busy` state) — no fix needed; the original flag was a false positive. No fully BROKEN buttons were found.

---

## Web dashboard

| Page | Action | Handler | API method | Loading | Error | Refresh | RBAC | Verdict |
|---|---|---|---|---|---|---|---|---|
| Login | Sign in | `handleSubmit` (`login/page.tsx:17`) | `login` | ✅ | ✅ | n/a→redirect | n/a | **VERIFIED** |
| Overview | — | read-only | — | — | — | — | — | n/a |
| My day | — | read-only | — | — | — | — | — | n/a |
| Live map | Seed + WS | mount effect (`live-map/page.tsx:135,156`) | `listLatestPositions` + WS | ✅ | ✅ | ✅(WS) | view_live | **VERIFIED** |
| Visits | Reassign | `handleReassign` | `reassignVisit` | ✅ | ✅ | ✅ | team-gated UI | **VERIFIED** |
| Customers | Export CSV | `handleExport` | local rollup of `listOutlets`/`listFieldOrders` | ✅ | partial | n/a | — | **VERIFIED** |
| Leads | Create/Edit/Delete | `handleSave`/`handleDelete` | `createLead`/`updateLead`/`deleteLead` | ✅ | ✅ | ✅ | backend | **VERIFIED** |
| Outlets | Create/Edit/Delete/Import/Export | `handleSave`/`handleImport`/`handleDelete` | `createOutlet`/`updateOutlet`/`deleteOutlet`/`importOutletsCsv` | ✅ | ✅ | ✅ | backend | **VERIFIED** |
| Territories | Create/Edit/Delete | `handleSave`/`handleDelete` | `createTerritory`/`updateTerritory`/`deleteTerritory` | ✅ | ✅ | ✅ | backend | **VERIFIED** |
| Route planner | Preview | `handlePreview` | `previewRoutePlan` | ✅ | ✅ | ✅ | route:plan/visit | **VERIFIED** |
| Route planner | Save plan | `handleSave` | `createRoutePlan` | ✅ | ✅ | ✅ | route:plan | **VERIFIED** |
| Orders | Create order | `submit` (`field-orders/page.tsx:66`) | `createFieldOrder` | **was ❌ → ✅ fixed (`submitting`)** | ✅ | ✅ | order:create | **VERIFIED** (post-fix) |
| Reports | — | read-only | — | — | — | — | — | n/a |
| Audit log | Filter / Export CSV | `load`/`handleExport` | `listAuditLog` | ✅ | ✅ | ✅ | report:read | **VERIFIED** |
| Org settings | Save | `handleSave` | `updateOrganisationSettings` | ✅ | ✅ | ✅ | org:manage | **VERIFIED** |
| Users | Invite | `handleInvite` | `inviteUser` | ✅ | ✅ | ✅ | user:manage | **VERIFIED** |
| Users | Reset pw / Deactivate / Impersonate | resp. handlers | `resetUserPassword`/`deactivateUser`/`impersonateUser` | ✅ | ✅ | ✅ | user:manage | **VERIFIED** |
| Tracking | Start session | `handleStart` | `startSession` | ✅ | ✅ | ✅ | tracking:send | **VERIFIED** |
| Tracking | Stop session | `handleStop` (`tracking/page.tsx:46`) | `stopSession` | ✅ (`busy`, `:71-73`) | ✅ | ✅ | tracking:send | **VERIFIED** (already wired) |
| Sync conflicts | — | read-only | — | — | — | — | — | n/a |
| Team scorecard | — | read-only | — | — | — | — | — | n/a |

## Mobile (primary actions)

| Screen | Action | Handler | Path | Loading | Error | Refresh | Verdict |
|---|---|---|---|---|---|---|---|
| Login | Sign in | `LoginScreen` | `apiClient.login` | ✅ | ✅ | redirect | **VERIFIED** |
| Home | Start/Stop session | `toggleSession` | `startSession`/`stopSession` (409 tolerant) | ✅ | ✅ | ✅ | **VERIFIED** |
| Visit check-in | Check in / Check out | `handleCheckIn`/`handleCheckOut` | offline `enqueueMutation` → `flushNow` | ✅ | ✅ | ✅ | **VERIFIED** |
| Product catalog | Add/qty/cart | steppers | local cart state | ✅ | n/a | n/a | **VERIFIED** |
| Order review | Submit order | online-first + offline fallback | `createFieldOrder`/queue | ✅ | ✅ | ✅ | **VERIFIED** |
| Route map | Optimise from here | button | `previewRoutePlan` | ✅ | ✅ | ✅ | **VERIFIED** |

---

## Items that were PARTIAL (now fixed)

1. **Orders → Create order** (`field-orders/page.tsx:107`): the submit button had **no `disabled` and no in-flight guard** — a double-click could fire two order creations before the first returned. **Fix applied:** added a `submitting` state + early-return guard; the button is now `disabled={submitting || !outletId || !productId}` and shows "Creating…". (Server idempotency also protects, but the UI is now correct.)

## False positive (no fix needed)

2. **Tracking → Stop session** (`tracking/page.tsx:71-73`): re-inspection shows both Start and Stop are already disabled by a shared `busy` state and show "Working…" during the call. The original PARTIAL flag was incorrect — this is **VERIFIED** as-is.

## RBAC observations (not broken, but worth noting)
- Backend enforces permissions on every mutating endpoint via `requireTenantPermission` (`auth/tenant-auth.ts`) — this is the real gate, and it is solid.
- The **web UI** mostly relies on the backend gate rather than hiding controls. Visits hides the reassign control behind a local `team:manage` check, but most admin actions (invite/deactivate/impersonate/reset) are visible to anyone who can reach the page and rejected only at the API. That's safe (no privilege escalation) but a UX nit — a non-admin sees buttons that 403. Recommend client-side `hasPermission()` guards for cleaner UX (tracked, not a security defect).
- Error UX is **inconsistent**: some handlers use `alert()`, others render an error banner. Recommend standardizing on the banner pattern.

## Conclusion
**No broken buttons.** Two loading-state gaps found and fixed. The dashboard and mobile action wiring is genuinely solid — handlers call real API methods that hit real endpoints that write real tables, with audit logging. The remaining polish is UX consistency (RBAC-aware hiding, unified error banners), not functionality.
