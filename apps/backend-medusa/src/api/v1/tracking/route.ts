import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission, AuthorisationError } from "../../../auth/tenant-auth.js";
import { requireArea } from "../../../auth/areas.js";
import {
  createTrackingRepository,
  recordConsent,
  revokeConsent,
  startWorkSession,
  stopWorkSession,
  insertLocationPings,
  queryLatestConsentPerUser
} from "../../../modules/tracking/repository.js";
import { validatePings } from "../../../modules/tracking/ping-validation.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { broadcastTrackingEvent } from "../../../realtime/ws-gateway.js";
import { getEnv } from "../../../config/env.js";
import { isOrgWithinWorkingHours } from "../../../modules/tracking/working-hours.js";

export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);

  // Same two-tier scoping as /visits and /field-orders:
  //   - tracking:view_live (managers, ops, admins) → see all sessions in org
  //   - tracking:send (reps) → see only their OWN sessions, so the mobile
  //     home screen can show whether their session is active without
  //     leaking other reps' positions.
  //   - neither → 403
  const canSeeAll = actor.permissions.includes("tracking:view_live");
  const canSeeOwn = actor.permissions.includes("tracking:send");
  if (!canSeeAll && !canSeeOwn) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "tracking:view_live");
    return;
  }

  const repo = createTrackingRepository();
  // Reps (tracking:send only) get their OWN sessions via a rep-scoped SQL query
  // rather than loading the whole org and filtering in JS — the mobile app polls
  // this every 30s, so at scale the org-wide read was the dominant load.
  const scoped = canSeeAll
    ? await repo.querySessionsToday(actor.organisationId)
    : await repo.querySessionsTodayForUser(actor.organisationId, actor.userId);

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "tracking",
    repScoped: !canSeeAll,
    items: scoped.map((s) => ({
      id: s.id,
      userId: s.user_id,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      startedLatitude: s.started_latitude,
      startedLongitude: s.started_longitude
    }))
  });
}

export async function GET_LATEST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "tracking:view_live");

  const repo = createTrackingRepository();
  const rows = await repo.queryLatestPingsForActiveSessions(
    actor.organisationId,
    getEnv().trackingLiveWindowSeconds
  );
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "tracking_latest",
    liveWindowSeconds: getEnv().trackingLiveWindowSeconds,
    items: rows.map((r) => ({
      repUserId: r.user_id,
      workSessionId: r.work_session_id,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyMeters: r.accuracy_meters,
      recordedAt: r.recorded_at
    }))
  });
}

/**
 * GET /api/v1/tracking/consent-status — admin view of each user's latest
 * location-sharing consent + the reason they last gave for turning it off.
 * Powers the "Tracking" column on the web Users page. Gated on user:manage.
 */
export async function GET_CONSENT_STATUS(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "user:manage");

  const rows = await queryLatestConsentPerUser(actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId,
    items: rows.map((r) => ({
      userId: r.user_id,
      // "sharing" = currently granted AND not revoked.
      sharing: r.granted && !r.revoked_at,
      grantedAt: r.granted_at,
      revokedAt: r.revoked_at,
      revokeReason: r.revoke_reason
    }))
  });
}

export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  // Recording consent/sessions/pings is a FIELD action — admins never do it.
  requireArea(actor, "field");
  const body = req.body as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  switch (action) {
    case "record_consent":
      requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "tracking:send");
      return handleRecordConsent(actor, body, res);
    case "revoke_consent":
      requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "tracking:send");
      return handleRevokeConsent(actor, body, res);
    case "start_session":
      requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "tracking:send");
      return handleStartSession(actor, body, res);
    case "stop_session":
      requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "tracking:send");
      return handleStopSession(actor, res);
    case "record_pings":
      requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "tracking:send");
      return handleRecordPings(actor, body, res);
    default:
      res.status(400).json({
        code: "validation_error",
        message:
          "action must be 'record_consent', 'revoke_consent', 'start_session', 'stop_session', or 'record_pings'"
      });
  }
}

async function handleRecordConsent(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const granted = body.granted !== false;

  const consentId = await recordConsent({
    organisationId: actor.organisationId,
    userId: actor.userId,
    granted
  });

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "tracking.consent.recorded",
    targetType: "consent_log",
    targetId: consentId,
    metadata: { granted }
  });

  res.status(201).json({
    id: consentId,
    organisationId: actor.organisationId,
    userId: actor.userId,
    granted
  });
}

