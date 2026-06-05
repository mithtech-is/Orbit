import { describe, it, expect } from "vitest";
import { canTransition, allowedTransitions, isOrderStatus } from "./order-status.js";

describe("order status machine", () => {
  it("recognises valid statuses", () => {
    expect(isOrderStatus("accepted")).toBe(true);
    expect(isOrderStatus("shipped")).toBe(false);
  });

  it("allows accepted → fulfilled/cancelled", () => {
    expect(canTransition("accepted", "fulfilled")).toBe(true);
    expect(canTransition("accepted", "cancelled")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransition("fulfilled", "accepted")).toBe(false);
    expect(canTransition("cancelled", "accepted")).toBe(false);
    expect(allowedTransitions("fulfilled")).toEqual([]);
  });

  it("rejects no-op and unknown transitions", () => {
    expect(canTransition("accepted", "accepted")).toBe(false);
    expect(canTransition("accepted", "shipped")).toBe(false);
    expect(canTransition("bogus", "accepted")).toBe(false);
  });
});
