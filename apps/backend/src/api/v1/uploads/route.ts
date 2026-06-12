import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { getEnv } from "../../../config/env.js";
import { getStorageProvider, buildObjectKey, isAllowedContentType } from "../../../integrations/storage-provider.js";
import { insertAttachment, getAttachment } from "../../../modules/attachment/repository.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

let counter = 0;
function attachmentId(): string {
  counter += 1;
  return `att_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * POST /api/v1/uploads — store a base64-encoded file (visit photo, etc.).
 * Body: { category, visitId?, contentType, dataBase64, caption?, latitude?, longitude? }
 * Base64-over-JSON keeps it compatible with the hand-rolled JSON request layer
 * and the mobile client; size is capped by MAX_UPLOAD_BYTES.
 */
export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const body = (req.body as Record<string, unknown>) ?? {};

  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "general";
  const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  const visitId = typeof body.visitId === "string" && body.visitId ? body.visitId : null;
  const caption = typeof body.caption === "string" ? body.caption.slice(0, 500) : null;
  const latitude = typeof body.latitude === "number" ? body.latitude : null;
  const longitude = typeof body.longitude === "number" ? body.longitude : null;

  if (!isAllowedContentType(contentType)) {
    res.status(400).json({ code: "validation_error", message: "Unsupported contentType (allowed: jpeg, png, webp, heic, pdf)" });
    return;
  }
  if (!dataBase64) {
    res.status(400).json({ code: "validation_error", message: "dataBase64 is required" });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataBase64, "base64");
  } catch {
    res.status(400).json({ code: "validation_error", message: "dataBase64 is not valid base64" });
    return;
  }
  if (bytes.length === 0) {
    res.status(400).json({ code: "validation_error", message: "Empty upload" });
    return;
  }
  if (bytes.length > getEnv().maxUploadBytes) {
    res.status(413).json({ code: "payload_too_large", message: `Upload exceeds ${getEnv().maxUploadBytes} bytes` });
    return;
  }

  const id = attachmentId();
  const key = buildObjectKey({ organisationId: actor.organisationId, category, id, contentType });
  await getStorageProvider().put(key, bytes, contentType);
  await insertAttachment({
    id,
    organisationId: actor.organisationId,
    uploadedBy: actor.userId,
    category,
    visitId,
    storageKey: key,
    contentType,
    sizeBytes: bytes.length,
    caption,
    latitude,
    longitude
  });

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "attachment.uploaded",
    targetType: "attachment",
    targetId: id,
    metadata: { category, visitId, contentType, sizeBytes: bytes.length }
  });

  res.status(201).json({ id, category, visitId, contentType, sizeBytes: bytes.length, url: `/api/v1/uploads/${id}` });
}

/**
 * GET /api/v1/uploads/:id — returns the object as base64 JSON, tenant-scoped.
 * The :id is passed through `x-resource-id` by the router. Clients build a data
 * URL (`data:<contentType>;base64,<dataBase64>`) for <img>.
 */
export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  const id = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!id) {
    res.status(400).json({ code: "validation_error", message: "attachment id required" });
    return;
  }
  const row = await getAttachment(actor.organisationId, id);
  if (!row) {
    res.status(404).json({ code: "not_found", message: "Attachment not found" });
    return;
  }
  const object = await getStorageProvider().get(row.storage_key);
  if (!object) {
    res.status(404).json({ code: "not_found", message: "Object missing from storage" });
    return;
  }
  res.status(200).json({
    id: row.id,
    contentType: object.contentType,
    caption: row.caption,
    dataBase64: object.bytes.toString("base64"),
    createdAt: row.created_at
  });
}
