"use client";

import type { JSX } from "react";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { loadSession, logoutUser, areaForRole } from "./api-service";

// Mirrors the nav permission map but indexed by path prefix so the guard
// can decide based on the URL alone.
const PROTECTED_PATHS: Array<{ prefix: string; requiredAnyOf: string[] }> = [
  { prefix: "/users", requiredAnyOf: ["user:manage"] },
  { prefix: "/organisation-settings", requiredAnyOf: ["organisation:manage"] },
  { prefix: "/integrations", requiredAnyOf: ["organisation:manage"] },
  { prefix: "/team-scorecard", requiredAnyOf: ["report:read"] },
  { prefix: "/audit-log", requiredAnyOf: ["audit:read"] },
  { prefix: "/sync-conflicts", requiredAnyOf: ["audit:read"] },
  { prefix: "/reports", requiredAnyOf: ["report:read"] },
  { prefix: "/coverage", requiredAnyOf: ["report:read"] },
  { prefix: "/field-integrity", requiredAnyOf: ["report:read"] },
  { prefix: "/field-ops", requiredAnyOf: ["report:read"] },
  { prefix: "/territories", requiredAnyOf: ["territory:manage"] },
  { prefix: "/products", requiredAnyOf: ["outlet:read", "outlet:write"] },
  { prefix: "/route-plans", requiredAnyOf: ["route:plan"] },
  { prefix: "/tracking", requiredAnyOf: ["tracking:view_live"] },
  { prefix: "/live-map", requiredAnyOf: ["tracking:view_live"] }
];

function hasAny(permissions: string[] | undefined, required: string[]): boolean {
  if (!permissions || permissions.length === 0) return false;
  return required.some((p) => permissions.includes(p));
}

type Decision = "loading" | "allowed" | "denied_permission" | "denied_area";

export function RouteGuard({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const [decision, setDecision] = useState<Decision>("loading");

  useEffect(() => {
    const session = loadSession();
    // Area gate first: the entire web dashboard is the ADMIN (back-office) area.
    // A field rep (or any non-admin role) is denied EVERY dashboard route — they
    // belong in the field app. This is the strict admin/field separation; the
    // per-permission checks below only refine access *within* the admin area.
    const area = session?.area ?? areaForRole(session?.role);
    if (area !== "admin") {
      setDecision("denied_area");
      return;
    }
    const rule = PROTECTED_PATHS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
    if (!rule) {
      setDecision("allowed");
      return;
    }
    setDecision(hasAny(session?.permissions, rule.requiredAnyOf) ? "allowed" : "denied_permission");
  }, [pathname]);

  if (decision === "loading") return <></>;
  if (decision === "allowed") return <>{children}</>;

  if (decision === "denied_area") {
    return (
      <main className="shell">
        <section className="header">
          <div>
            <h1>Field app required</h1>
            <div className="subheader">This is the admin console. Field representatives use the Orbit mobile app.</div>
          </div>
        </section>
        <div className="emptyState">
          <h3>Your account doesn&apos;t have access to the admin console</h3>
          <p>Sign in from the Orbit mobile app to see your day, routes, visits and orders.</p>
          <p style={{ marginTop: 12 }}>
            <button
              className="primary"
              onClick={() => logoutUser()}
              style={{
                padding: "8px 14px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer"
              }}
            >
              Sign out
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="header">
        <div>
          <h1>Access denied</h1>
          <div className="subheader">Your role doesn&apos;t include access to this page.</div>
        </div>
      </section>
      <div className="emptyState">
        <h3>You don&apos;t have permission to view this</h3>
        <p>If you think this is a mistake, ask your organisation admin to grant you the required role.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/" className="primary" style={{
            display: "inline-block",
            padding: "8px 14px",
            background: "var(--primary)",
            color: "#fff",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none"
          }}>
            Back to overview
          </Link>
        </p>
      </div>
    </main>
  );
}
