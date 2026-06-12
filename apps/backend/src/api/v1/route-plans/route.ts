import type { AppRouteRequest, AppRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import {
  createRoutePlanningRepository,
  createRoutePlan,
  previewRoutePlan,
  transitionRoutePlan,
  type RoutePlanAction
} from "../../../modules/route-planning/repository.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";
import { broadcastEvent } from "../../../realtime/ws-gateway.js";
import { dispatchNotification } from "../../../modules/notification/service.js";

export async function POST_PREVIEW(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  // Two-tier: managers (route:plan) can preview anyone's route, reps (visit:write)
  // can preview their OWN route. Preview is read-only (doesn't persist), so it's
  // safe to grant reps access — they need it to optimise their day on the mobile map.
  const canPlanAll = actor.permissions.includes("route:plan");
  const canPreviewOwn = actor.permissions.includes("visit:write");
  if (!canPlanAll && !canPreviewOwn) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "route:plan");
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  if (!body.routeDate || !body.stopIds || !Array.isArray(body.stopIds)) {
    res.status(400).json({ code: "validation_error", message: "routeDate and stopIds[] are required" });
    return;
  }

  try {
    const preview = await previewRoutePlan({
      organisationId: actor.organisationId,
      routeDate: body.routeDate as string,
      repLatitude: Number(body.repLatitude ?? 0),
      repLongitude: Number(body.repLongitude ?? 0),
      workingHoursStart: typeof body.workingHoursStart === "string" ? body.workingHoursStart : undefined,
      workingHoursEnd: typeof body.workingHoursEnd === "string" ? body.workingHoursEnd : undefined,
      stopIds: (body.stopIds as Array<Record<string, unknown>>).map((s) => ({
        outletId: s.outletId as string,
        expectedDurationMinutes: Number(s.expectedDurationMinutes ?? 15),
        priority: Number(s.priority ?? 0)
      })),
      returnToStart: body.returnToStart === true
    });
    res.status(200).json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview route";
    res.status(400).json({ code: "route_preview_error", message });
  }
}

export async function GET(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  // Same two-tier read scoping as /visits and /field-orders:
  //   - Anyone with route:plan (manager / admin / ops) sees ALL routes
  //   - Anyone with visit:write (reps, who need to see THEIR assigned routes) sees only their own
  //   - Anyone with neither → 403
  const canSeeAll = actor.permissions.includes("route:plan");
  const canSeeOwn = actor.permissions.includes("visit:write");
  if (!canSeeAll && !canSeeOwn) {
    requireTenantPermission(actor, { organisationId: actor.organisationId }, "route:plan");
    return;
  }

  const repo = createRoutePlanningRepository();
  const rows = await repo.queryRoutePlans(actor.organisationId);
  // Optional ?date=YYYY-MM-DD filter → "team's plans for today" for managers.
  const url = new URL(String(req.headers["x-request-url"] ?? ""), "http://localhost");
  const dateFilter = url.searchParams.get("date");
  const dated = dateFilter ? rows.filter((r) => r.route_date.slice(0, 10) === dateFilter) : rows;
  const scoped = canSeeAll ? dated : dated.filter((r) => r.assigned_user_id === actor.userId);

  const items = await Promise.all(
    scoped.map(r => repo.queryPlanWithStops(actor.organisationId, r.id))
  );

  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "route_plan",
    repScoped: !canSeeAll,
    items: items.filter(Boolean)
  });
}

