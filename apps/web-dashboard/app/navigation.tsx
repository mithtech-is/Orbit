"use client";

import type { JSX } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loadSession, logoutUser, areaForRole, type StoredSession } from "./api-service";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  label: string;
  href: string;
  /** User needs at least one of these permissions. `null` = always shown. */
  requiredAnyOf: string[] | null;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Operate",
    items: [
      { label: "Overview", href: "/", requiredAnyOf: null },
      { label: "Notifications", href: "/notifications", requiredAnyOf: null },
      // "My day" is the field rep's personal screen (their own route + sessions),
      // so it's gated on tracking:send — reps only, not managers/admins.
      { label: "My day", href: "/my-day", requiredAnyOf: ["tracking:send"] },
      { label: "Live team map", href: "/live-map", requiredAnyOf: ["tracking:view_live"] },
      { label: "Visits", href: "/visits", requiredAnyOf: ["visit:write", "report:read"] }
    ]
  },
  {
    label: "Plan",
    items: [
      // "Customers" was a second view of the same outlet data — consolidated into
      // Outlets (the source-of-truth CRUD page) to remove the duplicate.
      { label: "Outlets", href: "/outlets", requiredAnyOf: ["outlet:read", "outlet:write"] },
      { label: "Products", href: "/products", requiredAnyOf: ["outlet:read", "outlet:write"] },
      { label: "Leads", href: "/leads", requiredAnyOf: ["lead:read", "lead:write"] },
      { label: "Territories", href: "/territories", requiredAnyOf: ["territory:manage"] },
      { label: "Route planner", href: "/route-plans", requiredAnyOf: ["route:plan"] }
    ]
  },
  {
    label: "Field",
    items: [
      // Starting/stopping a work session is a rep action (tracking:send).
      // Managers/admins watch live positions via "Live team map" instead.
      { label: "Tracking sessions", href: "/tracking", requiredAnyOf: ["tracking:send"] },
      { label: "Orders", href: "/field-orders", requiredAnyOf: ["order:create", "report:read"] }
    ]
  },
  {
    label: "Insights",
    items: [
      // "Team scorecard" duplicated Reports' per-rep activity (both use
      // listRepActivity) — consolidated into Reports.
      { label: "Analytics", href: "/analytics", requiredAnyOf: ["report:read"] },
      { label: "Reports", href: "/reports", requiredAnyOf: ["report:read"] },
      { label: "Expenses", href: "/reports/expenses", requiredAnyOf: ["report:read"] },
      { label: "Coverage map", href: "/coverage", requiredAnyOf: ["report:read"] },
      { label: "Route & integrity", href: "/field-integrity", requiredAnyOf: ["report:read"] },
      { label: "Field ops", href: "/field-ops", requiredAnyOf: ["report:read"] },
      { label: "Audit log", href: "/audit-log", requiredAnyOf: ["audit:read"] },
      { label: "Sync issues", href: "/sync-conflicts", requiredAnyOf: ["audit:read"] }
    ]
  },
  {
    label: "Admin",
    items: [
      { label: "Users", href: "/users", requiredAnyOf: ["user:manage"] },
      { label: "Teams", href: "/teams", requiredAnyOf: ["team:manage"] },
      { label: "Organisation settings", href: "/organisation-settings", requiredAnyOf: ["organisation:manage"] },
      { label: "Integrations", href: "/integrations", requiredAnyOf: ["organisation:manage"] }
    ]
  }
];

function hasAny(permissions: string[] | undefined, required: string[] | null): boolean {
  if (required === null) return true;
  if (!permissions || permissions.length === 0) return false;
  return required.some((p) => permissions.includes(p));
}

export function Navigation(): JSX.Element {
  const pathname = usePathname();
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    setSession(loadSession());
  }, [pathname]);

  // The whole dashboard is the admin (back-office) area. A non-admin session
  // (field rep) gets no nav links at all — the RouteGuard then shows them the
  // "use the field app" screen. This keeps admin routes invisible to field users.
  const isAdminArea = (session?.area ?? areaForRole(session?.role)) === "admin";
  const visibleSections = !isAdminArea
    ? []
    : sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => hasAny(session?.permissions, item.requiredAnyOf))
        }))
        .filter((section) => section.items.length > 0);

  return (
    <nav className="nav">
      <div className="brand">
        <Logo size={28} />
        <span>Orbit</span>
      </div>
      <div className="navLinks">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <div className="navSection">{section.label}</div>
            {section.items.map(({ label, href }) => {
              const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link href={href} key={href} className={active ? "active" : undefined}>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {session ? (
        <div className="navAccount">
          <div className="navAccountInfo">
            <div className="navAccountName">{session.name}</div>
            <div className="navAccountMeta">{session.role.replace(/_/g, " ")}</div>
          </div>
          <ThemeToggle />
          <button className="navSignOut" onClick={() => logoutUser()}>Sign out</button>
        </div>
      ) : null}
    </nav>
  );
}
