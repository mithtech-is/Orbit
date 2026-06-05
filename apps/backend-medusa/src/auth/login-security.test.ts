import { describe, it, expect } from "vitest";
import { lockoutSeconds, LOGIN_MAX_ATTEMPTS } from "./login-security.js";

describe("lockoutSeconds", () => {
  it("does not lock below the threshold", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect(lockoutSeconds(i)).toBe(0);
    }
  });

  it("escalates 1m → 5m → 15m and caps", () => {
    expect(lockoutSeconds(LOGIN_MAX_ATTEMPTS)).toBe(60);
    expect(lockoutSeconds(LOGIN_MAX_ATTEMPTS + 1)).toBe(5 * 60);
    expect(lockoutSeconds(LOGIN_MAX_ATTEMPTS + 2)).toBe(15 * 60);
    expect(lockoutSeconds(LOGIN_MAX_ATTEMPTS + 50)).toBe(15 * 60); // capped
  });
});
