// Scenario 2.2 — Manager dashboard read mix.
// Exercises the unindexed field_order seq-scan (audit C3) + pool-of-10 (C1).
// Break-point hypothesis: p95 climbs sharply ~500-1000 VUs on one instance.
import http from "k6/http";
import { check, sleep } from "k6";
import { login, authHeaders, BASE_URL, MANAGER_EMAIL } from "./lib.js";

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "2m", target: 200 },
    { duration: "2m", target: 500 },
    { duration: "2m", target: 1000 },
    { duration: "2m", target: 2000 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

export function setup() {
  return login(MANAGER_EMAIL);
}

export default function (data) {
  const h = authHeaders(data.token);
  // The endpoints a manager dashboard hammers on load / auto-refresh.
  const reqs = {
    summary: { method: "GET", url: `${BASE_URL}/api/v1/reports/summary`, params: { ...h, tags: { name: "reports/summary" } } },
    repAct: { method: "GET", url: `${BASE_URL}/api/v1/reports/rep-activity`, params: { ...h, tags: { name: "reports/rep-activity" } } },
    orders: { method: "GET", url: `${BASE_URL}/api/v1/field-orders`, params: { ...h, tags: { name: "field-orders" } } },
    visits: { method: "GET", url: `${BASE_URL}/api/v1/visits`, params: { ...h, tags: { name: "visits" } } },
    latest: { method: "GET", url: `${BASE_URL}/api/v1/tracking/latest`, params: { ...h, tags: { name: "tracking/latest" } } },
  };
  const res = http.batch(reqs);
  for (const k of Object.keys(res)) check(res[k], { [`${k} 200`]: (r) => r.status === 200 });
  sleep(5); // dashboard auto-refresh cadence
}
