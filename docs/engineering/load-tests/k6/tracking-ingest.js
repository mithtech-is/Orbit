// Scenario 2.3 — Tracking ingestion (the highest-write path).
// Each VU = one rep pinging every ~20s, matching use-active-tracking.ts cadence.
// Break-point hypothesis: pool-of-10 + per-ping audit + WS fan-out; ~500 writes/s ≈ 10k reps (audit C5/H3).
import http from "k6/http";
import { check } from "k6";
import { login, authHeaders, ensureSession, ensureSession as _es, BASE_URL, REP_EMAIL, PASSWORD } from "./lib.js";

export const options = {
  scenarios: {
    reps_pinging: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 200 },
        { duration: "3m", target: 1000 },
        { duration: "3m", target: 5000 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{name:record_pings}": ["p(95)<500"],
    http_req_failed: ["rate<0.02"],
  },
};

// NOTE: this assumes N seeded reps rep1..repN with the same password. For a
// realistic run, generate REP_EMAILS as a JSON array and index by __VU.
export default function () {
  // One login + session per VU iteration is wasteful; in a real run move login
  // to per-VU init using a SharedArray of credentials. Kept simple here.
  const { token } = login(REP_EMAIL, PASSWORD);
  ensureSession(token);
  const ping = {
    action: "record_pings",
    pings: [
      {
        id: `ping_${__VU}_${Date.now()}`,
        latitude: 13.0 + Math.random() * 0.05,
        longitude: 77.55 + Math.random() * 0.05,
        accuracyMeters: 5,
        recordedAt: new Date().toISOString(),
      },
    ],
  };
  const res = http.post(`${BASE_URL}/api/v1/tracking`, JSON.stringify(ping), {
    ...authHeaders(token),
    tags: { name: "record_pings" },
  });
  check(res, { "ping accepted": (r) => r.status === 201 });
  // Real cadence is 20s; sleep here would pin VU=rep. Use exec.test.options to
  // model think-time, or run with --vus matching desired concurrent reps.
}
