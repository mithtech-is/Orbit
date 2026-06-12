import { getDatabasePool, queryRows } from "../../db/client.js";

export interface AttachmentRow {
  id: string;
  organisation_id: string;
  uploaded_by: string;
  category: string;
  visit_id: string | null;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export async function insertAttachment(input: {
  id: string;
  organisationId: string;
  uploadedBy: string;
  category: string;
  visitId?: string | null;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO attachment
       (id, organisation_id, uploaded_by, category, visit_id, storage_key, content_type, size_bytes, caption, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.id,
      input.organisationId,
      input.uploadedBy,
      input.category,
      input.visitId ?? null,
      input.storageKey,
      input.contentType,
      input.sizeBytes,
      input.caption ?? null,
      input.latitude ?? null,
      input.longitude ?? null
    ]
  );
}

/** Tenant-scoped fetch by id — used for download. Returns undefined if not in the tenant. */
export async function getAttachment(organisationId: string, id: string): Promise<AttachmentRow | undefined> {
  const rows = await queryRows<AttachmentRow>(
    `SELECT id, organisation_id, uploaded_by, category, visit_id, storage_key, content_type,
            size_bytes, caption, latitude, longitude, created_at
     FROM attachment WHERE organisation_id = $1 AND id = $2`,
    [organisationId, id]
  );
  return rows[0];
}

export function listAttachmentsForVisit(organisationId: string, visitId: string): Promise<AttachmentRow[]> {
  return queryRows<AttachmentRow>(
    `SELECT id, organisation_id, uploaded_by, category, visit_id, storage_key, content_type,
            size_bytes, caption, latitude, longitude, created_at
     FROM attachment WHERE organisation_id = $1 AND visit_id = $2
     ORDER BY created_at DESC`,
    [organisationId, visitId]
  );
}
