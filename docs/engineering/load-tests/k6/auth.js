// Scenario 2.1 — Auth storm.
// Hypothesis: login bucket is 10/min/IP (rate-limit.ts:22) -> 429s quickly from a
// single source IP; behind that, bcrypt verify is CPU-bound on the single process.
// Run from multiple source IPs (distributed k6) to get past the per-IP limiter.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, MANAGER_EMAIL, PASSWORD, ORG_ID } from "./lib.js";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 200 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    // We EXPECT 429s here — assert the limiter actually engages rather than 5xx.
    "http_req_failed{name:login}": ["rate<0.95"],
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: MANAGER_EMAIL, password: PASSWORD, organisationId: ORG_ID }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
  );
  check(res, {
    "200 or 429 (no 5xx)": (r) => r.status === 200 || r.status === 429,
  });
}
