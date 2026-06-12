import { describe, expect, it } from "vitest";
import { actorFromHeaders, AuthorisationError, requireTenantPermission } from "./tenant-auth.js";

describe("tenant authorisation foundation", () => {
  it("throws before a manager can read a record from another organisation", () => {
    expect(() =>
      requireTenantPermission(
        {
          userId: "manager_1",
          organisationId: "org_a",
          role: "sales_manager",
          permissions: ["lead:read"]
        },
        { organisationId: "org_b", assignedTeamIds: ["team_1"] },
        "lead:read"
      )
    ).toThrow(AuthorisationError);
  });

  it("builds an actor context from route headers", () => {
    const actor = actorFromHeaders({
      "x-field-sales-user-id": "user_1",
      "x-field-sales-organisation-id": "org_1",
      "x-field-sales-role": "organisation_admin",
      "x-field-sales-permissions": "user:manage,policy:manage"
    });

    expect(actor.permissions).toEqual(["user:manage", "policy:manage"]);
  });
});
