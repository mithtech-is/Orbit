/**
 * Tiny in-app event bus for "a visit was completed".
 *
 * The guided route map (RouteMapScreen) must only advance to the next stop once
 * the rep has actually completed the current stop's visit (geofenced check-in +
 * required outcome/notes). The visit form lives on a separate stack screen
 * (VisitCheckInScreen) with no direct callback back to the map, so on completion
 * it emits the outlet id here and the map — still mounted under the tab —
 * advances its pointer. No backend round-trip, so it works offline too.
 */
type VisitCompletedListener = (outletId: string) => void;

const listeners = new Set<VisitCompletedListener>();

/** Subscribe to visit-completed events. Returns an unsubscribe function. */
export function onVisitCompleted(listener: VisitCompletedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit that the visit for `outletId` was completed (check-out recorded). */
export function emitVisitCompleted(outletId: string): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(outletId);
    } catch {
      // A listener error must never break the checkout flow.
    }
  }
}

/**
 * Sibling bus for "an order was created for an outlet". After the rep submits an
 * order mid-visit, the order screens unwind back to the VisitCheckInScreen (still
 * mounted underneath) — this lets that screen confirm "order saved" and nudge the
 * rep to finish the visit, without threading a callback through the order stack.
 */
type OrderCreatedListener = (outletId: string) => void;

const orderListeners = new Set<OrderCreatedListener>();

/** Subscribe to order-created events. Returns an unsubscribe function. */
export function onOrderCreated(listener: OrderCreatedListener): () => void {
  orderListeners.add(listener);
  return () => {
    orderListeners.delete(listener);
  };
}

/** Emit that an order was created for `outletId`. */
export function emitOrderCreated(outletId: string): void {
  for (const listener of Array.from(orderListeners)) {
    try {
      listener(outletId);
    } catch {
      // A listener error must never break the order flow.
    }
  }
}
