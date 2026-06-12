/**
 * Field-order lifecycle state machine. Orders are created `accepted` (the
 * existing workflow), then a manager (or the owning rep) can move them through
 * fulfilment or cancel them. Terminal states reject further transitions.
 * Pure — unit tested, no DB.
 */
export const ORDER_STATUSES = ["pending", "accepted", "fulfilled", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: []
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isOrderStatus(from) || !isOrderStatus(to)) return false;
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: string): OrderStatus[] {
  return isOrderStatus(from) ? TRANSITIONS[from] : [];
}
