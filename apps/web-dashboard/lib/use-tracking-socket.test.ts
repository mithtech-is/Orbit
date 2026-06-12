import { describe, expect, it } from "vitest";
import { nextReconnectDelayMs } from "./use-tracking-socket";

describe("nextReconnectDelayMs", () => {
  it("doubles from a 1s base for each attempt", () => {
    expect(nextReconnectDelayMs(0)).toBe(1000);
    expect(nextReconnectDelayMs(1)).toBe(2000);
    expect(nextReconnectDelayMs(2)).toBe(4000);
    expect(nextReconnectDelayMs(3)).toBe(8000);
    expect(nextReconnectDelayMs(4)).toBe(16000);
  });

  it("caps at 30s once the exponential curve exceeds the ceiling", () => {
    expect(nextReconnectDelayMs(5)).toBe(30000);
    expect(nextReconnectDelayMs(6)).toBe(30000);
    expect(nextReconnectDelayMs(100)).toBe(30000);
  });

  it("treats negative attempts as the first attempt (defensive)", () => {
    expect(nextReconnectDelayMs(-1)).toBe(1000);
    expect(nextReconnectDelayMs(-50)).toBe(1000);
  });
});
