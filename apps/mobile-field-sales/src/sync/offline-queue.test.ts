import { describe, expect, it } from "vitest";
import { createOfflineSync } from "./offline-queue";
import type { SyncPushResponse } from "@orbit/api-client";

function buildPush(perKey: Record<string, "applied" | "conflict" | "rejected">) {
  return async ({ deviceId, mutations }: { deviceId: string; mutations: Array<{ idempotencyKey: string }> }): Promise<SyncPushResponse> => ({
    organisationId: "org_acme",
    deviceId,
    received: mutations.length,
    results: mutations.map((m) => ({
      idempotencyKey: m.idempotencyKey,
      status: perKey[m.idempotencyKey] ?? "applied"
    }))
  });
}

describe("offline sync queue", () => {
  it("enqueues, dedupes by idempotency key, and tracks status from server results", async () => {
    const sync = createOfflineSync({ deviceId: "dev_test", push: buildPush({ "idem-1": "applied", "idem-2": "conflict" }) });

    sync.enqueueMutation({ idempotencyKey: "idem-1", type: "visit.check_in", payload: { outletId: "o1" } });
    sync.enqueueMutation({ idempotencyKey: "idem-1", type: "visit.check_in", payload: { outletId: "o1" } });
    sync.enqueueMutation({ idempotencyKey: "idem-2", type: "visit.check_in", payload: { outletId: "o2" } });

    expect(sync.queue.pending()).toHaveLength(2);

    const result = await sync.flush();
    expect(result).toEqual({ flushed: 2, applied: 1, conflicts: 1, rejected: 0 });

    expect(sync.queue.get("idem-1")?.status).toBe("synced");
    expect(sync.queue.get("idem-2")?.status).toBe("failed");
  });

  it("marks every pending mutation failed when the push call throws", async () => {
    const sync = createOfflineSync({
      deviceId: "dev_test",
      push: async () => { throw new Error("offline"); }
    });
    sync.enqueueMutation({ idempotencyKey: "idem-x", type: "visit.check_in", payload: {} });

    const result = await sync.flush();
    expect(result).toEqual({ flushed: 0, applied: 0, conflicts: 0, rejected: 1 });
    expect(sync.queue.get("idem-x")?.lastError).toBe("offline");
  });

  it("flush is a no-op when nothing is pending", async () => {
    const sync = createOfflineSync({ deviceId: "dev_test", push: buildPush({}) });
    expect(await sync.flush()).toEqual({ flushed: 0, applied: 0, conflicts: 0, rejected: 0 });
  });
});
