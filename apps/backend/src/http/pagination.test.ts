import { describe, expect, it } from "vitest";
import { clampLimit, paginate } from "./pagination.js";

describe("clampLimit", () => {
  it("uses the fallback for missing/invalid/non-positive input", () => {
    expect(clampLimit(undefined, 200, 500)).toBe(200);
    expect(clampLimit("abc", 200, 500)).toBe(200);
    expect(clampLimit(0, 200, 500)).toBe(200);
    expect(clampLimit(-5, 200, 500)).toBe(200);
  });

  it("caps at max and floors fractional values", () => {
    expect(clampLimit(9999, 200, 500)).toBe(500);
    expect(clampLimit(50.9, 200, 500)).toBe(50);
    expect(clampLimit("100", 200, 500)).toBe(100);
  });
});

describe("paginate", () => {
  it("reports hasMore when the sentinel row is present", () => {
    const rows = [1, 2, 3, 4]; // fetched with limit + 1 where limit = 3
    expect(paginate(rows, 3)).toEqual({ items: [1, 2, 3], hasMore: true });
  });

  it("reports no more when rows fit within the limit", () => {
    expect(paginate([1, 2], 3)).toEqual({ items: [1, 2], hasMore: false });
    expect(paginate([1, 2, 3], 3)).toEqual({ items: [1, 2, 3], hasMore: false });
  });

  it("handles an empty result", () => {
    expect(paginate([], 10)).toEqual({ items: [], hasMore: false });
  });
});
