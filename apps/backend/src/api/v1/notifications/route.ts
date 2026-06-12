import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import {
  listNotifications,
  countUnread,
  markNotificationsRead,
  registerDeviceToken
} from "../../../modules/notification/repository.js";
import { clampLimit } from "../../../http/pagination.js";

/** GET /api/v1/notifications — the caller's own feed + unread count. */
export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  const limit = clampLimit(url.searchParams.get("limit"), 50, 200);

  const [items, unread] = await Promise.all([
    listNotifications(actor.organisationId, actor.userId, limit),
    countUnread(actor.organisationId, actor.userId)
  ]);

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "notification",
    unreadCount: unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      status: n.status,
      readAt: n.read_at,
      createdAt: n.created_at
    }))
  });
}

/** POST /api/v1/notifications — mark read. Body: { ids?: string[] } (empty/absent = mark all). */
export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const body = (req.body as Record<string, unknown>) ?? {};
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  const updated = await markNotificationsRead(actor.organisationId, actor.userId, ids);
  res.status(200).json({ updated });
}

/** POST /api/v1/notifications/devices — register/refresh this device's push token. */
export async function POST_DEVICE(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const body = (req.body as Record<string, unknown>) ?? {};
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const pushToken = typeof body.pushToken === "string" ? body.pushToken.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform : "unknown";
  const appVersion = typeof body.appVersion === "string" ? body.appVersion : undefined;
  if (!deviceId || !pushToken) {
    res.status(400).json({ code: "validation_error", message: "deviceId and pushToken are required" });
    return;
  }
  await registerDeviceToken({
    deviceId,
    organisationId: actor.organisationId,
    userId: actor.userId,
    platform,
    pushToken,
    appVersion
  });
  res.status(201).json({ deviceId, registered: true });
}
