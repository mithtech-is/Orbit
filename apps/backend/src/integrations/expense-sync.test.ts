import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock, provider } = vi.hoisted(() => ({
  queryRowsMock: vi.fn(),
  provider: {
    name: "erpnext",
    pushCustomer: vi.fn(async () => ({ localId: "outlet_1", erpId: "CUST-1", lastSyncedAt: new Date().toISOString(), direction: "push" })),
    pushExpenseClaim: vi.fn(async () => ({ localId: "exp_1", erpId: "EXP-1", lastSyncedAt: new Date().toISOString(), direction: "push" }))
  }
}));

vi.mock("../db/client.js", () => ({
  queryRows: queryRowsMock
}));

vi.mock("./erp-provider.js", async () => {
  const actual = await vi.importActual<typeof import("./erp-provider.js")>("./erp-provider.js");
  return {
    ...actual,
    getErpProvider: () => provider
  };
});

import { syncVisitExpensesToErp } from "./erp-sync.js";

describe("syncVisitExpensesToErp", () => {
  beforeEach(() => {
    queryRowsMock.mockReset();
    provider.pushCustomer.mockClear();
    provider.pushExpenseClaim.mockClear();
  });

  it("pushes each visit expense as an ERP expense claim payload", async () => {
    queryRowsMock
      .mockResolvedValueOnce([
        {
          id: "exp_1",
          visit_id: "visit_1",
          outlet_id: "outlet_1",
          outlet_name: "North Store",
          rep_user_id: "rep_1",
          rep_name: "Anita Rep",
          rep_email: "anita@example.com",
          category: "Fuel",
          amount_cents: 25000,
          kms: 18,
          note: "Route fuel",
          created_at: "2026-06-03T10:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([]) // getErpMapping for expense_claim
      .mockResolvedValueOnce([
        {
          id: "rep_1",
          name: "Anita Rep",
          email: "anita@example.com",
          role: "field_sales_representative"
        }
      ]); // loadRep inside syncRepToErpAsEmployee

    await syncVisitExpensesToErp("org_1", "visit_1");

    expect(provider.pushCustomer).toHaveBeenCalledWith({ outletId: "outlet_1", name: "North Store" }, { organisationId: "org_1" });
    expect(provider.pushExpenseClaim).toHaveBeenCalledWith({
      expenseId: "exp_1",
      visitId: "visit_1",
      outletId: "outlet_1",
      outletName: "North Store",
      repUserId: "rep_1",
      repName: "Anita Rep",
      repEmail: "anita@example.com",
      category: "Fuel",
      amountCents: 25000,
      kms: 18,
      note: "Route fuel",
      expenseDate: "2026-06-03"
    }, { organisationId: "org_1", idempotencyKey: "expense:exp_1" });
  });
});
