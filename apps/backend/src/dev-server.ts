import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";

(() => {
  try {
    const envFile = join(process.cwd(), ".env.scaffold");
    if (!existsSync(envFile)) return;
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // non-fatal
  }
})();

import { getEnv } from "./config/env.js";
import { attachWsGateway } from "./realtime/ws-gateway.js";
import { startRetentionScheduler } from "./internal/jobs/retention-scheduler.js";
import { startSessionExpiryScheduler } from "./internal/jobs/session-expiry-scheduler.js";
import { startVisitSweepScheduler } from "./internal/jobs/visit-sweep-scheduler.js";
import { startEodAdherenceScheduler } from "./internal/jobs/eod-adherence-scheduler.js";
import { startProductCatalogSync } from "./internal/jobs/product-catalog-sync.js";
import { applySecurityHeaders } from "./http/security.js";
import { bucketForPath, checkRateLimitAsync, rateLimitPrincipal } from "./http/rate-limit.js";
import { getRequestAuthSafe } from "./auth/auth-middleware.js";
import { isJtiRevoked } from "./auth/login-security.js";
import { logRequest, nextCorrelationId } from "./http/request-logger.js";
import { captureError, isSentryConfigured } from "./http/sentry.js";
import type { AppRouteRequest, AppRouteResponse } from "./api/types.js";

