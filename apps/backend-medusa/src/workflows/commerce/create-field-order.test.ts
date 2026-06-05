import { describe, expect, it, vi } from "vitest";
import { runCreateFieldOrderWorkflow } from "./create-field-order.js";

// We mock the underlying createFieldOrder import; the workflow exists
// specifically so callers don't depend on the PG implementation.
vi.mock("../../modules/commerce/repository.js", () => ({
  createFieldOrder: vi.fn(async (input: { id: string }) => ({
    id: input.id,
    status: "accepted",
    totalCents: 12345,
    medusaOrderId: null,
    bridgeError: null
  }))
}));

describe("runCreateFieldOrderWorkflow", () => {
  it("returns the workflow-shape output with provider tag when bridge skipped", async () => {
    const result = await runCreateFieldOrderWorkflow({
      id: "order_test_1",
      organisationId: "org_acme",
      outletId: "outlet_1",
      repUserId: "user_rep_1",
      source: "online",
      lines: [{ productId: "prod_1", quantity: 2 }]
    });
    expect(result).toEqual({
      id: "order_test_1",
      status: "accepted",
      totalCents: 12345,
      provider: "field_order_pg",
      medusaOrderId: null,
      bridgeError: null
    });
  });

  it("invokes the emit hook with a normalised field_order.created event", async () => {
    const events: Array<{ name: string; data: Record<string, unknown> }> = [];
    const result = await runCreateFieldOrderWorkflow(
      {
        id: "order_test_2",
        organisationId: "org_acme",
        outletId: "outlet_2",
        repUserId: "user_rep_1",
        source: "offline",
        lines: [{ productId: "prod_1", quantity: 1 }]
      },
      { emit: (e) => { events.push(e); } }
    );
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("field_order.created");
    expect(events[0].data).toMatchObject({
      organisationId: "org_acme",
      orderId: "order_test_2",
      outletId: "outlet_2",
      repUserId: "user_rep_1",
      source: "offline",
      provider: "field_order_pg",
      medusaOrderId: null,
      bridgeError: null
    });
    expect(result.provider).toBe("field_order_pg");
  });
});
