import { checkInToVisit, checkOutFromVisit, recordVisitExtras, hasVisitExtras, hasOtherOpenVisit, getVisitGeofenceStatus, closeStalePriorDayVisits, cancelOpenVisit, type VisitExtrasInput } from "../visit/repository.js";
import { insertLocationPings } from "../tracking/repository.js";
import { createTrackingRepository } from "../tracking/repository.js";
import { validatePings } from "../tracking/ping-validation.js";
import { runCreateFieldOrderWorkflow } from "../../workflows/commerce/create-field-order.js";
import { writeAuditLog } from "../audit-and-compliance/repository.js";
import { syncFieldOrderToErp, syncVisitOutcomeToErp, syncVisitExpensesToErp } from "../../integrations/erp-sync.js";
import { getOutletLocation } from "../lead-and-outlet/repository.js";
import { haversineMeters } from "../insights/geo.js";
import { queryRows, getDatabasePool } from "../../db/client.js";
import { calculateVisitDistance, checkRouteAdherence } from "../field-ops/distance-calculator.js";

const DEFAULT_GEOFENCE_METERS = 100;

/** The tenant's configured check-in radius (metres), or the default. */
async function geofenceRadiusMeters(organisationId: string): Promise<number> {
  const rows = await queryRows<{ geofence_radius_meters: number }>(
    `SELECT geofence_radius_meters FROM organisation_setting WHERE organisation_id = $1`,
    [organisationId]
  );
  const n = rows[0]?.geofence_radius_meters;
  return Number.isFinite(n) && n > 0 ? Number(n) : DEFAULT_GEOFENCE_METERS;
}

export interface MutationContext {
  organisationId: string;
  userId: string;
}

export interface MutationResult {
  status: "applied" | "conflict" | "rejected";
  result?: Record<string, unknown>;
  conflictReason?: string;
  serverState?: Record<string, unknown>;
  error?: string;
}

/**
 * Server-side dispatch table for offline mutation types. Each handler receives
 * the validated payload and returns a normalised MutationResult. Idempotency is
 * enforced ABOVE this layer via `mutation_record (organisation_id, idempotency_key)`.
 */
export async function dispatchMutation(
  type: string,
  payload: Record<string, unknown>,
  ctx: MutationContext
): Promise<MutationResult> {
  switch (type) {
    case "visit.check_in":
      return handleVisitCheckIn(payload, ctx);
    case "visit.check_out":
      return handleVisitCheckOut(payload, ctx);
    case "visit.cancel":
      return handleVisitCancel(payload, ctx);
    case "tracking.location.batch":
      return handleLocationBatch(payload, ctx);
    case "order.create":
      return handleOrderCreate(payload, ctx);
    default:
      return { status: "rejected", error: `Unknown mutation type: ${type}` };
  }
}

