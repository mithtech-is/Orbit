import { describe, expect, it } from "vitest";
import { buildVisitCheckoutMutation } from "./checkout-payload";

describe("buildVisitCheckoutMutation", () => {
  it("rejects checkout without an uploaded proof photo", () => {
    expect(() => buildVisitCheckoutMutation({
      visitId: "visit_1",
      outcome: "Order taken",
      notes: "Buyer confirmed the order.",
      proofPhotoIds: []
    })).toThrow("proof photo");
  });

  it("includes uploaded proof photo ids in the checkout extras", () => {
    const mutation = buildVisitCheckoutMutation({
      visitId: "visit_1",
      outcome: "Order taken",
      notes: "Buyer confirmed the order.",
      proofPhotoIds: ["att_1"]
    });

    expect(mutation).toEqual({
      idempotencyKey: "checkout_visit_1",
      type: "visit.check_out",
      payload: {
        visitId: "visit_1",
        outcome: "Order taken",
        notes: "Buyer confirmed the order.",
        extras: { proofPhotoIds: ["att_1"] }
      }
    });
  });
});
