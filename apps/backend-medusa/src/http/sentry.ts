/**
 * Minimal Sentry-shaped error reporter. If `SENTRY_DSN` is set we POST a small
 * JSON envelope to the DSN endpoint. We deliberately avoid the @sentry/node
 * dependency to keep this layer dependency-free; once the team standardises on
 * Sentry the SDK can replace this module without touching callers.
 */

const dsn = process.env.SENTRY_DSN;

export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!dsn) return;

  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    platform: "node",
    server_name: "field-sales-backend",
    exception: {
      values: [{
        type: error instanceof Error ? error.constructor.name : typeof error,
        value: error instanceof Error ? error.message : String(error),
        stacktrace: error instanceof Error && error.stack ? { frames: [{ filename: "(see stack)", function: error.stack }] } : undefined
      }]
    },
    tags: {
      service: "backend-medusa",
      env: process.env.NODE_ENV ?? "development"
    },
    extra: context
  };

  // Fire-and-forget — failure to deliver to Sentry must never break the request path.
  void fetch(dsn, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {
    process.stderr.write("[sentry] delivery failed\n");
  });
}

export function isSentryConfigured(): boolean {
  return Boolean(dsn);
}
