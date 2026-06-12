"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Connection state for the shared tracking WebSocket.
 *
 * - `idle`         — not started yet (SSR, or before first effect run).
 * - `connecting`   — first connection attempt in flight.
 * - `open`         — connected; live events are flowing.
 * - `reconnecting` — the socket dropped and a backoff retry is scheduled.
 *                    This is the transient state the UI should treat as
 *                    "still trying", NOT a hard failure.
 * - `error`        — gave up after {@link MAX_RECONNECT_ATTEMPTS} consecutive
 *                    failed attempts. Surface a hard error + a Retry button.
 * - `unauthorized` — no token, or the server rejected the handshake with the
 *                    auth close code (4401). Do NOT auto-retry; the user must
 *                    sign in again.
 */
export type TrackingSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "error"
  | "unauthorized";

/** Close code the WS gateway uses for auth rejections (see ws-gateway.ts). */
const AUTH_CLOSE_CODE = 4401;

/** First retry delay, doubled each subsequent attempt. */
const BASE_RECONNECT_MS = 1000;
/** Backoff ceiling — retries never wait longer than this. */
const MAX_RECONNECT_MS = 30_000;
/**
 * Consecutive failed attempts (without ever reaching `open`) before we stop
 * auto-retrying and surface the hard `error` state. ~1+2+4+8+16+30 ≈ 61s of
 * trying, which comfortably covers a backend restart but still gives up on a
 * genuinely dead service so the page doesn't spin forever.
 */
const MAX_RECONNECT_ATTEMPTS = 6;

/**
 * Exponential backoff with a ceiling. `attempt` is zero-based:
 * 0→1s, 1→2s, 2→4s, 3→8s, 4→16s, 5→30s (capped), …
 *
 * Pure and deterministic so it can be unit-tested without timers.
 */
export function nextReconnectDelayMs(attempt: number): number {
  const exp = BASE_RECONNECT_MS * 2 ** Math.max(0, attempt);
  return Math.min(exp, MAX_RECONNECT_MS);
}

export interface UseTrackingSocketOptions {
  /** Base WS URL, e.g. `ws://localhost:9090`. Path is appended internally. */
  wsUrl: string;
  /**
   * Auth token, or `null`/`undefined` if the user isn't signed in. When absent
   * the hook stays in `unauthorized` and never opens a socket.
   */
  token: string | null | undefined;
  /** Called for every inbound frame's parsed text payload. */
  onMessage: (data: string) => void;
  /**
   * Called every time the socket (re)connects — first connect AND each
   * successful reconnect. Use this to re-seed any state that may have changed
   * while the socket was down (e.g. re-fetch latest positions).
   */
  onOpen?: () => void;
  /** Set false to keep the hook idle (e.g. while a prerequisite is missing). */
  enabled?: boolean;
}

export interface UseTrackingSocketResult {
  state: TrackingSocketState;
  /** Number of consecutive failed reconnect attempts since the last open. */
  attempts: number;
  /**
   * Force an immediate reconnect, resetting the backoff. Use to back a manual
   * "Retry" button from the `error`/`unauthorized` states.
   */
  retry: () => void;
}

/**
 * Shared reconnecting WebSocket for the realtime tracking gateway
 * (`/ws/tracking`). Handles exponential-backoff reconnection so a backend
 * restart or a transient network blip self-heals instead of leaving the page
 * stuck on a terminal error until a manual reload.
 *
 * The gateway is a single multi-channel endpoint; callers filter by event
 * `type` inside {@link UseTrackingSocketOptions.onMessage}.
 */
export function useTrackingSocket(options: UseTrackingSocketOptions): UseTrackingSocketResult {
  const { wsUrl, token, enabled = true } = options;
  const [state, setState] = useState<TrackingSocketState>("idle");
  const [attempts, setAttempts] = useState(0);

  // Keep callbacks in refs so they can change between renders without tearing
  // down and rebuilding the socket.
  const onMessageRef = useRef(options.onMessage);
  const onOpenRef = useRef(options.onOpen);
  useEffect(() => { onMessageRef.current = options.onMessage; });
  useEffect(() => { onOpenRef.current = options.onOpen; });

  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  // Guards against a stale async callback from a torn-down effect run scheduling
  // a reconnect after cleanup (React strict-mode double-invoke / unmount).
  const activeRef = useRef(false);
  // Bumped by `retry()` to force the connect effect to re-run on demand.
  const [retryNonce, setRetryNonce] = useState(0);

  const retry = useCallback(() => {
    attemptRef.current = 0;
    setAttempts(0);
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) { setState("idle"); return; }
    if (typeof window === "undefined") return;
    if (!token) { setState("unauthorized"); return; }

    activeRef.current = true;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!activeRef.current) return;
      const attempt = attemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        setState("error");
        return;
      }
      setState("reconnecting");
      const delay = nextReconnectDelayMs(attempt);
      attemptRef.current = attempt + 1;
      setAttempts(attemptRef.current);
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!activeRef.current) return;
      // First-ever attempt shows "connecting"; subsequent ones already set
      // "reconnecting" via scheduleReconnect.
      setState((prev) => (prev === "reconnecting" ? prev : "connecting"));

      let socket: WebSocket;
      try {
        socket = new WebSocket(`${wsUrl}/ws/tracking?token=${encodeURIComponent(token)}`);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (!activeRef.current) return;
        attemptRef.current = 0;
        setAttempts(0);
        setState("open");
        onOpenRef.current?.();
      });

      socket.addEventListener("message", (event) => {
        if (!activeRef.current) return;
        onMessageRef.current(String(event.data));
      });

      socket.addEventListener("close", (event) => {
        if (!activeRef.current) return;
        socketRef.current = null;
        // Explicit auth rejection — stop retrying, the token is the problem.
        if (event.code === AUTH_CLOSE_CODE) {
          setState("unauthorized");
          return;
        }
        scheduleReconnect();
      });

      // `error` is always followed by `close`; let close drive the reconnect so
      // we don't double-schedule.
      socket.addEventListener("error", () => { /* handled in close */ });
    };

    connect();

    return () => {
      activeRef.current = false;
      clearTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        // Drop listeners so an in-flight close from teardown can't schedule a
        // reconnect against the now-inactive effect.
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [wsUrl, token, enabled, retryNonce]);

  return { state, attempts, retry };
}
