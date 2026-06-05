// Scenarios 2.5 + 2.7 — order creation contention + sync engine throughput.
// Orders: FOR UPDATE contention on hot products + pool (audit C1, M4 if Medusa on).
// Sync: serial push with >=4 round-trips/mutation (audit H2) + full-snapshot pull (H1).
import http from "k6/http";
import { check } from "k6";
import { login, authHeaders, BASE_URL, REP_EMAIL } from "./lib.js";

export const options = {
  scenarios: {
    orders: {
      executor: "ramping-vus",
      exec: "createOrders",
      stages: [
        { duration: "2m", target: 100 },
        { duration: "2m", target: 500 },
        { duration: "1m", target: 0 },
      ],
    },
    sync: {
      executor: "ramping-vus",
      exec: "syncPushPull",
      startTime: "5m",
      stages: [
        { duration: "2m", target: 100 },
        { duration: "2m", target: 500 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: { http_req_failed: ["rate<0.02"] },
};

export function setup() {
  const rep = login(REP_EMAIL);
  // Discover an outlet + product to order against.
  const outlets = http.get(`${BASE_URL}/api/v1/outlets`, authHeaders(rep.token)).json();
  const products = http.get(`${BASE_URL}/api/v1/products`, authHeaders(rep.token)).json();
  return {
    token: rep.token,
    outletId: outlets.items?.[0]?.id,
    productId: products.items?.[0]?.id,
  };
}

export function createOrders(data) {
  const body = {
    outletId: data.outletId,
    source: "online",
    lines: [{ productId: data.productId, quantity: 1 }],
  };
  const res = http.post(`${BASE_URL}/api/v1/field-orders`, JSON.stringify(body), {
    ...authHeaders(data.token),
    tags: { name: "create_order" },
  });
  check(res, { "order created or stock-out": (r) => r.status === 201 || r.status === 400 });
}

export function syncPushPull(data) {
  // Push a small batch of offline mutations (visit check-in is cheap + safe).
  const mutations = [];
  for (let i = 0; i < 10; i++) {
    mutations.push({
      idempotencyKey: `k6_${__VU}_${Date.now()}_${i}`,
      type: "visit.check_in",
      payload: { outletId: data.outletId, latitude: 13.0, longitude: 77.55 },
    });
  }
  const push = http.post(
    `${BASE_URL}/api/v1/sync/push`,
    JSON.stringify({ deviceId: `k6-dev-${__VU}`, platform: "k6", mutations }),
    { ...authHeaders(data.token), tags: { name: "sync_push" } }
  );
  check(push, { "push 200": (r) => r.status === 200 });

  const pull = http.get(`${BASE_URL}/api/v1/sync/pull`, { ...authHeaders(data.token), tags: { name: "sync_pull" } });
  check(pull, { "pull 200": (r) => r.status === 200 });
}
