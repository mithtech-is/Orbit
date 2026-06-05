import { createMutationQueue, type MutationQueue, type OfflineMutation } from "@orbit/sync-engine";
import type { SyncMutationInput, SyncPushResponse } from "@orbit/api-client";

export interface FlushResult {
  flushed: number;
  applied: number;
  conflicts: number;
  rejected: number;
}

export interface OfflineSyncDeps {
  /** Stable per-device id. Persisted alongside the auth token in real usage. */
  deviceId: string;
  /** Network-bound POST /api/v1/sync/push. */
  push: (input: { deviceId: string; mutations: SyncMutationInput[] }) => Promise<SyncPushResponse>;
}

/**
 * Mobile-side offline queue. Wraps `@orbit/sync-engine.createMutationQueue`
 * with the network bridge to the server `POST /api/v1/sync/push` endpoint and
 * the idempotency convention the server expects.
 *
 * Each enqueued mutation gets a stable `idempotencyKey` — the server PK is
 * `(organisation_id, idempotency_key)` so even if the device loses ack the
 * mutation is never re-applied.
 */
export interface OfflineSync {
  queue: MutationQueue;
  /** Convenience wrapper that builds an OfflineMutation and enqueues it. */
  enqueueMutation(input: {
    idempotencyKey: string;
    type: string;
    payload: Record<string, unknown>;
  }): void;
  /** Drains pending mutations to the server. Marks each result accordingly. */
  flush(): Promise<FlushResult>;
}

export function createOfflineSync(deps: OfflineSyncDeps): OfflineSync {
  const queue = createMutationQueue();

  return {
    queue,

    enqueueMutation(input) {
      const mutation: OfflineMutation = {
        id: input.idempotencyKey,
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        payload: input.payload
      };
      queue.enqueue(mutation);
    },

    async flush(): Promise<FlushResult> {
      const pending = queue.pending();
      if (pending.length === 0) return { flushed: 0, applied: 0, conflicts: 0, rejected: 0 };

      const mutations: SyncMutationInput[] = pending.map((m) => ({
        idempotencyKey: m.idempotencyKey,
        type: m.type,
        payload: (m.payload as Record<string, unknown>) ?? {}
      }));

      let response: SyncPushResponse;
      try {
        response = await deps.push({ deviceId: deps.deviceId, mutations });
      } catch (error) {
        // Whole-batch failure — mark every pending mutation as failed so
        // markFailed's retry/needs_review accounting still progresses.
        for (const m of pending) {
          queue.markFailed(m.id, error instanceof Error ? error.message : "network_error");
        }
        return { flushed: 0, applied: 0, conflicts: 0, rejected: pending.length };
      }

      let applied = 0;
      let conflicts = 0;
      let rejected = 0;
      for (const result of response.results) {
        const m = pending.find((p) => p.idempotencyKey === result.idempotencyKey);
        if (!m) continue;
        switch (result.status) {
          case "applied":
            queue.markSynced(m.id);
            applied += 1;
            break;
          case "conflict":
            queue.markFailed(m.id, result.conflictReason ?? "conflict");
            conflicts += 1;
            break;
          case "rejected":
          default:
            queue.markFailed(m.id, result.error ?? "rejected");
            rejected += 1;
            break;
        }
      }

      return { flushed: pending.length, applied, conflicts, rejected };
    }
  };
}
