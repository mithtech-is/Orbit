import { randomUUID } from "node:crypto";

export interface RequestLogEntry {
  correlationId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  clientIp: string;
  bytesOut?: number;
}

let sink: (entry: RequestLogEntry) => void = (entry) => {
  // Default sink writes one JSON line per request to stdout — easy for
  // shipping to Loki/Datadog/CloudWatch without parsing prose. Suppress
  // health checks because they would dominate the log.
  if (entry.path === "/health") return;
  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

export function setRequestLogSink(fn: (entry: RequestLogEntry) => void): void {
  sink = fn;
}

export function nextCorrelationId(): string {
  return randomUUID();
}

export function logRequest(entry: RequestLogEntry): void {
  sink(entry);
}
