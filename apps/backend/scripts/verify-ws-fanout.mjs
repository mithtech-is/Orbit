// Multi-instance WebSocket fan-out proof (scalability audit C2).
// Connects a WS client to instance B (:9001), records a ping on instance A
// (:9000), and asserts the client on B receives it via Redis pub/sub.
// Run two backends sharing REDIS_URL first, then:
//   node apps/backend/scripts/verify-ws-fanout.mjs
import WebSocket from "ws";

const A = process.env.A_URL || "http://localhost:9000";
const B_WS = (process.env.B_WS || "ws://localhost:9001") + "/ws/tracking";
const ORG = "mithtech";

async function login(email) {
  const r = await fetch(`${A}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "admin123", organisationId: ORG })
  });
  const j = await r.json();
  return j.token;
}

async function post(token, body) {
  const r = await fetch(`${A}/api/v1/tracking`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return r.status;
}

const repToken = await login("rep1@acme-fieldsales.test");
// Use organisation_admin as the watcher: per ws-filter.ts a sales_manager only
// receives tracking events for reps on their managedTeamIds (sent as the first
// WS message) AND only when the event carries repTeamIds. An org admin receives
// all in-tenant tracking events, which is what we want to prove fan-out works.
const mgrToken = await login("admin@acme-fieldsales.test");
if (!repToken || !mgrToken) { console.log("RESULT=FAIL (no token)"); process.exit(1); }

await post(repToken, { action: "record_consent", granted: true });
await post(repToken, { action: "start_session", latitude: 12.9, longitude: 77.5 });

const ws = new WebSocket(`${B_WS}?token=${encodeURIComponent(mgrToken)}`);
let received = false;
const done = (ok, why) => {
  console.log(`RESULT=${ok ? "SUCCESS" : "FAIL"} (${why})`);
  try { ws.close(); } catch {}
  process.exit(ok ? 0 : 1);
};

ws.on("open", () => {
  ws.send(JSON.stringify({ managedTeamIds: [] }));
  setTimeout(async () => {
    const code = await post(repToken, {
      action: "record_pings",
      pings: [{ id: `ws_proof_${Date.now()}`, latitude: 12.95, longitude: 77.55, accuracyMeters: 5, recordedAt: new Date().toISOString() }]
    });
    if (code !== 201) console.log(`(ping POST to A returned ${code})`);
  }, 500);
});
ws.on("message", (raw) => {
  try { if (JSON.parse(raw.toString()).type === "tracking.location.recorded") { received = true; done(true, "ping on :9000 reached client on :9001 via Redis"); } } catch {}
});
ws.on("error", (e) => done(false, "ws error: " + e.message));
setTimeout(() => { if (!received) done(false, "timed out waiting for cross-instance event"); }, 8000);
