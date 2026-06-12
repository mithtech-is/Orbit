import { describe, it, expect } from "vitest";
import { isPingLive, isSessionStale } from "./staleness.js";

const NOW = 1_700_000_000_000; // fixed clock — keep tests deterministic

describe("isPingLive", () => {
  const liveWindow = 300; // 5 min

  it("treats a fresh ping as live", () => {
    expect(isPingLive(NOW - 10_000, NOW, liveWindow)).toBe(true);
  });

  it("treats a ping exactly at the window boundary as live", () => {
    expect(isPingLive(NOW - 300_000, NOW, liveWindow)).toBe(true);
  });

  it("treats a ping just past the window as not live", () => {
    expect(isPingLive(NOW - 300_001, NOW, liveWindow)).toBe(false);
  });

  it("treats a long-dead ping as not live (the fake-live-location bug)", () => {
    expect(isPingLive(NOW - 24 * 60 * 60 * 1000, NOW, liveWindow)).toBe(false);
  });

  it("treats a future-dated ping as live, not stale (clock skew tolerance)", () => {
    expect(isPingLive(NOW + 5_000, NOW, liveWindow)).toBe(true);
  });

  it("returns false for non-finite inputs", () => {
    expect(isPingLive(NaN, NOW, liveWindow)).toBe(false);
    expect(isPingLive(NOW, Number.POSITIVE_INFINITY, liveWindow)).toBe(false);
  });
});

describe("isSessionStale", () => {
  const staleAfter = 900; // 15 min

  it("a just-started session with no pings is not stale", () => {
    expect(isSessionStale(NOW - 30_000, NOW, staleAfter)).toBe(false);
  });

  it("a session at the boundary is not yet stale", () => {
    expect(isSessionStale(NOW - 900_000, NOW, staleAfter)).toBe(false);
  });

  it("a session silent past the window is stale", () => {
    expect(isSessionStale(NOW - 900_001, NOW, staleAfter)).toBe(true);
  });

  it("an abandoned day-old session is stale", () => {
    expect(isSessionStale(NOW - 24 * 60 * 60 * 1000, NOW, staleAfter)).toBe(true);
  });

  it("returns false for non-finite inputs", () => {
    expect(isSessionStale(NaN, NOW, staleAfter)).toBe(false);
  });
});
