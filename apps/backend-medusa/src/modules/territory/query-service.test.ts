import { describe, expect, it } from "vitest";
import { isOutletInsideTerritory, listTenantTerritories } from "./query-service.js";

describe("territory query service", () => {
  it("detects whether an outlet coordinate is inside the tenant territory bounds", () => {
    expect(
      isOutletInsideTerritory({
        outlet: { latitude: 12.9719, longitude: 77.6412 },
        territory: {
          minLatitude: 12.9,
          maxLatitude: 13.02,
          minLongitude: 77.55,
          maxLongitude: 77.68
        }
      })
    ).toBe(true);

    expect(
      isOutletInsideTerritory({
        outlet: { latitude: 13.1, longitude: 77.8 },
        territory: {
          minLatitude: 12.9,
          maxLatitude: 13.02,
          minLongitude: 77.55,
          maxLongitude: 77.68
        }
      })
    ).toBe(false);
  });

  it("maps PostGIS envelope rows into territory summaries", async () => {
    const territories = await listTenantTerritories(
      {
        async queryTerritories(organisationId) {
          expect(organisationId).toBe("org_acme");
          return [
            {
              id: "territory_central",
              organisation_id: "org_acme",
              name: "Bengaluru Central",
              min_latitude: "12.90",
              max_latitude: "13.02",
              min_longitude: "77.55",
              max_longitude: "77.68"
            }
          ];
        }
      },
      "org_acme"
    );

    expect(territories[0]?.bounds.maxLongitude).toBe(77.68);
  });
});
