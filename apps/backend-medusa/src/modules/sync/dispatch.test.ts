import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted to top — must use vi.hoisted() to share state
// with the test body. See https://vitest.dev/api/vi.html#vi-hoisted
const { runWorkflowMock, writeAuditMock } = vi.hoisted(() => ({
  runWorkflowMock: vi.fn(),
  writeAuditMock: vi.fn(async () => undefined)
}));

vi.mock("../../workflows/commerce/create-field-order.js", () => ({
  runCreateFieldOrderWorkflow: runWorkflowMock
}));
vi.mock("../audit-and-compliance/repository.js", () => ({
  writeAuditLog: writeAuditMock
}));
vi.mock("../visit/repository.js", () => ({
  checkInToVisit: vi.fn(async () => undefined),
  checkOutFromVisit: vi.fn(async () => undefined)
}));
vi.mock("../tracking/repository.js", () => ({
  insertLocationPings: vi.fn(async () => 0),
  createTrackingRepository: () => ({ queryActiveSession: vi.fn() })
}));
vi.mock("../tracking/ping-validation.js", () => ({
  validatePings: () => ({ valid: [], errors: [] })
}));

import { dispatchMutation } from "./dispatch.js";

const CTX = { organisationId: "mithtech", userId: "user_rep_1" };

describe("dispatchMutation order.create", () => {
  beforeEach(() => {
    runWorkflowMock.mockReset();
    writeAuditMock.mockReset();
  });

  it("rejects when outletId or lines missing", async () => {
    const a = await dispatchMutation("order.create", { lines: [] }, CTX);
    expect(a.status).toBe("rejected");
    const b = await dispatchMutation("order.create", { outletId: "o1", lines: [] }, CTX);
    expect(b.status).toBe("rejected");
    const c = await dispatchMutation("order.create", { outletId: "o1" }, CTX);
    expect(c.status).toBe("rejected");
  });

  it("calls workflow + invokes the emit hook + returns applied with medusa id", async () => {
    runWorkflowMock.mockImplementationOnce(async (_input, hooks) => {
      // Simulate the real workflow: invoke the emit hook so the dispatcher's
      // audit-log writer fires.
      await hooks?.emit?.({ name: "field_order.created", data: { orderId: "order_x" } });
      return {
        id: "order_x", totalCents: 5000, status: "accepted",
        provider: "field_order_pg_with_medusa_bridge",
        medusaOrderId: "order_medusa_x", bridgeError: null
      };
    });
    const result = await dispatchMutation("order.create", {
      id: "order_x",
      outletId: "outlet_1",
      source: "offline",
      lines: [{ productId: "prod_1", quantity: 2 }]
    }, CTX);
    expect(result.status).toBe("applied");
    expect(result.result?.id).toBe("order_x");
    expect(result.result?.medusaOrderId).toBe("order_medusa_x");
    expect(runWorkflowMock).toHaveBeenCalledOnce();
    expect(writeAuditMock).toHaveBeenCalledOnce();
  });

  it("treats duplicate-key error as idempotent success", async () => {
    runWorkflowMock.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));
    const result = await dispatchMutation("order.create", {
      id: "order_dup",
      outletId: "outlet_1",
      lines: [{ productId: "prod_1", quantity: 1 }]
    }, CTX);
    expect(result.status).toBe("applied");
    expect(result.result?.deduplicated).toBe(true);
  });

  it("propagates non-duplicate workflow errors as rejected", async () => {
    runWorkflowMock.mockRejectedValueOnce(new Error("insufficient inventory for prod_1"));
    const result = await dispatchMutation("order.create", {
      id: "order_oos",
      outletId: "outlet_1",
      lines: [{ productId: "prod_1", quantity: 99999 }]
    }, CTX);
    expect(result.status).toBe("rejected");
    expect(result.error).toMatch(/insufficient inventory/);
  });

  it("normalises invalid source values to 'offline'", async () => {
    runWorkflowMock.mockResolvedValueOnce({
      id: "order_y", totalCents: 100, status: "accepted",
      provider: "field_order_pg", medusaOrderId: null, bridgeError: null
    });
    await dispatchMutation("order.create", {
      id: "order_y", outletId: "o1", source: "garbage",
      lines: [{ productId: "p1", quantity: 1 }]
    }, CTX);
    expect(runWorkflowMock.mock.calls[0]?.[0]?.source).toBe("offline");
  });
});

describe("dispatchMutation unknown type", () => {
  it("rejects unknown mutation types", async () => {
    const result = await dispatchMutation("not.a.real.type", {}, CTX);
    expect(result.status).toBe("rejected");
    expect(result.error).toMatch(/Unknown mutation type/);
  });
});
