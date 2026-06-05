import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifyToken } from "../auth/auth-service.js";
import { getRedis, getRedisSubscriber, isRedisEnabled } from "../redis/client.js";
import {
  canSubscriberReceive,
  type RealtimeEvent,
  type SubscriberContext,
  type TrackingPingEvent
} from "./ws-filter.js";

interface Subscriber {
  socket: WebSocket;
  context: SubscriberContext;
}

let server: WebSocketServer | undefined;
const subscribers = new Set<Subscriber>();

// Channel every instance publishes to / subscribes from. A ping recorded on
// instance A is PUBLISHed here; every instance (incl. A) receives it via its
// subscriber and fans out to ITS local sockets. This is what makes the live
// map correct across a horizontally-scaled backend (performance-audit C2).
const WS_CHANNEL = "orbit:ws";
let redisSubscribed = false;

function ensureRedisSubscription(): void {
  if (redisSubscribed || !isRedisEnabled()) return;
  const subscriber = getRedisSubscriber();
  if (!subscriber) return;
  redisSubscribed = true;
  subscriber.subscribe(WS_CHANNEL).catch((err) => {
    process.stderr.write(`[ws] redis subscribe failed: ${err?.message ?? err}\n`);
    redisSubscribed = false;
  });
  subscriber.on("message", (channel, message) => {
    if (channel !== WS_CHANNEL) return;
    try {
      localBroadcast(JSON.parse(message) as RealtimeEvent);
    } catch {
      // ignore malformed cross-instance frames
    }
  });
}

/**
 * Attach a WS server to the running HTTP server. Path: `/ws/tracking`.
 * Authentication: JWT in the `token` query parameter (Bearer header is awkward
 * with the browser WebSocket API). Rejected connections close immediately with
 * code 4401.
 *
 * The path is historical — this gateway now carries tracking, route-plan, and
 * any future realtime events, not just location pings. Renaming would break
 * existing clients (apps/web-dashboard/app/live-map, mobile app), so we keep
 * `/ws/tracking` as the single multi-channel endpoint.
 */
export function attachWsGateway(http: HttpServer): WebSocketServer {
  if (server) return server;
  server = new WebSocketServer({ noServer: true });
  ensureRedisSubscription();

  http.on("upgrade", (request, socket, head) => {
    if (!request.url || !request.url.startsWith("/ws/tracking")) {
      socket.destroy();
      return;
    }

    const url = new URL(request.url, "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    let context: SubscriberContext;
    try {
      const payload = verifyToken(token);
      context = {
        userId: payload.userId,
        organisationId: payload.organisationId,
        role: payload.role,
        permissions: payload.permissions,
        managedTeamIds: undefined
      };
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    server!.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, request, context);
    });
  });

  return server;
}

function handleConnection(socket: WebSocket, _request: IncomingMessage, context: SubscriberContext) {
  const subscriber: Subscriber = { socket, context };
  subscribers.add(subscriber);

  socket.send(
    JSON.stringify({
      type: "ws.subscribed",
      organisationId: context.organisationId,
      role: context.role,
      permissions: context.permissions
    })
  );

  socket.on("close", () => {
    subscribers.delete(subscriber);
  });

  socket.on("error", () => {
    subscribers.delete(subscriber);
  });

  // First inbound message may carry `managedTeamIds` so sales managers can be
  // team-filtered. We accept once and ignore later messages.
  let teamsApplied = false;
  socket.on("message", (raw) => {
    if (teamsApplied) return;
    try {
      const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (Array.isArray(parsed.managedTeamIds)) {
        subscriber.context.managedTeamIds = parsed.managedTeamIds
          .map((t) => (typeof t === "string" ? t : ""))
          .filter((t) => t.length > 0);
        teamsApplied = true;
      }
    } catch {
      // ignore malformed messages
    }
  });
}

/**
 * Broadcasts an arbitrary realtime event to authorised subscribers. Returns
 * the count of sockets the event was actually written to. The filter logic
 * lives in {@link canSubscriberReceive} — keep authorisation rules there, not
 * here, so they stay unit-testable without a WS server.
 */
/**
 * Public broadcast entrypoint. With Redis configured, this PUBLISHes the event
 * so EVERY instance (including this one) delivers it to its local sockets via
 * the subscriber — correct fan-out across a multi-instance deployment. Without
 * Redis it falls back to a direct local fan-out (single-instance dev).
 */
export function broadcastEvent(event: RealtimeEvent): number {
  const redis = isRedisEnabled() ? getRedis() : null;
  if (redis) {
    // Fire-and-forget publish; delivery happens in the subscriber handler.
    redis.publish(WS_CHANNEL, JSON.stringify(event)).catch((err) => {
      process.stderr.write(`[ws] redis publish failed, local fallback: ${err?.message ?? err}\n`);
      localBroadcast(event);
    });
    return -1; // count is not meaningful across instances; callers ignore it
  }
  return localBroadcast(event);
}

/** Fan out to THIS instance's local sockets only. */
function localBroadcast(event: RealtimeEvent): number {
  let sent = 0;
  // Serialize ONCE per event, not once per subscriber (performance-audit H6).
  const frame = JSON.stringify(event);
  for (const subscriber of subscribers) {
    if (subscriber.socket.readyState !== subscriber.socket.OPEN) continue;
    if (!canSubscriberReceive(subscriber.context, event)) continue;
    subscriber.socket.send(frame);
    sent += 1;
  }
  return sent;
}

/**
 * Backwards-compatible alias for the original tracking-only broadcast. Prefer
 * {@link broadcastEvent} in new code so the call site is explicit about
 * passing a non-tracking payload.
 */
export function broadcastTrackingEvent(event: TrackingPingEvent): number {
  return broadcastEvent(event);
}

export function subscriberCount(): number {
  return subscribers.size;
}
