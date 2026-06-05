"use client";

import type { JSX } from "react";

/**
 * App-Router global error boundary. Must render its own <html>/<body> because it
 * replaces the root layout when a render error escapes. Having this file present
 * lets `next build` generate the error page via the App Router instead of the
 * pages-router fallback (which fails for our Client-Component root layout).
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 12,
          textAlign: "center",
          padding: 24
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "#64748b", maxWidth: 420 }}>
          An unexpected error occurred. Please try again.
        </p>
        {error?.digest ? (
          <p style={{ color: "#94a3b8", fontSize: 12 }}>Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
