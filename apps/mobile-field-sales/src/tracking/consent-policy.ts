import { canSendLocation } from "@orbit/validation";
import type { Role, WorkSessionState } from "@orbit/shared-types";

export type ForegroundPermission = "granted" | "denied" | "unknown";
export type BackgroundPermission = "granted" | "denied" | "unknown" | "not_requested";

export interface TrackingDecisionInput {
  role: Role;
  consentAccepted: boolean;
  workSessionState: WorkSessionState;
  foregroundPermission: ForegroundPermission;
  backgroundPermission: BackgroundPermission;
}

export type TrackingBlockReason =
  | "wrong_role"
  | "consent_missing"
  | "no_active_session"
  | "foreground_denied"
  | "background_required_after_foreground";

export interface TrackingDecision {
  /** True only when every privacy precondition holds. */
  canSend: boolean;
  /** What the rep should be told if `canSend` is false. */
  blockReason: TrackingBlockReason | null;
  /** What the UI should request next, in order. */
  nextRequest: "foreground" | "background" | "consent" | null;
  /** Whether the persistent "tracking active" indicator should be shown. */
  showActiveBanner: boolean;
}

/**
 * Pure decision function — no React. Encodes the privacy rules from the spec:
 *   - only reps may send
 *   - consent must be granted
 *   - work session must be active
 *   - foreground permission must come BEFORE background
 *   - the rep must always be able to see tracking status (returned via showActiveBanner)
 */
export function decideTracking(input: TrackingDecisionInput): TrackingDecision {
  const baseAllowed = canSendLocation({
    role: input.role,
    consentAccepted: input.consentAccepted,
    workSessionState: input.workSessionState
  });

  if (input.role !== "field_sales_representative") {
    return {
      canSend: false,
      blockReason: "wrong_role",
      nextRequest: null,
      showActiveBanner: false
    };
  }

  if (!input.consentAccepted) {
    return {
      canSend: false,
      blockReason: "consent_missing",
      nextRequest: "consent",
      showActiveBanner: false
    };
  }

  if (input.workSessionState !== "active") {
    return {
      canSend: false,
      blockReason: "no_active_session",
      nextRequest: null,
      showActiveBanner: false
    };
  }

  if (input.foregroundPermission !== "granted") {
    return {
      canSend: false,
      blockReason: "foreground_denied",
      nextRequest: "foreground",
      showActiveBanner: false
    };
  }

  if (input.backgroundPermission === "not_requested" || input.backgroundPermission === "unknown") {
    return {
      canSend: false,
      blockReason: "background_required_after_foreground",
      nextRequest: "background",
      showActiveBanner: true
    };
  }

  return {
    canSend: baseAllowed && input.backgroundPermission === "granted",
    blockReason: input.backgroundPermission === "granted" ? null : "foreground_denied",
    nextRequest: input.backgroundPermission === "granted" ? null : "background",
    showActiveBanner: true
  };
}
