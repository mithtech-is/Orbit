/**
 * Pure freshness/staleness helpers shared by the API, the session-expiry job,
 * and (conceptually) the dashboard. Kept side-effect-free so the rules are
 * unit-testable without a database or clock.
 *
 * Two distinct windows, intentionally different:
 *   - LIVE window  — how recent a ping must be for a rep to render on the live
 *                    team map. Short, so a rep whose app died isn't shown as
 *                    "live" for long.
 *   - STALE window — how long a session may go silent before it is auto-stopped
 *                    as abandoned. Longer, so a rep with patchy signal keeps
 *                    their own session.
 */

/** True when a ping recorded at `recordedAtMs` is recent enough to be "live". */
export function isPingLive(recordedAtMs: number, nowMs: number, liveWindowSeconds: number): boolean {
  if (!Number.isFinite(recordedAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - recordedAtMs;
  // A negative age (clock skew, future timestamp) is treated as live, not stale.
  return ageMs <= liveWindowSeconds * 1000;
}

/**
 * True when a session whose last activity was at `lastActivityMs` has gone
 * silent long enough to be considered abandoned. `lastActivityMs` is the most
 * recent of the session's start time and its latest ping.
 */
export function isSessionStale(lastActivityMs: number, nowMs: number, staleAfterSeconds: number): boolean {
  if (!Number.isFinite(lastActivityMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastActivityMs > staleAfterSeconds * 1000;
}
