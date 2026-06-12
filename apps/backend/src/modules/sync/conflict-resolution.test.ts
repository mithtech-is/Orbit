import { describe, it, expect } from "vitest";
import { isConflictAction, appliesClientChange } from "./conflict-resolution.js";

describe("conflict resolution actions", () => {
  it("recognises the three valid actions", () => {
    expect(isConflictAction("apply_client")).toBe(true);
    expect(isConflictAction("apply_server")).toBe(true);
    expect(isConflictAction("dismiss")).toBe(true);
    expect(isConflictAction("merge")).toBe(false);
    expect(isConflictAction(undefined)).toBe(false);
  });

  it("only apply_client re-applies the client change", () => {
    expect(appliesClientChange("apply_client")).toBe(true);
    expect(appliesClientChange("apply_server")).toBe(false);
    expect(appliesClientChange("dismiss")).toBe(false);
  });
});
