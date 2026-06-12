import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted, so define the mock INSIDE the factory and grab
// a handle to it lazily — declaring a top-level const and referencing it in the
// factory hits a TDZ error.
vi.mock("../../db/client.js", () => ({ queryRows: vi.fn() }));

import { queryRows } from "../../db/client.js";
import { resolveFuelRate } from "./fuel-rate.js";

const mockRows = vi.mocked(queryRows);

beforeEach(() => mockRows.mockReset());

describe("resolveFuelRate", () => {
  it("returns 'none' with zero rate when the user has no rate set anywhere", async () => {
    mockRows.mockResolvedValueOnce([{ rep_override: null, vehicle_id: null, vehicle_name: null, vehicle_rate: null, org_default: null }]);
    const r = await resolveFuelRate("org", "user");
    expect(r).toEqual({ ratePerKmCents: 0, source: "none", vehicleTypeId: null, vehicleTypeName: null, repOverrideCents: null });
  });

  it("returns 'none' when the user doesn't exist", async () => {
    mockRows.mockResolvedValueOnce([]);
    const r = await resolveFuelRate("org", "ghost");
    expect(r.source).toBe("none");
    expect(r.ratePerKmCents).toBe(0);
  });

  it("falls through to the org default when nothing else is set", async () => {
    mockRows.mockResolvedValueOnce([{ rep_override: null, vehicle_id: null, vehicle_name: null, vehicle_rate: null, org_default: 800 }]);
    const r = await resolveFuelRate("org", "user");
    expect(r.source).toBe("org_default");
    expect(r.ratePerKmCents).toBe(800);
  });

  it("picks the vehicle type rate over the org default", async () => {
    mockRows.mockResolvedValueOnce([{ rep_override: null, vehicle_id: "v1", vehicle_name: "Bike", vehicle_rate: 350, org_default: 800 }]);
    const r = await resolveFuelRate("org", "user");
    expect(r.source).toBe("vehicle_type");
    expect(r.ratePerKmCents).toBe(350);
    expect(r.vehicleTypeName).toBe("Bike");
  });

  it("picks the per-rep override over the vehicle type rate AND the org default", async () => {
    mockRows.mockResolvedValueOnce([{ rep_override: 500, vehicle_id: "v1", vehicle_name: "Bike", vehicle_rate: 350, org_default: 800 }]);
    const r = await resolveFuelRate("org", "user");
    expect(r.source).toBe("rep_override");
    expect(r.ratePerKmCents).toBe(500);
    // Vehicle info still surfaces — useful for the UI "Bike @ rep override ₹5/km".
    expect(r.vehicleTypeId).toBe("v1");
    expect(r.repOverrideCents).toBe(500);
  });

  it("treats a zero override as 'unset' (falls through, doesn't return 0 as the winning rate)", async () => {
    mockRows.mockResolvedValueOnce([{ rep_override: 0, vehicle_id: "v1", vehicle_name: "Bike", vehicle_rate: 350, org_default: 800 }]);
    const r = await resolveFuelRate("org", "user");
    expect(r.source).toBe("vehicle_type");
    expect(r.ratePerKmCents).toBe(350);
  });

  it("treats a zero vehicle rate as 'unset' (falls through to org default)", async () => {
    mockRows.mockResolvedValueOnce([{ rep_override: null, vehicle_id: "v1", vehicle_name: "Bike", vehicle_rate: 0, org_default: 800 }]);
    const r = await resolveFuelRate("org", "user");
    expect(r.source).toBe("org_default");
    expect(r.ratePerKmCents).toBe(800);
  });
});
