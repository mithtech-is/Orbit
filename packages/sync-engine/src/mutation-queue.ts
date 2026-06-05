export type MutationStatus = "pending" | "syncing" | "synced" | "failed" | "needs_review";

export interface OfflineMutation {
  id: string;
  idempotencyKey: string;
  type: string;
  payload: unknown;
  status?: MutationStatus;
  attempts?: number;
  lastError?: string;
}

export interface MutationQueueOptions {
  maxAttempts?: number;
}

export interface MutationQueue {
  enqueue(mutation: OfflineMutation): void;
  pending(): OfflineMutation[];
  /** Mutations that hit a transient error and will retry, plus those that have been moved to "needs_review". */
  failed(): OfflineMutation[];
  /** Every mutation in any status — for UIs that show full history. */
  all(): OfflineMutation[];
  get(id: string): OfflineMutation | undefined;
  markFailed(id: string, error: string): void;
  markSynced(id: string): void;
}

export function createMutationQueue(options: MutationQueueOptions = {}): MutationQueue {
  const maxAttempts = options.maxAttempts ?? 3;
  const mutations = new Map<string, Required<OfflineMutation>>();
  const keys = new Set<string>();

  return {
    enqueue(mutation) {
      if (keys.has(mutation.idempotencyKey)) {
        return;
      }

      keys.add(mutation.idempotencyKey);
      mutations.set(mutation.id, {
        ...mutation,
        status: mutation.status ?? "pending",
        attempts: mutation.attempts ?? 0,
        lastError: mutation.lastError ?? ""
      });
    },

    pending() {
      return [...mutations.values()].filter((mutation) => mutation.status === "pending");
    },

    failed() {
      return [...mutations.values()].filter((mutation) =>
        mutation.status === "failed" || mutation.status === "needs_review"
      );
    },

    all() {
      return [...mutations.values()];
    },

    get(id) {
      return mutations.get(id);
    },

    markFailed(id, error) {
      const mutation = mutations.get(id);
      if (!mutation) {
        return;
      }

      mutation.attempts += 1;
      mutation.lastError = error;
      mutation.status = mutation.attempts >= maxAttempts ? "needs_review" : "failed";
    },

    markSynced(id) {
      const mutation = mutations.get(id);
      if (mutation) {
        mutation.status = "synced";
      }
    }
  };
}
