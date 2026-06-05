"use client";

import type { JSX, ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Navigation } from "./navigation";
import { ImpersonationBanner } from "./impersonation-banner";
import { RouteGuard } from "./route-guard";
import { rehydrateToken } from "./api-service";

const publicPaths = ["/login", "/forgot-password", "/reset-password"];

/**
 * Client-side app shell: auth rehydration + redirect, and the sidebar/route-guard
 * chrome. Split out of the root layout so that layout.tsx can be a Server
 * Component — that lets `next build` (production mode) pre-render every route and
 * generate the built-in error pages, which a Client-Component root layout blocks.
 */
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    rehydrateToken();
    if (typeof window !== "undefined") {
      setHasToken(Boolean(window.localStorage.getItem("field_sales_token")));
    }
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    if (!ready) return;
    const tokenNow =
      typeof window !== "undefined" && Boolean(window.localStorage.getItem("field_sales_token"));
    if (!tokenNow && !publicPaths.includes(pathname)) {
      router.push("/login");
    }
  }, [ready, hasToken, pathname, router]);

  if (!ready) {
    return (
      <div className="app appPublic">
        <main className="shell">
          <p className="status">Loading your workspace…</p>
        </main>
      </div>
    );
  }

  const isPublic = publicPaths.includes(pathname);
  const showSidebar = !isPublic && hasToken;

  return (
    <div className={showSidebar ? "app" : "app appPublic"}>
      {showSidebar && <Navigation />}
      <div className="appMain">
        {showSidebar && <ImpersonationBanner />}
        {showSidebar ? <RouteGuard>{children}</RouteGuard> : children}
      </div>
    </div>
  );
}
