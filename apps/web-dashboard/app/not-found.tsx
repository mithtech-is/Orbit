import type { JSX } from "react";
import Link from "next/link";

/**
 * Explicit App-Router 404. Providing this (and global-error.tsx) stops Next's
 * production build from falling back to the pages-router error page, which —
 * because our root layout is a Client Component — would otherwise fail the build
 * with "<Html> should not be imported outside of pages/_document".
 */
export default function NotFound(): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 12,
        textAlign: "center",
        padding: 24
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 700, margin: 0 }}>404</h1>
      <p style={{ color: "var(--text-secondary, #64748b)" }}>This page could not be found.</p>
      <Link href="/" style={{ color: "var(--primary, #2563eb)", fontWeight: 600 }}>
        Back to overview
      </Link>
    </div>
  );
}
