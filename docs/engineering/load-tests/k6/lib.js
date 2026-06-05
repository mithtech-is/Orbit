// Shared helpers for Orbit k6 load tests.
// All scripts read config from env (see load-testing-plan.md §5).
import http from "k6/http";
import { check } from "k6";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:9000";
export const WS_URL = __ENV.WS_URL || "ws://localhost:9000/ws/tracking";
export const ORG_ID = __ENV.ORG_ID || "mithtech";
export const PASSWORD = __ENV.PASSWORD || "admin123";
export const REP_EMAIL = __ENV.REP_EMAIL || "rep1@acme-fieldsales.test";
export const MANAGER_EMAIL = __ENV.MANAGER_EMAIL || "manager@acme-fieldsales.test";

// Log in and return { token, userId }. Cache per-VU in setup or init as needed.
export function login(email, password = PASSWORD, organisationId = ORG_ID) {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password, organisationId }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "login" } }
  );
  check(res, { "login 200": (r) => r.status === 200 });
  const body = res.json();
  return { token: body.token, userId: body.userId };
}

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

// Ensure a rep has consent + an active work session so pings are accepted.
export function ensureSession(token) {
  http.post(`${BASE_URL}/api/v1/tracking`, JSON.stringify({ action: "record_consent", granted: true }), authHeaders(token));
  const start = http.post(`${BASE_URL}/api/v1/tracking`, JSON.stringify({ action: "start_session", latitude: 13.0, longitude: 77.55 }), authHeaders(token));
  // 409 == already active, which is fine for load purposes.
  check(start, { "session ready": (r) => r.status === 201 || r.status === 409 });
}
