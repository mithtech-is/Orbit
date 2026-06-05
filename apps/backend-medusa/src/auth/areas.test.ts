import { describe, it, expect } from "vitest";
import { areaForRole, requireArea } from "./areas.js";
import { AuthorisationError } from "./tenant-auth.js";

describe("areaForRole", () => {
  it("maps only field_sales_representative to the field area", () => {
    expect(areaForRole("field_sales_representative")).toBe("field");
  });

  it("maps every management/back-office role to the admin area", () => {
    for (const role of ["platform_admin", "organisation_admin", "sales_manager", "operations_user", "readonly_analyst"]) {
      expect(areaForRole(role)).toBe("admin");
    }
  });

  it("defaults unknown roles to admin (closed to the field app, not open to it)", () => {
    expect(areaForRole("something_new")).toBe("admin");
  });
});

describe("requireArea", () => {
  it("allows a matching area", () => {
    expect(() => requireArea({ role: "organisation_admin" }, "admin")).not.toThrow();
    expect(() => requireArea({ role: "field_sales_representative" }, "field")).not.toThrow();
  });

  it("rejects a field rep reaching an admin endpoint", () => {
    expect(() => requireArea({ role: "field_sales_representative" }, "admin")).toThrow(AuthorisationError);
  });

  it("rejects an admin reaching a field-only endpoint", () => {
    expect(() => requireArea({ role: "organisation_admin" }, "field")).toThrow(AuthorisationError);
    expect(() => requireArea({ role: "sales_manager" }, "field")).toThrow(AuthorisationError);
  });
});
