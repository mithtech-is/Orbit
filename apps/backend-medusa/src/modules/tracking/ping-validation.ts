export interface IncomingPing {
  id: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt?: string;
}

export interface ValidatedPing {
  id: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

export type PingValidationError =
  | { code: "id_missing" }
  | { code: "id_too_long"; id: string }
  | { code: "latitude_out_of_range"; id: string; value: unknown }
  | { code: "longitude_out_of_range"; id: string; value: unknown }
  | { code: "recorded_at_invalid"; id: string; value: unknown }
  | { code: "batch_too_large"; received: number; max: number };

export interface ValidationResult {
  valid: ValidatedPing[];
  errors: PingValidationError[];
}

/**
 * Hard cap on pings accepted per request. A healthy client sends 1 ping per
 * ~20s; even an offline backlog flush stays well under this. Capping bounds the
 * multi-row INSERT size and the per-batch broadcast fan-out so one oversized
 * request can't pin a DB connection or flood the WS gateway.
 */
export const MAX_PINGS_PER_BATCH = 200;

/**
 * Pure validator for an incoming ping batch. Coerces optional accuracy/recordedAt,
 * rejects malformed entries individually so a single bad ping doesn't drop the
 * batch, and truncates batches over {@link MAX_PINGS_PER_BATCH}.
 */
export function validatePings(incoming: unknown): ValidationResult {
  const result: ValidationResult = { valid: [], errors: [] };
  if (!Array.isArray(incoming)) return result;

  let list = incoming;
  if (incoming.length > MAX_PINGS_PER_BATCH) {
    result.errors.push({ code: "batch_too_large", received: incoming.length, max: MAX_PINGS_PER_BATCH });
    list = incoming.slice(0, MAX_PINGS_PER_BATCH);
  }

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (!id) {
      result.errors.push({ code: "id_missing" });
      continue;
    }
    if (id.length > 64) {
      result.errors.push({ code: "id_too_long", id });
      continue;
    }

    const latitude = Number(r.latitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      result.errors.push({ code: "latitude_out_of_range", id, value: r.latitude });
      continue;
    }

    const longitude = Number(r.longitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      result.errors.push({ code: "longitude_out_of_range", id, value: r.longitude });
      continue;
    }

    let accuracyMeters: number | null = null;
    if (r.accuracyMeters !== undefined && r.accuracyMeters !== null) {
      const a = Number(r.accuracyMeters);
      if (Number.isFinite(a) && a >= 0) accuracyMeters = a;
    }

    let recordedAt = new Date().toISOString();
    if (r.recordedAt !== undefined && r.recordedAt !== null) {
      const value = typeof r.recordedAt === "string" ? r.recordedAt : null;
      if (!value || Number.isNaN(Date.parse(value))) {
        result.errors.push({ code: "recorded_at_invalid", id, value: r.recordedAt });
        continue;
      }
      recordedAt = new Date(value).toISOString();
    }

    result.valid.push({ id, latitude, longitude, accuracyMeters, recordedAt });
  }

  return result;
}
