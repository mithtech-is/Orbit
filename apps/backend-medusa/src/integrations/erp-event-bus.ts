/**
 * Lightweight in-process event bus for ERP-bound events.
 *
 * Orbit domain code emits typed events (e.g. `field_order.created`,
 * `outlet.created`, `field_product.updated`); the ERP adapter subscribes to
 * the events it cares about and translates them into ERP API calls.
 *
 * This stub uses an in-memory subscriber map suitable for a single-process
 * deployment. For multi-replica deployments, swap the backend for Redis
 * pub/sub or a real queue (BullMQ / RabbitMQ) — the public surface stays
 * the same.
 *
 * See docs/integrations/erpnext-integration-plan.md.
 */

export type ErpEventName =
  | "outlet.created"
  | "outlet.updated"
  | "outlet.deleted"
  | "field_product.created"
  | "field_product.updated"
  | "field_order.created"
  | "field_order.cancelled"
  | "user.invited"
  | "visit.checked_out";

export interface ErpEventEnvelope<P = Record<string, unknown>> {
  name: ErpEventName;
  organisationId: string;
  emittedAt: string;
  payload: P;
}

type Handler = (event: ErpEventEnvelope) => Promise<void> | void;

const handlers: Map<ErpEventName, Set<Handler>> = new Map();

export function subscribeErpEvent(name: ErpEventName, handler: Handler): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  set.add(handler);
  return () => set?.delete(handler);
}

export async function emitErpEvent(event: ErpEventEnvelope): Promise<void> {
  const set = handlers.get(event.name);
  if (!set || set.size === 0) return;
  const results = await Promise.allSettled(Array.from(set).map((h) => h(event)));
  for (const r of results) {
    if (r.status === "rejected") {
      // ERP failures must not bubble back into the Orbit mutation path.
      console.warn(`[erp-event-bus] handler for ${event.name} rejected:`, r.reason);
    }
  }
}

/**
 * Helper for tests and shutdown — never call from production code paths.
 */
export function _resetErpHandlers(): void {
  handlers.clear();
}
