import type { MedusaRouteRequest, MedusaRouteResponse } from "../../types.js";
import { authenticateRequest } from "../../../auth/auth-middleware.js";
import { requireTenantPermission } from "../../../auth/tenant-auth.js";
import { createSurvey, listSurveys, submitSurveyResponse, listSurveyResponses } from "../../../modules/field-ops/repository.js";
import { writeAuditLog } from "../../../modules/audit-and-compliance/repository.js";

let counter = 0;
function genId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** GET /api/v1/surveys — active survey definitions (reps fill them in, managers author them). */
export async function GET(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  // Any authenticated user can read the active forms (reps need them to fill in).
  const rows = await listSurveys(actor.organisationId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "survey",
    items: rows.map((s) => ({ id: s.id, name: s.name, definition: s.definition, active: s.active, createdAt: s.created_at }))
  });
}

/** POST /api/v1/surveys — a manager creates a form. Body: { name, definition } */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const body = (req.body as Record<string, unknown>) ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ code: "validation_error", message: "name is required" });
    return;
  }
  const id = genId("svy");
  await createSurvey({ id, organisationId: actor.organisationId, name, definition: body.definition ?? {} });
  await writeAuditLog({
    organisationId: actor.organisationId, actorUserId: actor.userId,
    action: "survey.created", targetType: "survey", targetId: id, metadata: { name }
  });
  res.status(201).json({ id, name });
}

/** POST /api/v1/surveys/:id/responses — a rep submits answers (field). */
export async function POST_RESPONSE(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId, ownerUserId: actor.userId }, "visit:write");
  const surveyId = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  const body = (req.body as Record<string, unknown>) ?? {};
  if (!surveyId) {
    res.status(400).json({ code: "validation_error", message: "survey id required" });
    return;
  }
  const id = genId("svr");
  await submitSurveyResponse({
    id,
    organisationId: actor.organisationId,
    surveyId,
    submittedBy: actor.userId,
    outletId: typeof body.outletId === "string" ? body.outletId : null,
    answers: body.answers ?? {}
  });
  res.status(201).json({ id, surveyId });
}

/** GET /api/v1/surveys/:id/responses — manager reviews submissions. */
export async function GET_RESPONSES(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const actor = authenticateRequest(req);
  requireTenantPermission(actor, { organisationId: actor.organisationId }, "report:read");
  const surveyId = typeof req.headers["x-resource-id"] === "string" ? (req.headers["x-resource-id"] as string) : "";
  if (!surveyId) {
    res.status(400).json({ code: "validation_error", message: "survey id required" });
    return;
  }
  const rows = await listSurveyResponses(actor.organisationId, surveyId);
  res.status(200).json({
    organisationId: actor.organisationId,
    dataSource: "survey_response",
    surveyId,
    items: rows.map((r) => ({ id: r.id, submittedBy: r.submitted_by, outletId: r.outlet_id, answers: r.answers, createdAt: r.created_at }))
  });
}
