import { describe, expect, it } from "vitest";
import { canAccessRecord, canSendLocation } from "./rbac.js";

describe("RBAC tenant isolation", () => {
  it("denies cross-organisation record access even when the permission name matches", () => {
    const allowed = canAccessRecord({
      actor: {
        organisationId: "org_a",
        role: "sales_manager",
        permissions: ["lead:read"]
      },
      record: {
        organisationId: "org_b",
        ownerUserId: "rep_1",
        assignedTeamIds: ["team_a"]
      },
      action: "lead:read"
    });

    expect(allowed).toBe(false);
  });

  it("rep with permission can access tenant-scoped record (no owner) — needed for listing outlets/leads", () => {
    expect(
      canAccessRecord({
        actor: { organisationId: "org_a", role: "field_sales_representative", permissions: ["outlet:read"], userId: "rep_1" },
        record: { organisationId: "org_a" },
        action: "outlet:read"
      })
    ).toBe(true);
  });

  it("rep is denied when an owner is named that isn't them", () => {
    expect(
      canAccessRecord({
        actor: { organisationId: "org_a", role: "field_sales_representative", permissions: ["visit:write"], userId: "rep_1" },
        record: { organisationId: "org_a", ownerUserId: "rep_2" },
        action: "visit:write"
      })
    ).toBe(false);
  });

  it("rep is allowed when the named owner matches their userId", () => {
    expect(
      canAccessRecord({
        actor: { organisationId: "org_a", role: "field_sales_representative", permissions: ["visit:write"], userId: "rep_1" },
        record: { organisationId: "org_a", ownerUserId: "rep_1" },
        action: "visit:write"
      })
    ).toBe(true);
  });

  it("allows a rep to send location only with consent and an active work session", () => {
    expect(
      canSendLocation({
        role: "field_sales_representative",
        consentAccepted: true,
        workSessionState: "active"
      })
    ).toBe(true);

    expect(
      canSendLocation({
        role: "field_sales_representative",
        consentAccepted: true,
        workSessionState: "stopped"
      })
    ).toBe(false);
  });
});
