// Scenario 2.6 — Route optimisation preview.
// The optimiser runs synchronously on the Node event loop (audit M2,
// route-planning/service.ts:39 always mock provider). This script sweeps stop
// counts to find where event-loop block hurts p95 under concurrency.
import http from "k6/http";
import { check } from "k6";
import { login, authHeaders, BASE_URL, REP_EMAIL } from "./lib.js";

const STOP_COUNT = Number(__ENV.STOP_COUNT || 30); // try 30, 100, 250

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 200 },
    { duration: "2m", target: 500 },
    { duration: "1m", target: 0 },
  ],
  thresholds: { "http_req_duration{name:route_preview}": ["p(95)<1000"] },
};

export function setup() {
  return login(REP_EMAIL);
}

export default function (data) {
  const stops = [];
  for (let i = 0; i < STOP_COUNT; i++) {
    stops.push({
      outletId: `outlet_${i}`,
      latitude: 13.0 + Math.random() * 0.1,
      longitude: 77.55 + Math.random() * 0.1,
      priority: (i % 3) + 1,
      expectedDurationMinutes: 15,
    });
  }
  const body = { routeDate: "2026-05-29", startLatitude: 13.0, startLongitude: 77.55, stops };
  const res = http.post(`${BASE_URL}/api/v1/route-plans/preview`, JSON.stringify(body), {
    ...authHeaders(data.token),
    tags: { name: "route_preview" },
  });
  check(res, { "preview 200": (r) => r.status === 200 });
}