import { GET as getSession } from "./api/v1/auth/session/route.js";
import { GET as getLeads, POST as postLead, PUT as putLead, DEL as delLead, PATCH_STATUS as patchLeadStatus } from "./api/v1/leads/route.js";
import { GET as getOrganisation } from "./api/v1/organisations/route.js";
import { GET as getOutlets, POST as postOutlet, POST_IMPORT as postOutletsImport, PUT as putOutlet, DEL as delOutlet } from "./api/v1/outlets/route.js";
import {
  GET as getTerritories, POST as postTerritory, PUT as putTerritory, DEL as delTerritory, GET_OUTLETS as getTerritoryOutlets
} from "./api/v1/territories/route.js";
import { GET as getVisits, POST as postVisit, PUT as putVisit, GET_ATTACHMENTS as getVisitAttachments, GET_EXTRAS as getVisitExtras, POST_SCHEDULE as postVisitSchedule } from "./api/v1/visits/route.js";
import { GET as getTracking, GET_LATEST as getTrackingLatest, GET_CONSENT_STATUS as getTrackingConsentStatus, POST as postTracking } from "./api/v1/tracking/route.js";
import { GET as getRoutePlans, POST as postRoutePlan, POST_PREVIEW as postRoutePlanPreview, PUT_TRANSITION as putRoutePlanTransition } from "./api/v1/route-plans/route.js";
import { POST as postLogin } from "./api/v1/auth/login/route.js";
import { POST as postForgotPassword } from "./api/v1/auth/forgot-password/route.js";
import { POST as postAuthResetPassword } from "./api/v1/auth/reset-password/route.js";
import { POST as postLogout } from "./api/v1/auth/logout/route.js";
import { GET as getAuditLog } from "./api/v1/audit-log/route.js";
import { POST as postSyncPush } from "./api/v1/sync/push/route.js";
import { GET as getSyncPull } from "./api/v1/sync/pull/route.js";
import { GET as getSyncConflicts, POST_RESOLVE as postResolveSyncConflict } from "./api/v1/sync/conflicts/route.js";
import { GET as getProducts, POST as postProduct, PUT as putProduct } from "./api/v1/products/route.js";
import { GET as getFieldOrders, POST as postFieldOrder, PUT as putFieldOrder } from "./api/v1/field-orders/route.js";
import { GET as getReportsSummary } from "./api/v1/reports/summary/route.js";
import { GET as getReportsRepActivity } from "./api/v1/reports/rep-activity/route.js";
import { GET as getReportsExpenses } from "./api/v1/reports/expenses/route.js";
import {
  GET as getFieldExpenses,
  PATCH_REASON as patchFieldExpenseReason,
  PATCH_APPROVE as patchFieldExpenseApprove,
  PATCH_REJECT as patchFieldExpenseReject
} from "./api/v1/field-expenses/route.js";
import { GET_COVERAGE as getReportsCoverage, GET_ADHERENCE as getReportsAdherence, GET_FRAUD as getReportsFraud, GET_REORDER as getReportsReorder, GET_MILEAGE as getReportsMileage, GET_MILEAGE_BY_REP as getReportsMileageByRep, GET_EXPENSE_ANOMALIES as getReportsExpenseAnomalies, GET_ROUTE_ADHERENCE_SUMMARY as getReportsRouteAdherenceSummary, GET_OFFTARGET as getReportsOffTarget, GET_FUNNEL as getReportsFunnel, GET_TIME_ON_FIELD as getReportsTimeOnField, GET_TRENDS as getReportsTrends, GET_VISIT_QUALITY as getReportsVisitQuality } from "./api/v1/reports/insights/route.js";
import { GET as getPayments, POST as postPayment } from "./api/v1/payments/route.js";
import { GET as getGeocode } from "./api/v1/geocode/route.js";
import { GET as getBeatPlans, POST as postBeatPlan } from "./api/v1/beat-plans/route.js";
import { GET as getAttendance, POST as postAttendance } from "./api/v1/attendance/route.js";
import { GET as getSurveys, POST as postSurvey, POST_RESPONSE as postSurveyResponse, GET_RESPONSES as getSurveyResponses } from "./api/v1/surveys/route.js";
import { GET as getMeToday } from "./api/v1/me/today/route.js";
import { GET as getTeams, POST as postTeam, PUT_TEAM as putTeam, DEL_TEAM as delTeam, POST_MEMBER as postTeamMember, DEL_MEMBER as delTeamMember } from "./api/v1/teams/route.js";
import { GET as getMeAnalytics } from "./api/v1/me/analytics/route.js";
import { GET as getOrgSettings, PUT as putOrgSettings } from "./api/v1/organisation-settings/route.js";
import { GET as getUsers, POST as postUser, DEL as delUser, POST_CHANGE_PASSWORD as postChangePassword, POST_RESET_PASSWORD as postResetPassword, POST_IMPERSONATE as postImpersonate, PUT_VEHICLE as putUserVehicle } from "./api/v1/users/route.js";
import { GET as getVehicleTypes, POST as postVehicleType, PUT as putVehicleType, DEL as delVehicleType } from "./api/v1/vehicle-types/route.js";
import { GET as getErpStatus, POST_BACKFILL as postErpBackfill } from "./api/v1/integrations/erp/route.js";
import { POST_WEBHOOK as postErpWebhook } from "./api/v1/integrations/erp/webhook/route.js";
import { GET as getNotifications, POST as postNotificationsRead, POST_DEVICE as postDeviceToken } from "./api/v1/notifications/route.js";
import { POST as postUpload, GET as getUpload } from "./api/v1/uploads/route.js";
import { GET_EXPORT as getComplianceExport, POST_ERASE as postComplianceErase } from "./api/v1/compliance/route.js";
import { registerErpProvider } from "./integrations/erp-provider.js";
import { createErpNextProvider, isErpNextConfigured } from "./integrations/erpnext-provider.js";

const env = getEnv();
const port = Number(process.env.PORT ?? 9000);

