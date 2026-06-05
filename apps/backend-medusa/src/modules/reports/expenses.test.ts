import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({
  queryRowsMock: vi.fn()
}));

vi.mock("../../db/client.js", () => ({
  queryRows: queryRowsMock
}));

import { loadExpenseReport } from "./repository.js";

describe("loadExpenseReport", () => {
  beforeEach(() => {
    queryRowsMock.mockReset();
  });

  it("returns detailed expenses and per-rep totals with ERP sync status", async () => {
    queryRowsMock.mockResolvedValueOnce([
      {
        expense_id: "exp_1",
        visit_id: "visit_1",
        visit_date: "2026-06-03",
        outlet_id: "outlet_1",
        outlet_name: "North Store",
        rep_user_id: "rep_1",
        rep_name: "Anita Rep",
        category: "Fuel",
        amount_cents: 25000,
        kms: 18,
        note: "Route fuel",
        created_at: "2026-06-03T10:00:00.000Z",
        erp_id: "EXP-0001"
      },
      {
        expense_id: "exp_2",
        visit_id: "visit_2",
        visit_date: "2026-06-03",
        outlet_id: "outlet_2",
        outlet_name: "South Store",
        rep_user_id: "rep_1",
        rep_name: "Anita Rep",
        category: "Food",
        amount_cents: 12000,
        kms: null,
        note: null,
        created_at: "2026-06-03T11:00:00.000Z",
        erp_id: null
      }
    ]);

    const report = await loadExpenseReport("org_1", { from: "2026-06-01", to: "2026-06-30" });

    expect(report.totalExpenseCents).toBe(37000);
    expect(report.repTotals).toEqual([
      { repUserId: "rep_1", repName: "Anita Rep", totalExpenseCents: 37000, expenseCount: 2, erpSyncedCount: 1 }
    ]);
    expect(report.items[0]).toMatchObject({
      expenseId: "exp_1",
      repUserId: "rep_1",
      amountCents: 25000,
      erpSyncStatus: "synced",
      erpId: "EXP-0001"
    });
    expect(report.items[1].erpSyncStatus).toBe("pending");
    expect(queryRowsMock.mock.calls[0]?.[1]).toEqual(["org_1", "2026-06-01", "2026-06-30"]);
  });
});
