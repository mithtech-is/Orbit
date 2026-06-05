import { describe, expect, it } from "vitest";
import { createMutationQueue } from "./mutation-queue.js";

describe("offline mutation queue", () => {
  it("deduplicates idempotency keys and exposes pending mutations in enqueue order", () => {
    const queue = createMutationQueue();

    queue.enqueue({ id: "m1", idempotencyKey: "idem-1", type: "visit.check_in", payload: { visitId: "visit_1" } });
    queue.enqueue({ id: "m2", idempotencyKey: "idem-1", type: "visit.check_in", payload: { visitId: "visit_1" } });
    queue.enqueue({ id: "m3", idempotencyKey: "idem-2", type: "order.field_created", payload: { orderId: "order_1" } });

    expect(queue.pending().map((mutation) => mutation.id)).toEqual(["m1", "m3"]);
  });

  it("marks failed mutations as needs_review after retry budget is exhausted", () => {
    const queue = createMutationQueue({ maxAttempts: 2 });

    queue.enqueue({ id: "m1", idempotencyKey: "idem-1", type: "visit.note_updated", payload: {} });
    queue.markFailed("m1", "timeout");
    queue.markFailed("m1", "timeout");

    expect(queue.get("m1")?.status).toBe("needs_review");
  });
});
