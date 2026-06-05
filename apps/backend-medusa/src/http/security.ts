import type { ServerResponse } from "node:http";

/**
 * Production-grade security headers. Applied to every response from the dev-server.
 * Equivalent to Helmet defaults plus a tight CSP for the API surface (no inline
 * scripts, no third-party origins). The dashboard's own CSP lives in Next.js.
 */
export function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("strict-transport-security", "max-age=15552000; includeSubDomains");
  response.setHeader("x-dns-prefetch-control", "off");
  response.setHeader("permissions-policy", "geolocation=(), microphone=(), camera=()");
  // The API returns JSON only — block scripts/images entirely so an XSS via a
  // malformed response can't load anything cross-origin.
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
}