async function handleRevokeConsent(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  // Working-hours guard: a rep may freely turn sharing OFF outside working
  // hours, but DURING working hours it's an exception that REQUIRES a written
  // reason. The reason is stored on the consent row + audited so admins can see
  // why each rep went dark, on the Users page.
  const duringWorkHours = await isOrgWithinWorkingHours(actor.organisationId);
  if (duringWorkHours && reason.length < 5) {
    res.status(422).json({
      code: "reason_required",
      message:
        "You're within working hours. To turn off location sharing now, please enter a short reason (at least 5 characters). Your manager will see it."
    });
    return;
  }

  const result = await revokeConsent({
    organisationId: actor.organisationId,
    userId: actor.userId,
    reason: reason || null
  });

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "tracking.consent.revoked",
    targetType: "app_user",
    targetId: actor.userId,
    metadata: { ...result, duringWorkHours, reason: reason || null }
  });

  res.status(200).json({ ...result, organisationId: actor.organisationId, userId: actor.userId, duringWorkHours });
}

async function handleStartSession(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const repo = createTrackingRepository();

  const latestConsent = await repo.queryLatestConsent(actor.organisationId, actor.userId);
  if (!latestConsent || !latestConsent.granted || latestConsent.revoked_at) {
    res.status(403).json({ code: "consent_required", message: "Tracking consent not granted" });
    return;
  }

  const active = await repo.queryActiveSession(actor.organisationId, actor.userId);
  if (active) {
    res.status(409).json({ code: "session_active", message: "An active session already exists" });
    return;
  }

  const sessionId = `wses_${Date.now()}`;
  const latitude = typeof body.latitude === "number" ? body.latitude : undefined;
  const longitude = typeof body.longitude === "number" ? body.longitude : undefined;

  await startWorkSession({
    id: sessionId,
    organisationId: actor.organisationId,
    userId: actor.userId,
    consentId: latestConsent.id,
    latitude,
    longitude
  });

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "tracking.session.started",
    targetType: "work_session",
    targetId: sessionId,
    metadata: { latitude, longitude }
  });

  res.status(201).json({
    id: sessionId,
    organisationId: actor.organisationId,
    userId: actor.userId,
    status: "active",
    startedAt: new Date().toISOString()
  });
}

async function handleStopSession(
  actor: { userId: string; organisationId: string },
  res: MedusaRouteResponse
) {
  const repo = createTrackingRepository();

  const active = await repo.queryActiveSession(actor.organisationId, actor.userId);
  if (!active) {
    res.status(404).json({ code: "no_active_session", message: "No active session found" });
    return;
  }

  await stopWorkSession({
    organisationId: actor.organisationId,
    sessionId: active.id
  });

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "tracking.session.stopped",
    targetType: "work_session",
    targetId: active.id
  });

  res.status(200).json({
    id: active.id,
    status: "stopped",
    stoppedAt: new Date().toISOString()
  });
}

async function handleRecordPings(
  actor: { userId: string; organisationId: string },
  body: Record<string, unknown>,
  res: MedusaRouteResponse
) {
  const repo = createTrackingRepository();
  const active = await repo.queryActiveSession(actor.organisationId, actor.userId);
  if (!active) {
    throw new AuthorisationError("No active work session — start one before sending pings");
  }

  const { valid, errors } = validatePings(body.pings);
  if (valid.length === 0) {
    res.status(400).json({ code: "validation_error", message: "no valid pings in batch", errors });
    return;
  }

  const inserted = await insertLocationPings({
    organisationId: actor.organisationId,
    userId: actor.userId,
    workSessionId: active.id,
    pings: valid
  });

  for (const ping of valid) {
    broadcastTrackingEvent({
      type: "tracking.location.recorded",
      organisationId: actor.organisationId,
      repUserId: actor.userId,
      workSessionId: active.id,
      locationEventId: ping.id,
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracyMeters: ping.accuracyMeters,
      recordedAt: ping.recordedAt
    });
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: "tracking.location.batch_recorded",
    targetType: "work_session",
    targetId: active.id,
    metadata: { received: Array.isArray(body.pings) ? body.pings.length : 0, inserted, errorCount: errors.length }
  });

  res.status(201).json({
    organisationId: actor.organisationId,
    workSessionId: active.id,
    receivedCount: Array.isArray(body.pings) ? body.pings.length : 0,
    insertedCount: inserted,
    errors
  });
}
