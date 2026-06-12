import { describe, it, expect } from "vitest";
import { generateResetToken, hashResetToken } from "./password-reset.js";

describe("password reset tokens", () => {
  it("hashes deterministically and differs per token", () => {
    expect(hashResetToken("abc")).toBe(hashResetToken("abc"));
    expect(hashResetToken("abc")).not.toBe(hashResetToken("abd"));
    expect(hashResetToken("abc")).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("generates unique, url-safe tokens", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no +/=
    expect(a.length).toBeGreaterThan(20);
  });

  it("the stored hash never equals the raw token", () => {
    const t = generateResetToken();
    expect(hashResetToken(t)).not.toBe(t);
  });
});