async function handleOrderCreate(
  payload: Record<string, unknown>,
  ctx: MutationContext
): Promise<MutationResult> {
  const outletId = typeof payload.outletId === "string" ? payload.outletId : "";
  const orderId = typeof payload.id === "string" && payload.id ? payload.id : `order_${Date.now()}`;
  const sourceCandidate = typeof payload.source === "string" ? payload.source : "offline";
  const source: "online" | "offline" | "sync" =
    sourceCandidate === "online" || sourceCandidate === "offline" || sourceCandidate === "sync"
      ? sourceCandidate
      : "offline";

  const linesRaw = Array.isArray(payload.lines) ? payload.lines : [];
  const lines = linesRaw
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      const productId = typeof r.productId === "string" ? r.productId : "";
      const qty = typeof r.quantity === "number" ? r.quantity : Number(r.quantity ?? 0);
      return { productId, quantity: qty };
    })
    .filter((l) => l.productId && l.quantity > 0);

  if (!outletId || lines.length === 0) {
    return { status: "rejected", error: "outletId and at least one positive-quantity line are required" };
  }

  try {
    const result = await runCreateFieldOrderWorkflow(
      {
        id: orderId,
        organisationId: ctx.organisationId,
        outletId,
        repUserId: ctx.userId,
        source,
        lines
      },
      {
        emit: async (event) => {
          await writeAuditLog({
            organisationId: ctx.organisationId,
            actorUserId: ctx.userId,
            action: event.name,
            targetType: "field_order",
            targetId: orderId,
            metadata: event.data
          });
        }
      }
    );
    // Best-effort mirror to ERP (no-op if disabled; errors swallowed in the bus).
    await syncFieldOrderToErp(ctx.organisationId, {
      fieldOrderId: orderId,
      outletId,
      repUserId: ctx.userId,
      totalCents: result.totalCents,
      lines
    });
    return {
      status: "applied",
      result: {
        id: orderId,
        totalCents: result.totalCents
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "order failed";
    // Duplicate-key on PG primary key means the order is already there — treat
    // as success (idempotency: client retried after losing ack).
    if (/duplicate key|already exists/i.test(message)) {
      return { status: "applied", result: { id: orderId, deduplicated: true } };
    }
    return { status: "rejected", error: message };
  }
}

async function handleVisitCheckIn(
  payload: Record<string, unknown>,
  ctx: MutationContext
): Promise<MutationResult> {
  const outletId = typeof payload.outletId === "string" ? payload.outletId : "";
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const id = typeof payload.id === "string" && payload.id ? payload.id : `visit_${Date.now()}`;

  if (!outletId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { status: "rejected", error: "outletId, latitude, longitude required" };
  }

  // SERVER-SIDE GEOFENCE — the rep's distance to the outlet is computed from the
  // outlet's authoritative DB location vs the device GPS, NOT trusted from the
  // client. Outside the tenant's radius → the check-in is rejected, so a rep
  // can't check in to a store they aren't physically at.
  const outletLoc = await getOutletLocation(ctx.organisationId, outletId);
  if (!outletLoc) {
    return { status: "rejected", error: "Unknown outlet for this organisation." };
  }
  const radius = await geofenceRadiusMeters(ctx.organisationId);
  const distance = haversineMeters(latitude, longitude, outletLoc.latitude, outletLoc.longitude);
  if (distance > radius) {
    return {
      status: "rejected",
      error: `You're ~${Math.round(distance)}m from this outlet. Move within ${radius}m to check in.`
    };
  }
  const geofenceStatus = "within";

  // Self-heal: abandon any open visits the rep left dangling on a PRIOR day so a
  // forgotten check-in from yesterday can't permanently block today's work.
  await closeStalePriorDayVisits(ctx.organisationId, ctx.userId);

  // Concurrent check-in guard: a rep can't have two open visits at once.
  if (await hasOtherOpenVisit(ctx.organisationId, ctx.userId, id)) {
    return {
      status: "conflict",
      conflictReason: "open_visit_exists",
      serverState: { message: "Finish your current visit before checking in elsewhere." }
    };
  }

  await checkInToVisit({
    id,
    organisationId: ctx.organisationId,
    outletId,
    assignedUserId: ctx.userId,
    latitude,
    longitude,
    geofenceStatus
  });
  return { status: "applied", result: { id, geofenceStatus, distanceMeters: Math.round(distance) } };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Defensively read the optional richer-capture extras from a check-out payload. */
function parseVisitExtras(raw: unknown): VisitExtrasInput {
  const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  return {
    feedbackRating: num(e.feedbackRating),
    npsScore: num(e.npsScore),
    feedbackText: str(e.feedbackText),
    signedBy: str(e.signedBy),
    signaturePath: str(e.signaturePath),
    expenses: arr(e.expenses).map((r) => ({
      category: str(r.category) ?? "", amountCents: num(r.amountCents) ?? 0, kms: num(r.kms), note: str(r.note)
    })),
    competitorIntel: arr(e.competitorIntel).map((r) => ({
      competitorName: str(r.competitorName) ?? "", productName: str(r.productName), priceCents: num(r.priceCents), promo: str(r.promo), note: str(r.note)
    })),
    samples: arr(e.samples).map((r) => ({
      itemName: str(r.itemName) ?? "", quantity: num(r.quantity) ?? 1, recipientName: str(r.recipientName), note: str(r.note)
    }))
  };
}

async function handleVisitCheckOut(
  payload: Record<string, unknown>,
  ctx: MutationContext
): Promise<MutationResult> {
  const visitId = typeof payload.visitId === "string" ? payload.visitId : "";
  if (!visitId) return { status: "rejected", error: "visitId required" };

  // Off-target enforcement: an out-of-geofence visit requires an explanatory note.
  const notesIn = typeof payload.notes === "string" ? payload.notes.trim() : "";
  const geofence = await getVisitGeofenceStatus(visitId, ctx.organisationId);
  if (geofence === "exception" && !notesIn) {
    return { status: "rejected", error: "This check-in was off-target — a note explaining why is required to complete it." };
  }

  await checkOutFromVisit({
    id: visitId,
    organisationId: ctx.organisationId,
    outcome: typeof payload.outcome === "string" ? payload.outcome : "completed",
    notes: typeof payload.notes === "string" ? payload.notes : null,
    latitude: typeof payload.latitude === "number" ? payload.latitude : null,
    longitude: typeof payload.longitude === "number" ? payload.longitude : null
  });

  // Persist richer-capture extras (feedback/NPS, expenses, competitor intel,
  // samples, customer acknowledgement) if the rep filled any in. Best-effort —
  // a failure here must not fail the check-out the rep already completed.
  const extras = parseVisitExtras(payload.extras);
  let distanceResult: { distanceKm: number; distanceMeters: number } | null = null;
  if (hasVisitExtras(extras)) {
    try {
      await recordVisitExtras(visitId, ctx.organisationId, extras);

      // Auto-calculate mileage expense amounts from distance × org rate.
      const dist = await calculateVisitDistance(ctx.organisationId, visitId).catch(() => null);
      if (dist && dist.pingCount > 0) {
        distanceResult = { distanceKm: dist.distanceKm, distanceMeters: dist.distanceMeters };
        const rateRows = await queryRows<{ rate: number }>(
          `SELECT mileage_rate_per_km_cents AS rate FROM organisation_setting WHERE organisation_id = $1`,
          [ctx.organisationId]
        );
        const ratePerKmCents = rateRows[0]?.rate ?? 0;
        if (ratePerKmCents > 0) {
          const pool = getDatabasePool();
          await pool.query(
              `UPDATE visit_expense
               SET amount_cents = ROUND(COALESCE(kms, calculated_kms, $2) * $3)
               WHERE visit_id = $1 AND organisation_id = $4
                 AND LOWER(category) = 'mileage' AND amount_cents = 0`,
            [visitId, dist.distanceKm, ratePerKmCents, ctx.organisationId]
          );
        }
      }

      if ((extras.expenses?.length ?? 0) > 0) {
        await syncVisitExpensesToErp(ctx.organisationId, visitId);
      }
    } catch (err) {
      process.stderr.write(`[sync] recordVisitExtras(${visitId}) failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  // Best-effort: route adherence check.
  const adherence = await checkRouteAdherence(ctx.organisationId, visitId).catch(() => null);

  // Best-effort: a sales/demo or service outcome creates an ERP Opportunity/Issue.
  await syncVisitOutcomeToErp(ctx.organisationId, visitId);

  return {
    status: "applied",
    result: {
      id: visitId,
      ...(distanceResult ? { distanceKm: distanceResult.distanceKm, distanceMeters: distanceResult.distanceMeters } : {}),
      ...(adherence ? { routeAdherence: adherence } : {})
    }
  };
}

/** Rep discards their own open (in-progress) visit — clears a stuck check-in. */
async function handleVisitCancel(
  payload: Record<string, unknown>,
  ctx: MutationContext
): Promise<MutationResult> {
  const visitId = typeof payload.visitId === "string" ? payload.visitId : "";
  if (!visitId) return { status: "rejected", error: "visitId required" };
  const cancelled = await cancelOpenVisit(visitId, ctx.organisationId, ctx.userId);
  return { status: "applied", result: { id: visitId, cancelled } };
}

async function handleLocationBatch(
  payload: Record<string, unknown>,
  ctx: MutationContext
): Promise<MutationResult> {
  const repo = createTrackingRepository();
  const active = await repo.queryActiveSession(ctx.organisationId, ctx.userId);
  if (!active) {
    return {
      status: "conflict",
      conflictReason: "no_active_session",
      serverState: { activeSession: null }
    };
  }

  const { valid, errors } = validatePings(payload.pings);
  if (valid.length === 0) {
    return { status: "rejected", error: "no valid pings", result: { errors } };
  }

  const inserted = await insertLocationPings({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    workSessionId: active.id,
    pings: valid
  });

  return {
    status: "applied",
    result: { workSessionId: active.id, inserted, errorCount: errors.length }
  };
}
