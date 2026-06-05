import { insertNotification, listPushTokensForUser } from "./repository.js";
import { getPushProvider } from "../../integrations/push-provider.js";

let counter = 0;
function notificationId(): string {
  counter += 1;
  return `ntf_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export interface DispatchNotificationInput {
  organisationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /** When false, only persist (no push). Defaults true. */
  push?: boolean;
}

/**
 * Persist an in-app notification for a user AND push it to their devices.
 * Best-effort: never throws into the caller's request path — a failed push or
 * insert is logged, not propagated, so a notification can't break the action
 * that triggered it (visit reassigned, order accepted, etc.).
 */
export async function dispatchNotification(input: DispatchNotificationInput): Promise<{ id: string }> {
  const id = notificationId();
  try {
    await insertNotification({
      id,
      organisationId: input.organisationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data
    });
  } catch (error) {
    process.stderr.write(`[notify] persist failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  if (input.push !== false) {
    try {
      const tokens = await listPushTokensForUser(input.organisationId, input.userId);
      if (tokens.length > 0) {
        await getPushProvider().send({
          to: tokens,
          title: input.title,
          body: input.body ?? input.title,
          data: { ...input.data, notificationId: id, type: input.type }
        });
      }
    } catch (error) {
      process.stderr.write(`[notify] push failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  return { id };
}

/** Retained for the Medusa module-registration shim. */
export default class NotificationModuleService {
  listTenantModules() {
    return ["notifications", "deliveries", "preferences"];
  }
}
