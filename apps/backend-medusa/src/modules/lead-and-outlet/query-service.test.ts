import { describe, expect, it } from "vitest";
import { assignLeadToRep, filterTenantOutlets, listTenantLeads, listTenantOutlets } from "./query-service.js";

describe("lead and outlet query service", () => {
  it("filters outlets by organisation", () => {
    expect(
      filterTenantOutlets(
        [
          { id: "outlet_1", organisationId: "org_a", name: "A", latitude: 1, longitude: 1 },
          { id: "outlet_2", organisationId: "org_b", name: "B", latitude: 2, longitude: 2 }
        ],
        "org_a"
      ).map((outlet) => outlet.id)
    ).toEqual(["outlet_1"]);
  });

  it("rejects cross-tenant lead assignment", () => {
    expect(() =>
      assignLeadToRep(
        {
          id: "lead_1",
          organisationId: "org_b",
          outletId: "outlet_1",
          name: "Lead",
          status: "new",
          priority: 3,
          assignedUserId: "rep_old",
          assignedUserName: "Old Rep",
          latitude: null,
          longitude: null
        },
        "org_a",
        "rep_new"
      )
    ).toThrow("Cannot assign a lead outside the active organisation");
  });

  it("maps tenant outlet rows into API summaries", async () => {
    const outlets = await listTenantOutlets(
      {
        async queryOutlets(organisationId) {
          expect(organisationId).toBe("org_acme");
          return [
            {
              id: "outlet_1",
              organisation_id: "org_acme",
              name: "Indiranagar Fresh Mart",
              latitude: "12.9719",
              longitude: "77.6412"
            }
          ];
        }
      },
      "org_acme"
    );

    expect(outlets[0]).toEqual({
      id: "outlet_1",
      organisationId: "org_acme",
      name: "Indiranagar Fresh Mart",
      latitude: 12.9719,
      longitude: 77.6412,
      lastVisitedAt: null,
      visitCount: 0
    });
  });

  it("maps tenant lead rows into API summaries", async () => {
    const leads = await listTenantLeads(
      {
        async queryLeads(organisationId) {
          expect(organisationId).toBe("org_acme");
          return [
            {
              id: "lead_1",
              organisation_id: "org_acme",
              outlet_id: "outlet_1",
              name: "Lead 1 Bengaluru",
              status: "qualified",
              priority: 3,
              assigned_user_id: "user_rep_1",
              assigned_user_name: "Rohan Iyer",
              latitude: null,
              longitude: null
            }
          ];
        }
      },
      "org_acme"
    );

    expect(leads[0]?.assignedUserId).toBe("user_rep_1");
  });
});