async function main() {

const app = Fastify({
  logger: false,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || env.authCors.includes(origin)) {
      cb(null, true);
    } else {
      cb(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["authorization", "content-type", "x-field-sales-user-id", "x-field-sales-organisation-id", "x-field-sales-role", "x-field-sales-permissions", "x-resource-id"],
  maxAge: 600,
});

// NOTE: do NOT register @fastify/websocket here. The realtime gateway
// (attachWsGateway, below) owns the `/ws/tracking` upgrade on the raw HTTP
// server. Registering @fastify/websocket installs a SECOND `upgrade` listener
// that also responds to the same handshake — the browser receives the gateway's
// valid `ws.subscribed` frame and then a stray frame from the plugin, which it
// rejects as "Invalid frame header" and closes (code 1006). No Fastify route
// uses `{ websocket: true }`, so the plugin served no purpose.

function makeRequest(fastifyReq: import("fastify").FastifyRequest, correlationId: string): AppRouteRequest {
  return {
    headers: {
      ...fastifyReq.headers,
      "x-request-url": fastifyReq.url,
      "x-correlation-id": correlationId,
    },
    body: fastifyReq.body,
  };
}

function makeReply(fastifyReply: import("fastify").FastifyReply): AppRouteResponse {
  let statusCode = 200;
  return {
    status(code) { statusCode = code; return this; },
    json(payload) { fastifyReply.code(statusCode).send(payload); },
  };
}

app.addHook("onRequest", async (request, reply) => {
  const correlationId = nextCorrelationId();
  reply.header("x-correlation-id", correlationId);
  (reply as any)._correlationId = correlationId;
  (reply as any)._startedAt = Date.now();

  const clientIp = (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? request.ip
    ?? "unknown";

  if (request.url !== "/health") {
    const auth = getRequestAuthSafe({ headers: request.headers as Record<string, string | string[] | undefined> });
    if (auth?.jti && (await isJtiRevoked(auth.jti))) {
      reply.code(401).send({ code: "unauthenticated", message: "Session ended. Please sign in again." });
      return;
    }
    const bucket = bucketForPath(request.method, request.url);
    const principal = rateLimitPrincipal(auth?.userId ?? null, clientIp);
    const decision = await checkRateLimitAsync(`${principal}:${request.method}:${request.url}`, bucket);
    reply.header("x-ratelimit-limit", String(bucket.maxRequests));
    reply.header("x-ratelimit-remaining", String(decision.remaining));
    reply.header("x-ratelimit-reset", String(Math.ceil(decision.resetAt / 1000)));
    if (!decision.allowed) {
      reply.code(429).send({ code: "rate_limited", message: "Too many requests" });
      return;
    }
  }
});

app.addHook("onSend", async (_request, reply, payload) => {
  const headers = reply.getHeaders();
  if (!headers["x-content-type-options"]) {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
    reply.header("strict-transport-security", "max-age=15552000; includeSubDomains");
    reply.header("x-dns-prefetch-control", "off");
    reply.header("permissions-policy", "geolocation=(), microphone=(), camera=()");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  }
});

app.addHook("onResponse", async (request, reply) => {
  const correlationId = (reply as any)._correlationId;
  const startedAt = (reply as any)._startedAt;
  if (correlationId && startedAt) {
    const clientIp = request.headers["x-forwarded-for"] as string ?? request.ip ?? "unknown";
    logRequest({
      correlationId,
      method: request.method,
      path: request.url,
      status: reply.statusCode,
      durationMs: Date.now() - startedAt,
      clientIp,
    });
  }
});

app.setErrorHandler((error: Error, request, reply) => {
  const correlationId = (reply as any)._correlationId ?? "unknown";
  const statusCode = "statusCode" in error ? Number((error as any).statusCode) : 500;
  if (statusCode >= 500) {
    captureError(error, { correlationId, path: request.url, method: request.method });
  }
  reply.code(statusCode).send({
    code: statusCode === 403 ? "forbidden" : statusCode === 401 ? "unauthenticated" : "internal_error",
    message: error.message ?? "Unexpected error",
    correlationId,
  });
});

app.get("/health", async (_request, reply) => {
  reply.send({ status: "ok", service: "orbit-backend" });
});

// Auth
app.post("/api/v1/auth/login", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postLogin(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/auth/forgot-password", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postForgotPassword(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/auth/reset-password", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postAuthResetPassword(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/auth/logout", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postLogout(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/auth/session", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getSession(makeRequest(req, cid), makeReply(reply));
});

// Organisations
app.get("/api/v1/organisations", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getOrganisation(makeRequest(req, cid), makeReply(reply));
});

// Outlets
app.get("/api/v1/outlets", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getOutlets(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/outlets", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postOutlet(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/outlets/import", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postOutletsImport(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/outlets/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putOutlet(r, makeReply(reply));
});
app.delete<{ Params: { id: string } }>("/api/v1/outlets/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await delOutlet(r, makeReply(reply));
});

// Leads
app.get("/api/v1/leads", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getLeads(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/leads", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postLead(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/leads/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putLead(r, makeReply(reply));
});
app.delete<{ Params: { id: string } }>("/api/v1/leads/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await delLead(r, makeReply(reply));
});
app.post<{ Params: { id: string } }>("/api/v1/leads/:id/status", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await patchLeadStatus(r, makeReply(reply));
});

// Territories
app.get("/api/v1/territories", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getTerritories(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/territories", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postTerritory(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/territories/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putTerritory(r, makeReply(reply));
});
app.delete<{ Params: { id: string } }>("/api/v1/territories/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await delTerritory(r, makeReply(reply));
});
app.get<{ Params: { id: string } }>("/api/v1/territories/:id/outlets", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await getTerritoryOutlets(r, makeReply(reply));
});

