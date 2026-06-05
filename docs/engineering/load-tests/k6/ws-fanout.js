// Scenario 2.4 — WebSocket fan-out / connection scale.
// Opens N concurrent manager WS connections to /ws/tracking and measures
// connect success + message receipt while a separate ingest run drives pings.
// Break-point hypothesis: single-process Set + per-socket JSON.stringify (audit C2/H6)
// -> main-thread CPU climbs; and across >1 backend instance, messages are MISSED
// (proves C2 — run with 2 instances behind an LB to demonstrate the gap).
import ws from "k6/ws";
import { check } from "k6";
import { login, WS_URL, MANAGER_EMAIL } from "./lib.js";

export const options = {
  scenarios: {
    managers_watching: {
      executor: "ramping-vus",
      stages: [
        { duration: "1m", target: 500 },
        { duration: "2m", target: 2000 },
        { duration: "2m", target: 5000 },
        { duration: "1m", target: 0 },
      ],
    },
  },
};

export function setup() {
  return login(MANAGER_EMAIL);
}

export default function (data) {
  const url = `${WS_URL}?token=${encodeURIComponent(data.token)}`;
  let gotSubscribed = false;
  let messages = 0;
  const res = ws.connect(url, {}, (socket) => {
    socket.on("open", () => {
      // Optionally send managedTeamIds (the gateway accepts the first message).
      socket.send(JSON.stringify({ managedTeamIds: [] }));
    });
    socket.on("message", (msg) => {
      messages++;
      try {
        if (JSON.parse(msg).type === "ws.subscribed") gotSubscribed = true;
      } catch (_e) {
        // ignore
      }
    });
    socket.setTimeout(() => socket.close(), 30000); // hold the socket 30s
  });
  check(res, { "ws connected (101)": (r) => r && r.status === 101 });
  check({ gotSubscribed }, { "received subscribe ack": (s) => s.gotSubscribed });
}
