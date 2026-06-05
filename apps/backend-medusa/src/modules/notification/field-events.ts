import { queryRows } from "../../db/client.js";
import { dispatchNotification } from "./service.js";

/** Roles that should receive manager-facing operational alerts. */
const MANAGER_ROLES = ["sales_manager", "organisation_admin", "operations_user", "platform_admin"];

/** Active users in an org who should receive manager alerts. */
export async function listManagerUserIds(organisationId: string): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    `SELECT id FROM app_user WHERE organisation_id = $1 AND active = true AND role = ANY($2::text[])`,
    [organisationId, MANAGER_ROLES]
  );
  return rows.map((r) => r.id);
}

/**
 * Fan a notification out to every manager in an org. Best-effort — wraps the
 * whole thing so a notification can never break the action that triggered it.
 */
export async function notifyManagers(
  organisationId: string,
  n: { type: string; title: string; body?: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
    const ids = await listManagerUserIds(organisationId);
    for (const userId of ids) {
      await dispatchNotification({ organisationId, userId, ...n });
    }
  } catch (error) {
    process.stderr.write(`[notify] notifyManagers failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