// Visits
app.get("/api/v1/visits", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getVisits(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/visits/schedule", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postVisitSchedule(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/visits", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postVisit(makeRequest(req, cid), makeReply(reply));
});
app.get<{ Params: { id: string } }>("/api/v1/visits/:id/attachments", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await getVisitAttachments(r, makeReply(reply));
});
app.get<{ Params: { id: string } }>("/api/v1/visits/:id/extras", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await getVisitExtras(r, makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/visits/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putVisit(r, makeReply(reply));
});

// Tracking
app.get("/api/v1/tracking", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getTracking(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/tracking/latest", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getTrackingLatest(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/tracking/consent-status", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getTrackingConsentStatus(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/tracking", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postTracking(makeRequest(req, cid), makeReply(reply));
});

// Field expenses (daily auto-computed fuel)
app.get("/api/v1/field-expenses", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getFieldExpenses(makeRequest(req, cid), makeReply(reply));
});
app.patch("/api/v1/field-expenses/:id/reason", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const id = (req.params as { id?: string })?.id ?? "";
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = id;
  await patchFieldExpenseReason(r, makeReply(reply));
});
app.patch("/api/v1/field-expenses/:id/approve", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const id = (req.params as { id?: string })?.id ?? "";
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = id;
  await patchFieldExpenseApprove(r, makeReply(reply));
});
app.patch("/api/v1/field-expenses/:id/reject", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const id = (req.params as { id?: string })?.id ?? "";
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = id;
  await patchFieldExpenseReject(r, makeReply(reply));
});

// Notifications
app.get("/api/v1/notifications", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getNotifications(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/notifications/devices", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postDeviceToken(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/notifications/read", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postNotificationsRead(makeRequest(req, cid), makeReply(reply));
});

// Uploads
app.post("/api/v1/uploads", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postUpload(makeRequest(req, cid), makeReply(reply));
});
app.get<{ Params: { id: string } }>("/api/v1/uploads/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await getUpload(r, makeReply(reply));
});

// Audit & compliance
app.get("/api/v1/audit-log", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getAuditLog(makeRequest(req, cid), makeReply(reply));
});
app.get<{ Params: { userId: string } }>("/api/v1/compliance/users/:userId/export", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.userId;
  await getComplianceExport(r, makeReply(reply));
});
app.post<{ Params: { userId: string } }>("/api/v1/compliance/users/:userId/erase", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.userId;
  await postComplianceErase(r, makeReply(reply));
});

// Sync
app.post("/api/v1/sync/push", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postSyncPush(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/sync/pull", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getSyncPull(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/sync/conflicts", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getSyncConflicts(makeRequest(req, cid), makeReply(reply));
});
app.post<{ Params: { id: string } }>("/api/v1/sync/conflicts/:id/resolve", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await postResolveSyncConflict(r, makeReply(reply));
});

