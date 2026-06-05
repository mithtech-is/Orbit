/**
 * Sync-conflict resolution actions. Pure helpers (the DB/dispatch work lives in
 * the route) so the action vocabulary is unit-testable.
 *   - apply_client: re-run the client's mutation, overwriting server state.
 *   - apply_server: keep the server's current state, discard the client change.
 *   - dismiss: drop the conflict without applying either (operator judged it moot).
 */
export const CONFLICT_ACTIONS = ["apply_client", "apply_server", "dismiss"] as const;
export type ConflictAction = (typeof CONFLICT_ACTIONS)[number];

export function isConflictAction(value: unknown): value is ConflictAction {
  return typeof value === "string" && (CONFLICT_ACTIONS as readonly string[]).includes(value);
}

/** Whether the action re-applies the client payload (vs. just clearing the conflict). */
export function appliesClientChange(action: ConflictAction): boolean {
  return action === "apply_client";
}
