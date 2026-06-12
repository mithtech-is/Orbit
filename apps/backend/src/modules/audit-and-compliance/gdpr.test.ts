import { describe, it, expect } from "vitest";
import { anonymisedEmail, ANONYMISED_NAME, EXPORT_ROW_CAP } from "./gdpr.js";

describe("gdpr anonymisation", () => {
  it("builds a unique, non-deliverable email per user", () => {
    expect(anonymisedEmail("user_rep_1")).toBe("erased_user_rep_1@deleted.invalid");
    expect(anonymisedEmail("a")).not.toBe(anonymisedEmail("b"));
  });

  it("strips unsafe characters from the user id", () => {
    expect(anonymisedEmail("a b/c@x")).toBe("erased_abcx@deleted.invalid");
  });

  it("exposes a fixed anonymised display name and a bounded export cap", () => {
    expect(ANONYMISED_NAME).toBe("Deleted user");
    expect(EXPORT_ROW_CAP).toBeGreaterThan(0);
  });
});
