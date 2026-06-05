import { describe, expect, it } from "vitest";
import { validatePings, MAX_PINGS_PER_BATCH } from "./ping-validation.js";

describe("validatePings", () => {
  it("returns empty result for non-array input", () => {
    expect(validatePings(null).valid).toEqual([]);
    expect(validatePings("nope").valid).toEqual([]);
    expect(validatePings({ pings: [] }).valid).toEqual([]);
  });

  it("rejects pings missing an id", () => {
    const r = validatePings([{ latitude: 12.97, longitude: 77.59 }]);
    expect(r.valid).toEqual([]);
    expect(r.errors).toEqual([{ code: "id_missing" }]);
  });

  it("rejects out-of-range coordinates per-item without dropping the batch", () => {
    const r = validatePings([
      { id: "ok", latitude: 12.97, longitude: 77.59 },
      { id: "bad-lat", latitude: 95, longitude: 77.59 },
      { id: "bad-lng", latitude: 12.97, longitude: 200 }
    ]);
    expect(r.valid.map((p) => p.id)).toEqual(["ok"]);
    expect(r.errors.map((e) => e.code)).toEqual(["latitude_out_of_range", "longitude_out_of_range"]);
  });

  it("coerces optional accuracy and recordedAt", () => {
    const r = validatePings([
      { id: "p1", latitude: 12.97, longitude: 77.59, accuracyMeters: "8.5", recordedAt: "2026-05-28T10:00:00.000Z" },
      { id: "p2", latitude: 12.97, longitude: 77.59 }
    ]);
    expect(r.valid[0]).toMatchObject({
      id: "p1",
      latitude: 12.97,
      longitude: 77.59,
      accuracyMeters: 8.5,
      recordedAt: "2026-05-28T10:00:00.000Z"
    });
    expect(r.valid[1].accuracyMeters).toBeNull();
    expect(typeof r.valid[1].recordedAt).toBe("string");
  });

  it("rejects unparseable recordedAt with a per-item error", () => {
    const r = validatePings([{ id: "p1", latitude: 12.97, longitude: 77.59, recordedAt: "not-a-date" }]);
    expect(r.valid).toEqual([]);
    expect(r.errors[0]).toEqual({ code: "recorded_at_invalid", id: "p1", value: "not-a-date" });
  });

  it("truncates an oversized batch and reports it", () => {
    const oversized = Array.from({ length: MAX_PINGS_PER_BATCH + 50 }, (_, i) => ({
      id: `p${i}`,
      latitude: 12.97,
      longitude: 77.59
    }));
    const r = validatePings(oversized);
    expect(r.valid).toHaveLength(MAX_PINGS_PER_BATCH);
    expect(r.errors).toContainEqual({
      code: "batch_too_large",
      received: MAX_PINGS_PER_BATCH + 50,
      max: MAX_PINGS_PER_BATCH
    });
  });

  it("accepts a batch exactly at the cap with no error", () => {
    const atCap = Array.from({ length: MAX_PINGS_PER_BATCH }, (_, i) => ({
      id: `p${i}`,
      latitude: 12.97,
      longitude: 77.59
    }));
    const r = validatePings(atCap);
    expect(r.valid).toHaveLength(MAX_PINGS_PER_BATCH);
    expect(r.errors).toEqual([]);
  });
});