// Products
app.get("/api/v1/products", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getProducts(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/products", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postProduct(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/products/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putProduct(r, makeReply(reply));
});

// Field orders
app.get("/api/v1/field-orders", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getFieldOrders(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/field-orders", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postFieldOrder(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/field-orders/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putFieldOrder(r, makeReply(reply));
});

// Reports
app.get("/api/v1/reports/summary", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsSummary(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/rep-activity", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsRepActivity(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/expenses", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsExpenses(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/coverage", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsCoverage(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/route-adherence", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsAdherence(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/fraud-signals", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsFraud(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/reorder", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsReorder(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/mileage", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsMileage(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/mileage/by-rep", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsMileageByRep(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/expense-anomalies", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsExpenseAnomalies(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/route-adherence-summary", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsRouteAdherenceSummary(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/off-target-leaderboard", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsOffTarget(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/funnel", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsFunnel(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/time-on-field", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsTimeOnField(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/trends", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsTrends(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/reports/visit-quality", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getReportsVisitQuality(makeRequest(req, cid), makeReply(reply));
});

// Geocode
app.get("/api/v1/geocode", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getGeocode(makeRequest(req, cid), makeReply(reply));
});

// Payments
app.get("/api/v1/payments", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getPayments(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/payments", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postPayment(makeRequest(req, cid), makeReply(reply));
});

// Beat plans
app.get("/api/v1/beat-plans", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getBeatPlans(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/beat-plans", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postBeatPlan(makeRequest(req, cid), makeReply(reply));
});

// Attendance
app.get("/api/v1/attendance", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getAttendance(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/attendance", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postAttendance(makeRequest(req, cid), makeReply(reply));
});

// Surveys
app.get("/api/v1/surveys", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getSurveys(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/surveys", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postSurvey(makeRequest(req, cid), makeReply(reply));
});
app.post<{ Params: { id: string } }>("/api/v1/surveys/:id/responses", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await postSurveyResponse(r, makeReply(reply));
});
app.get<{ Params: { id: string } }>("/api/v1/surveys/:id/responses", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await getSurveyResponses(r, makeReply(reply));
});

// Me
app.get("/api/v1/me/today", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getMeToday(makeRequest(req, cid), makeReply(reply));
});
app.get("/api/v1/me/analytics", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getMeAnalytics(makeRequest(req, cid), makeReply(reply));
});

// Teams
app.get("/api/v1/teams", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getTeams(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/teams", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postTeam(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/teams/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putTeam(r, makeReply(reply));
});
app.delete<{ Params: { id: string } }>("/api/v1/teams/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await delTeam(r, makeReply(reply));
});
app.post<{ Params: { id: string } }>("/api/v1/teams/:id/members", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await postTeamMember(r, makeReply(reply));
});
app.delete<{ Params: { teamId: string; userId: string } }>("/api/v1/teams/:teamId/members/:userId", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.teamId;
  r.headers["x-resource-sub-id"] = req.params.userId;
  await delTeamMember(r, makeReply(reply));
});

// Organisation settings
app.get("/api/v1/organisation-settings", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getOrgSettings(makeRequest(req, cid), makeReply(reply));
});
app.put("/api/v1/organisation-settings", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await putOrgSettings(makeRequest(req, cid), makeReply(reply));
});

// Users
app.get("/api/v1/users", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getUsers(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/users", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postUser(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/users/me/password", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postChangePassword(makeRequest(req, cid), makeReply(reply));
});
app.delete<{ Params: { id: string } }>("/api/v1/users/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await delUser(r, makeReply(reply));
});
app.post<{ Params: { id: string } }>("/api/v1/users/:id/reset-password", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await postResetPassword(r, makeReply(reply));
});
app.post<{ Params: { id: string } }>("/api/v1/users/:id/impersonate", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await postImpersonate(r, makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/users/:id/vehicle", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putUserVehicle(r, makeReply(reply));
});

