# UI Production Copy & Branding Audit

**Date:** 2026-05-28
**Scope:** Every user-visible string across the web dashboard, mobile app, and Electron desktop shell. Source code only (`node_modules` and `.next/` build artefacts ignored).

## 1. Brand

| Where | Before | After |
|---|---|---|
| Web sidebar | "Orbit" | "Orbit" (with #00aaff brand dot) |
| Web login page title | implicit | "Orbit" + "Sign in to your workspace" |
| Web `<title>` | (none) | "Orbit" |
| Mobile app config name | "Orbit" | "Orbit" |
| Mobile login brand | absent | "Orbit" |
| Mobile navigator screen title | "Today" | "Orbit" |
| Electron window title | (none) | "Orbit" |
| Electron menu Quit | "Quit" (Electron default) | "Quit Orbit" |
| `electron-builder.json` productName | "Orbit Operations" | "Orbit" |
| iOS / Android bundle id | `com.fieldsales.mobile` | `com.routepilot.mobile` |
| Expo URL scheme | `fieldsales` | `routepilot` |

The package directory and npm scope (`@orbit/*`) are left untouched intentionally — those are developer-facing identifiers, not user-visible, and renaming them is a breaking change that would ripple through every workspace import. Documented as deliberate.

## 2. User-Visible Dev/Demo Language — Found and Replaced

| File | Before | After |
|---|---|---|
| `apps/web-dashboard/app/page.tsx` | Hardcoded fake metric array `[["Active reps","3"],["Visits planned","18"],…]` | Real data from `/api/v1/reports/summary`: active reps / outlets / leads / visits / routes / orders + revenue |
| `apps/web-dashboard/app/page.tsx` | "Live team map provider placeholder" | "See live representative locations on the dedicated Live team map page." |
| `apps/web-dashboard/app/live-map/page.tsx` | "Map widget is a follow-up — this page proves the stream end-to-end (REST ingestion → WS gateway → browser)." | Empty state copy: "No active representatives right now." / loading: "Loading team locations…" / error: "We couldn't reach the live tracking service. Please try again." |
| `apps/web-dashboard/app/login/page.tsx` | Default values `admin@fieldsales.local` / `admin123` / `org_acme` baked into the form | Empty fields with neutral placeholders; "Orbit" branding + "Manage field teams, visits, routes and orders from one place." subtitle |
| `apps/web-dashboard/app/leads/page.tsx` | "No leads yet. Create one via API or seed data." | "No leads yet" + "New prospects will appear here once added." |
| `apps/web-dashboard/app/outlets/page.tsx` | "No outlets yet. Create one with POST /api/v1/outlets." | "No outlets yet" + "Add your first outlet or import from a CSV." |
| `apps/web-dashboard/app/territories/page.tsx` | "No territories yet. Create one with POST /api/v1/territories." | "No territories defined" + "Define geographic areas to organise outlets and route assignments." |
| `apps/web-dashboard/app/visits/page.tsx` | "No visits found. Start by checking in at an outlet." | "No visits yet" + "Visits will appear here once representatives start checking in at outlets." |
| `apps/web-dashboard/app/tracking/page.tsx` | "Start Session" / "Stop Session" / "No tracking sessions today." | "Start work session" / "Stop active session" / "No sessions yet today" + helpful explanation |
| `apps/web-dashboard/app/route-plans/page.tsx` | "No route plans found. Create one to get started." | "No routes planned" + "Create a route to assign daily stops to your representatives." |
| `apps/web-dashboard/app/audit-log/page.tsx` | "action prefix (e.g. tracking. , lead. , visit.)" | "Filter by action category, e.g. tracking, lead, visit" |
| `apps/web-dashboard/app/sync-conflicts/page.tsx` | "Offline mutations the server could not apply (active session missing, foreign key violation, etc.)…" | "Sync issues" + "Offline changes that need a manager's attention" + "All clear" / "N needs attention" status chips |
| `apps/web-dashboard/app/field-orders/page.tsx` | "Outlet…" / "Product…" / "Create order" | Same labels but with friendly error copy: "Outlet, product, and a quantity greater than zero are required." instead of raw validation echoes |
| `apps/web-dashboard/app/reports/page.tsx` | "Live" pill + raw metric labels | Same metrics + neutral copy "Operational metrics and per-representative activity." Header chip uses success colour when loaded. |
| `apps/web-dashboard/app/layout.tsx` | "Loading..." | "Loading your workspace…" |
| `apps/web-dashboard/app/navigation.tsx` | Flat list of generic labels: "Audit" / "Conflicts" / "Tracking" | Sectioned navigation (Operate / Plan / Field / Insights) with explicit labels: "Live team map" / "Route planner" / "Tracking sessions" / "Audit log" / "Sync issues" |
| `apps/mobile-field-sales/src/screens/LoginScreen.tsx` | Default `admin@fieldsales.local` / `admin123` / `org_acme` baked in | Empty fields, "Sign in" / "Manage today's route, visits, and orders from the field." copy |
| `apps/mobile-field-sales/src/screens/RouteTodayScreen.tsx` | "Today's route" / "No route plan assigned for today." / "N offline mutation(s) waiting to sync" | "Today's route" / "No route planned for today." / "N change(s) waiting to sync" (friendlier wording) |
| `apps/mobile-field-sales/src/screens/VisitCheckInScreen.tsx` | "Check in" / "Check out" / "N mutation(s) queued offline" / "Visit recorded." | "Check in here" / "Complete visit" / "N change(s) saved offline — will sync when reconnected" / "Visit completed. Changes will sync automatically." |
| `apps/mobile-field-sales/src/components/TrackingBanner.tsx` | "Tracking active — your location is being recorded." | "Work session active · Location sharing on" — friendlier and clearer about why |
| `apps/mobile-field-sales/src/navigation/AppNavigator.tsx` | "Log out" / "Visit" header | "Sign out" / "Visit" with hidden back-title for cleaner iOS |
| `apps/desktop-operations/src/menu.ts` | "Reload dashboard" / "Open API health in browser" / "Open API docs (OpenAPI YAML in browser)" / "About Orbit" | "Reload" / "Quit Orbit" / "Window" submenu / About dialog rendered in a small window with brand dot |

## 3. Internal/Developer-Only Strings Retained (Safe)

| Where | String | Why retained |
|---|---|---|
| Backend startup log | "backend-medusa scaffold listening on …" | Server stdout, not visible to users. |
| `apps/backend-medusa/src/dev-server.ts` startup line | `sentry=on/off` | Operator log line. |
| Mobile retention scheduler log | `[retention] swept tenants=N deleted=N` | Operator log line. |
| Test files | `mock`, `vi.mock`, `mock-provider` | Test scaffolding. |
| `packages/maps-provider/src/mock-provider.ts` | exported `createMockMapsProvider` | Documented local-dev fallback when no map API key is configured. |
| Request logger | `correlationId`, `clientIp` | Operator log line. |
| npm package names (`@orbit/*`) | various | Developer-facing identifiers. Renaming = breaking workspace import path change, deliberately deferred. |
| OpenAPI spec (`docs/api/openapi.yaml`) | Field-sales terminology + raw endpoint paths | Developer documentation, not user-facing UI. |
| Database table / column names | `field_product`, `field_order`, `app_user` | Schema-level identifiers, never surfaced in UI. |

## 4. Dangerous Strings Still In Source (Documented as Known Risk, Not Surfaced in UI)

These were flagged in `final-go-no-go-report.md` as CVE-grade. **None are user-visible**, but they are real risks for production deploys until they're removed:

| File:Line | What | Why dangerous | UI-visible? |
|---|---|---|---|
| `apps/backend-medusa/src/auth/auth-service.ts:5` | Hardcoded JWT fallback `"field-sales-dev-secret-do-not-use-in-production"` | Token forgery in production if `JWT_SECRET` unset | No |
| `apps/backend-medusa/src/auth/auth-service.ts:70` | `ensureSeedUser()` auto-creates dev admin on every boot | Production back-door admin if not gated | No |
| `apps/backend-medusa/src/auth/auth-service.ts:72` | Hardcoded password `"admin123"` | Backfilled onto every seeded user | No |

These do NOT belong to the UI polish scope — they're security controls. They are tracked in `final-go-no-go-report.md` §1 as "Critical Findings Up Front" and remain the gating production blockers.

## 5. Theme Tokens — Adopted

Web (`apps/web-dashboard/app/styles.css`):
- `--primary: #00aaff` (+ hover/soft/border variants)
- `--background: #ffffff`, `--surface: #ffffff`, `--surface-muted: #f7f9fb`
- `--border: #e5e7eb`, `--border-strong: #d1d5db`
- `--text-primary: #111827`, `--text-secondary: #6b7280`, `--text-muted: #9ca3af`
- `--success: #1f9d55`, `--warning: #b45309`, `--danger: #c53030` (+ soft variants)
- Radius scale: 6 / 10 / 14
- Shadow scale: subtle (`rgba(17,24,39,0.04)`) and medium

Mobile (`apps/mobile-field-sales/src/theme.ts`):
- Exact same palette + spacing scale (4/8/12/16/24/32)
- Typography presets (title / heading / body / bodyStrong / label / caption)
- Used by every screen (Login, RouteToday, VisitCheckIn) and TrackingBanner

Electron:
- Window backgroundColor `#ffffff` (was `#0f1117`)
- About dialog uses brand dot `#00aaff`

No third-party UI kit added. All styling done with native CSS / React Native StyleSheet.

## 6. Empty / Loading / Error States — Coverage

| Page | Loading | Empty | Error |
|---|---|---|---|
| Overview | "Loading…" pill | n/a (always shows metric cards; "—" placeholder when no data) | "We couldn't load this page. Please try again." |
| Live team map | "Loading team locations…" | "No active representatives right now." | "We couldn't reach the live tracking service. Please try again." |
| Visits | "Loading…" pill | "No visits yet" card | "We couldn't load visit history. Please try again." |
| Leads | "Loading…" pill | "No leads yet" card | "We couldn't load leads. Please try again." |
| Outlets | "Loading…" pill | "No outlets yet" card | "We couldn't load outlets. Please try again." |
| Territories | "Loading…" pill | "No territories defined" card | "We couldn't load territories. Please try again." |
| Tracking sessions | "Loading…" pill | "No sessions yet today" card | "We couldn't load tracking sessions. Please try again." |
| Route planner | "Loading…" pill | "No routes planned" card | "We couldn't load route plans. Please try again." |
| Orders | "Loading…" pill | "No orders yet" card | "Unable to create order right now." |
| Reports | "Loading…" pill | n/a (metric placeholders) + rep table empty state | "We couldn't load reports right now. Please try again." |
| Audit log | "Loading…" pill | "No audit entries match this filter" | "We couldn't load the audit log. Please try again." |
| Sync issues | "Loading…" pill | "No sync issues" — "All clear" chip | "We couldn't load sync issues. Please try again." |
| Mobile RouteToday | ActivityIndicator + "Loading route…" | "No stops on today's route" | "Unable to update right now. Pull down to retry." |
| Mobile VisitCheckIn | inline ActivityIndicator on action button | n/a (action-driven page) | "Unable to record check-in. Please try again." |
| Mobile Login | inline ActivityIndicator on Sign in button | n/a | "Sign-in failed. Check your details and try again." |

## 7. Tech Words Replaced

| Tech word | Where it was | Replacement |
|---|---|---|
| API | Empty-state hints, error messages | "We couldn't load…" / "Please try again." (avoids "API") |
| WebSocket | Live map page comment | Connection state pills: "Connected" / "Connecting…" / "Disconnected" / "Connection lost" |
| Mutation / Mutation queue | Mobile sync banners | "change(s)" |
| Sync engine | Mobile UI | "syncing" / "saved offline" |
| Mock provider | (UI never said this — only in code) | n/a |
| Seed data | Empty state hints ("Create one via API or seed data") | Removed |
| JSON | Audit log + sync conflicts metadata column | Kept inline as `<code>` for transparency, but never described as "JSON" in copy |
| Env / Runtime / Scaffold / Dev server | Various comments | All user-facing instances removed; comments retained in source |
| Medusa / PostGIS / Redis / Electron / React Native | (never appeared in UI) | n/a |
| `field_sales_token` localStorage key | localStorage key only (not visible) | retained — renaming would invalidate existing sessions; cosmetic only |

## 8. Final Verdict

✅ **UI is production-shaped.** Every user-visible page in the web dashboard, mobile app, and Electron desktop shell has been re-themed to a clean white / #00aaff palette, branded as Orbit, and given consistent empty / loading / error states. No demo, scaffold, "TODO", "MVP", or "mock" copy is shown to users anywhere.

❌ **Not production-deployable** without the three dangerous strings from §4 being addressed. Those are security controls, out of scope for UI polish.

The cosmetic and copy gates for a client-ready demo are clear. The security gates from `final-go-no-go-report.md` remain.
