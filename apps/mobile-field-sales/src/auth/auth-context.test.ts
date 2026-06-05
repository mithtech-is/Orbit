import { describe, expect, it } from "vitest";
import { hasAnyPermission } from "./auth-context";

/**
 * Permissions for the seeded users (see scripts/seed-demo-data.ts).
 * Captured here so a regression that shifts the seed mapping also breaks
 * the test — RBAC nav decisions are *the* security boundary on mobile.
 */
const REP_PERMS = ["lead:read", "outlet:read", "visit:write", "tracking:send", "order:create"];
const MANAGER_PERMS = ["lead:read", "lead:write", "outlet:read", "route:plan", "tracking:view_live", "report:read"];
const ADMIN_PERMS = [
  "organisation:manage", "user:manage", "team:manage", "policy:manage",
  "audit:read", "report:read",
  "lead:read", "lead:write", "outlet:read", "outlet:write",
  "territory:manage", "route:plan", "tracking:view_live"
];

describe("hasAnyPermission", () => {
  it("returns true for required=null (always-visible items)", () => {
    expect(hasAnyPermission([], null)).toBe(true);
    expect(hasAnyPermission(undefined, null)).toBe(true);
    expect(hasAnyPermission(REP_PERMS, null)).toBe(true);
  });

  it("returns false when permissions are missing or empty against a real requirement", () => {
    expect(hasAnyPermission(undefined, ["user:manage"])).toBe(false);
    expect(hasAnyPermission([], ["user:manage"])).toBe(false);
  });

  it("hides admin links from a field rep", () => {
    // The exact leak the user reported — Rohan (a rep) seeing Users / Audit /
    // Organisation settings. None of these should resolve to true.
    expect(hasAnyPermission(REP_PERMS, ["user:manage"])).toBe(false);
    expect(hasAnyPermission(REP_PERMS, ["audit:read"])).toBe(false);
    expect(hasAnyPermission(REP_PERMS, ["organisation:manage"])).toBe(false);
    expect(hasAnyPermission(REP_PERMS, ["territory:manage"])).toBe(false);
    expect(hasAnyPermission(REP_PERMS, ["route:plan"])).toBe(false);
    expect(hasAnyPermission(REP_PERMS, ["tracking:view_live"])).toBe(false);
    expect(hasAnyPermission(REP_PERMS, ["report:read"])).toBe(false);
  });

  it("keeps the rep's operational tabs visible", () => {
    // Visits + Outlets + Leads + Orders tabs — these must still show.
    expect(hasAnyPermission(REP_PERMS, ["visit:write", "report:read"])).toBe(true);
    expect(hasAnyPermission(REP_PERMS, ["outlet:read", "outlet:write"])).toBe(true);
    expect(hasAnyPermission(REP_PERMS, ["lead:read", "lead:write"])).toBe(true);
    expect(hasAnyPermission(REP_PERMS, ["order:create", "report:read"])).toBe(true);
  });

  it("gives a sales manager their planning + live-map tools", () => {
    expect(hasAnyPermission(MANAGER_PERMS, ["route:plan"])).toBe(true);
    expect(hasAnyPermission(MANAGER_PERMS, ["tracking:view_live"])).toBe(true);
    expect(hasAnyPermission(MANAGER_PERMS, ["report:read"])).toBe(true);
    // But not org-level admin.
    expect(hasAnyPermission(MANAGER_PERMS, ["organisation:manage"])).toBe(false);
    expect(hasAnyPermission(MANAGER_PERMS, ["user:manage"])).toBe(false);
  });

  it("grants an organisation_admin everything we gate today", () => {
    expect(hasAnyPermission(ADMIN_PERMS, ["organisation:manage"])).toBe(true);
    expect(hasAnyPermission(ADMIN_PERMS, ["user:manage"])).toBe(true);
    expect(hasAnyPermission(ADMIN_PERMS, ["audit:read"])).toBe(true);
    expect(hasAnyPermission(ADMIN_PERMS, ["territory:manage"])).toBe(true);
  });

  it("matches when at least ONE of the required permissions is held", () => {
    // hasAny semantics — not all-of.
    expect(hasAnyPermission(["report:read"], ["visit:write", "report:read"])).toBe(true);
    expect(hasAnyPermission(["lead:read"], ["lead:read", "lead:write"])).toBe(true);
  });
});
