import { describe, expect, it } from "vitest";
import { decideTracking } from "./consent-policy";

describe("decideTracking", () => {
  it("blocks non-reps regardless of consent or permissions", () => {
    const decision = decideTracking({
      role: "sales_manager",
      consentAccepted: true,
      workSessionState: "active",
      foregroundPermission: "granted",
      backgroundPermission: "granted"
    });
    expect(decision.canSend).toBe(false);
    expect(decision.blockReason).toBe("wrong_role");
    expect(decision.showActiveBanner).toBe(false);
  });

  it("requires consent before requesting any permission", () => {
    const decision = decideTracking({
      role: "field_sales_representative",
      consentAccepted: false,
      workSessionState: "active",
      foregroundPermission: "granted",
      backgroundPermission: "granted"
    });
    expect(decision.canSend).toBe(false);
    expect(decision.blockReason).toBe("consent_missing");
    expect(decision.nextRequest).toBe("consent");
  });

  it("requires an active work session", () => {
    const decision = decideTracking({
      role: "field_sales_representative",
      consentAccepted: true,
      workSessionState: "stopped",
      foregroundPermission: "granted",
      backgroundPermission: "granted"
    });
    expect(decision.canSend).toBe(false);
    expect(decision.blockReason).toBe("no_active_session");
    expect(decision.showActiveBanner).toBe(false);
  });

  it("requests foreground permission before background", () => {
    const decision = decideTracking({
      role: "field_sales_representative",
      consentAccepted: true,
      workSessionState: "active",
      foregroundPermission: "denied",
      backgroundPermission: "granted"
    });
    expect(decision.nextRequest).toBe("foreground");
  });

  it("requests background only after foreground is granted", () => {
    const decision = decideTracking({
      role: "field_sales_representative",
      consentAccepted: true,
      workSessionState: "active",
      foregroundPermission: "granted",
      backgroundPermission: "not_requested"
    });
    expect(decision.nextRequest).toBe("background");
    expect(decision.showActiveBanner).toBe(true);
  });

  it("permits sending only with consent + active session + both permissions granted", () => {
    const decision = decideTracking({
      role: "field_sales_representative",
      consentAccepted: true,
      workSessionState: "active",
      foregroundPermission: "granted",
      backgroundPermission: "granted"
    });
    expect(decision.canSend).toBe(true);
    expect(decision.blockReason).toBeNull();
    expect(decision.showActiveBanner).toBe(true);
  });
});