// Vehicle types (per-tenant, used by the fuel rate cascade)
app.get("/api/v1/vehicle-types", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getVehicleTypes(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/vehicle-types", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postVehicleType(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/vehicle-types/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putVehicleType(r, makeReply(reply));
});
app.delete<{ Params: { id: string } }>("/api/v1/vehicle-types/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await delVehicleType(r, makeReply(reply));
});

// ERP integration
app.get("/api/v1/integrations/erp/status", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getErpStatus(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/integrations/erp/backfill", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postErpBackfill(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/integrations/erp/webhook", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postErpWebhook(makeRequest(req, cid), makeReply(reply));
});

// Route plans
app.get("/api/v1/route-plans", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await getRoutePlans(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/route-plans", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postRoutePlan(makeRequest(req, cid), makeReply(reply));
});
app.post("/api/v1/route-plans/preview", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  await postRoutePlanPreview(makeRequest(req, cid), makeReply(reply));
});
app.put<{ Params: { id: string } }>("/api/v1/route-plans/:id", async (req, reply) => {
  const cid = (reply as any)._correlationId;
  const r = makeRequest(req, cid);
  r.headers["x-resource-id"] = req.params.id;
  await putRoutePlanTransition(r, makeReply(reply));
});

attachWsGateway(app.server);

async function bootstrap() {
  process.stdout.write(
    `env=${env.env}  retention=${env.retentionSweepEnabled ? "on" : "off"}  session-expiry=${env.sessionExpiryEnabled ? "on" : "off"} (live=${env.trackingLiveWindowSeconds}s stale=${env.sessionStaleAfterSeconds}s)\n`
  );
  const { ensureSeedUser } = await import("./auth/auth-service.js");
  try {
    const result = await ensureSeedUser();
    if (result.skipped) {
      process.stdout.write(`ensureSeedUser: skipped (${result.reason})\n`);
    } else {
      process.stdout.write("ensureSeedUser: development admin ready\n");
    }
  } catch (error: unknown) {
    process.stderr.write(
      `ensureSeedUser failed (server will still start): ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
  try {
    const { ensureLocationPingPartitions } = await import("./internal/jobs/partition-manager.js");
    await ensureLocationPingPartitions();
  } catch (error: unknown) {
    process.stderr.write(`partition ensure failed (non-fatal): ${error instanceof Error ? error.message : String(error)}\n`);
  }
  try {
    const { ensureFeatureSchema } = await import("./db/ensure-feature-schema.js");
    const summary = await ensureFeatureSchema();
    process.stdout.write(`[schema] feature DDL ensured (applied=${summary.applied} failed=${summary.failed})\n`);
  } catch (error) {
    process.stderr.write(`feature schema ensure failed (non-fatal): ${error instanceof Error ? error.message : String(error)}\n`);
  }

  startRetentionScheduler();
  startSessionExpiryScheduler();
  startVisitSweepScheduler();
  startEodAdherenceScheduler();
  startProductCatalogSync();

  if (isErpNextConfigured()) {
    try {
      const provider = createErpNextProvider();
      registerErpProvider(provider);
      const ping = await provider.ping({ organisationId: "" });
      process.stdout.write(`ERPNext provider registered: ${ping.ok ? ping.message : "ping failed: " + ping.message}\n`);
    } catch (error) {
      process.stderr.write(`ERPNext provider registration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  } else {
    process.stdout.write("ERPNext provider: disabled (set ERPNEXT_ENABLED=true + API keys to enable)\n");
  }
}

try {
  await bootstrap();
} catch (error) {
  process.stderr.write(`Bootstrap error: ${error instanceof Error ? error.message : String(error)}\n`);
}

await app.listen({ port, host: "0.0.0.0" });
process.stdout.write(
  `orbit-backend listening on http://localhost:${port}; WS at ws://localhost:${port}/ws/tracking; sentry=${isSentryConfigured() ? "on" : "off"}\n`
);

}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