export async function POST(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);

  requireTenantPermission(actor, { organisationId: actor.organisationId }, "route:plan");

  const body = req.body as Record<string, unknown>;

  if (!body.routeDate || !body.stopIds || !Array.isArray(body.stopIds)) {
    res.status(400).json({ code: "validation_error", message: "routeDate and stopIds[] are required" });
    return;
  }

  try {
    const detail = await createRoutePlan({
      id: `rp_${Date.now()}`,
      organisationId: actor.organisationId,
      assignedUserId: (body.assignedUserId as string) ?? actor.userId,
      routeDate: body.routeDate as string,
      repLatitude: Number(body.repLatitude ?? 0),
      repLongitude: Number(body.repLongitude ?? 0),
      release: body.release !== false,
      stopIds: (body.stopIds as Array<Record<string, unknown>>).map(s => ({
        outletId: s.outletId as string,
        expectedDurationMinutes: Number(s.expectedDurationMinutes ?? 15),
        priority: Number(s.priority ?? 0),
        visitType: typeof s.visitType === "string" ? s.visitType : undefined,
        objective: typeof s.objective === "string" ? s.objective : undefined
      }))
    });

    await writeAuditLog({
      organisationId: actor.organisationId,
      actorUserId: actor.userId,
      action: "route_plan.created",
      targetType: "route_plan",
      targetId: detail.id,
      metadata: {
        routeDate: detail.routeDate,
        stopCount: detail.stops.length,
        plannedDistanceMeters: detail.plannedDistanceMeters,
        plannedDurationMinutes: detail.plannedDurationMinutes,
        provider: detail.provider
      }
    });

    // Push the new plan to subscribers so the assigned rep's mobile app and
    // any open manager dashboards refresh without a manual reload. Filter
    // logic in ws-filter.ts ensures: anyone with `route:plan` sees it, and
    // only the assigned rep (visit:write) sees their own. Cross-tenant
    // delivery is blocked. We emit both event types because creating a plan
    // with an assignee is conceptually both "created" and "assigned" — a
    // future reassignment endpoint will emit only `route.plan.assigned`.
    const eventPayload = {
      organisationId: actor.organisationId,
      planId: detail.id,
      assignedUserId: detail.assignedUserId,
      routeDate: detail.routeDate,
      stopCount: detail.stops.length,
      plannedDistanceMeters: detail.plannedDistanceMeters,
      plannedDurationMinutes: detail.plannedDurationMinutes
    };
    broadcastEvent({ type: "route.plan.created", ...eventPayload });
    broadcastEvent({ type: "route.plan.assigned", ...eventPayload });

    // Notify the assigned agent their route is ready (best-effort, never blocks).
    if (detail.assignedUserId && detail.assignedUserId !== actor.userId) {
      await dispatchNotification({
        organisationId: actor.organisationId,
        userId: detail.assignedUserId,
        type: "route.released",
        title: "Route released",
        body: `Your route for ${detail.routeDate} is ready — ${detail.stops.length} stop(s).`,
        data: { planId: detail.id, routeDate: detail.routeDate, stopCount: detail.stops.length }
      });
    }

    res.status(201).json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create route plan";
    res.status(400).json({ code: "route_plan_error", message });
  }
}

const VALID_ACTIONS: RoutePlanAction[] = ["release", "start", "complete", "cancel"];

/** PUT /api/v1/route-plans/:id — apply a lifecycle action (release/start/complete/cancel). */
export async function PUT_TRANSITION(req: AppRouteRequest, res: AppRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "route:plan");

  const planId = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  const body = (req.body as Record<string, unknown>) ?? {};
  const action = typeof body.action === "string" ? body.action : "";
  if (!planId || !VALID_ACTIONS.includes(action as RoutePlanAction)) {
    res.status(400).json({ code: "validation_error", message: `id and action (${VALID_ACTIONS.join("|")}) are required` });
    return;
  }

  const result = await transitionRoutePlan(actor.organisationId, planId, action as RoutePlanAction);
  if (!result.ok) {
    res.status(result.error === "not_found" ? 404 : 409).json({ code: "transition_error", message: result.error });
    return;
  }

  await writeAuditLog({
    organisationId: actor.organisationId,
    actorUserId: actor.userId,
    action: `route_plan.${action}`,
    targetType: "route_plan",
    targetId: planId,
    metadata: { status: result.status }
  });

  // Notify the assigned agent when their plan is released.
  if (action === "release" && result.assignedUserId && result.assignedUserId !== actor.userId) {
    await dispatchNotification({
      organisationId: actor.organisationId,
      userId: result.assignedUserId,
      type: "route.released",
      title: "Route released",
      body: `Your route for ${result.routeDate} is ready.`,
      data: { planId, routeDate: result.routeDate }
    });
  }

  res.status(200).json({ id: planId, status: result.status });
}
