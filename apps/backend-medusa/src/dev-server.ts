import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Load a SCAFFOLD-ONLY env file (.env.scaffold) for vars like ERPNEXT_* and
// REDIS_URL. We deliberately do NOT load the package `.env` here because that
// file's DATABASE_URL points at the Medusa runtime's database; the scaffold must
// keep using the fieldsales DB. Inline process.env always wins over the file.
// cwd is the package dir (pnpm --filter ... exec tsx src/dev-server.ts).
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
    // non-fatal — scaffold runs with whatever is already in the environment
  }
})();

import { getEnv } from "./config/env.js";
import { attachWsGateway } from "./realtime/ws-gateway.js";
import { startRetentionScheduler } from "./internal/jobs/retention-scheduler.js";
import { startSessionExpiryScheduler } from "./internal/jobs/session-expiry-scheduler.js";
import { startVisitSweepScheduler } from "./internal/jobs/visit-sweep-scheduler.js";
import { startEodAdherenceScheduler } from "./internal/jobs/eod-adherence-scheduler.js";

// Fail-fast on bad env BEFORE any other module is touched. Throws in
// production if JWT_SECRET / DATABASE_URL / REDIS_URL / APP_URL / AUTH_CORS
// are missing or unsafe.
const env = getEnv();
import { GET as getSession } from "./api/v1/auth/session/route.js";
import { GET as getLeads, POST as postLead, PUT as putLead, DEL as delLead, PATCH_STATUS as patchLeadStatus } from "./api/v1/leads/route.js";
import { GET as getOrganisation } from "./api/v1/organisations/route.js";
import { GET as getOutlets, POST as postOutlet, POST_IMPORT as postOutletsImport, PUT as putOutlet, DEL as delOutlet } from "./api/v1/outlets/route.js";
import {
  GET as getTerritories,
  POST as postTerritory,
  PUT as putTerritory,
  DEL as delTerritory,
  GET_OUTLETS as getTerritoryOutlets
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
import { GET_COVERAGE as getReportsCoverage, GET_ADHERENCE as getReportsAdherence, GET_FRAUD as getReportsFraud, GET_REORDER as getReportsReorder, GET_MILEAGE as getReportsMileage, GET_OFFTARGET as getReportsOffTarget, GET_FUNNEL as getReportsFunnel, GET_TIME_ON_FIELD as getReportsTimeOnField, GET_TRENDS as getReportsTrends, GET_VISIT_QUALITY as getReportsVisitQuality } from "./api/v1/reports/insights/route.js";
import { GET as getPayments, POST as postPayment } from "./api/v1/payments/route.js";
import { GET as getGeocode } from "./api/v1/geocode/route.js";
import { GET as getBeatPlans, POST as postBeatPlan } from "./api/v1/beat-plans/route.js";
import { GET as getAttendance, POST as postAttendance } from "./api/v1/attendance/route.js";
import { GET as getSurveys, POST as postSurvey, POST_RESPONSE as postSurveyResponse, GET_RESPONSES as getSurveyResponses } from "./api/v1/surveys/route.js";
import { GET as getMeToday } from "./api/v1/me/today/route.js";
import { GET as getTeams, POST as postTeam, PUT_TEAM as putTeam, DEL_TEAM as delTeam, POST_MEMBER as postTeamMember, DEL_MEMBER as delTeamMember } from "./api/v1/teams/route.js";
import { GET as getMeAnalytics } from "./api/v1/me/analytics/route.js";
import { GET as getOrgSettings, PUT as putOrgSettings } from "./api/v1/organisation-settings/route.js";
import { GET as getUsers, POST as postUser, DEL as delUser, POST_CHANGE_PASSWORD as postChangePassword, POST_RESET_PASSWORD as postResetPassword, POST_IMPERSONATE as postImpersonate } from "./api/v1/users/route.js";
import { GET as getErpStatus, POST_BACKFILL as postErpBackfill } from "./api/v1/integrations/erp/route.js";
import { POST_WEBHOOK as postErpWebhook } from "./api/v1/integrations/erp/webhook/route.js";
import { GET as getNotifications, POST as postNotificationsRead, POST_DEVICE as postDeviceToken } from "./api/v1/notifications/route.js";
import { POST as postUpload, GET as getUpload } from "./api/v1/uploads/route.js";
import { GET_EXPORT as getComplianceExport, POST_ERASE as postComplianceErase } from "./api/v1/compliance/route.js";
import { registerErpProvider } from "./integrations/erp-provider.js";
import { createErpNextProvider, isErpNextConfigured } from "./integrations/erpnext-provider.js";
import { applySecurityHeaders } from "./http/security.js";
import { bucketForPath, checkRateLimitAsync, rateLimitPrincipal } from "./http/rate-limit.js";
import { getRequestAuthSafe } from "./auth/auth-middleware.js";
import { isJtiRevoked } from "./auth/login-security.js";
import { logRequest, nextCorrelationId } from "./http/request-logger.js";
import { captureError, isSentryConfigured } from "./http/sentry.js";
import type { MedusaRouteRequest, MedusaRouteResponse } from "./api/types.js";

const port = Number(process.env.PORT ?? 9000);

function pathOf(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  const idx = rawUrl.indexOf("?");
  return idx >= 0 ? rawUrl.slice(0, idx) : rawUrl;
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});

async function parseBody(request: http.IncomingMessage): Promise<unknown> {
  const buffers: Buffer[] = [];
  for await (const chunk of request) {
    buffers.push(chunk as Buffer);
  }
  const raw = Buffer.concat(buffers).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function extractResourceId(url: string, prefix: string): string | null {
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const match = rest.match(/^\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

const ALLOWED_ORIGINS = env.authCors;

function applyCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse): void {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
    response.setHeader("access-control-allow-credentials", "true");
  } else if (!origin) {
    // Non-browser caller (curl, mobile, electron-internal) — leave permissive.
    response.setHeader("access-control-allow-origin", "*");
  }
  response.setHeader(
    "access-control-allow-methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  response.setHeader(
    "access-control-allow-headers",
    "authorization,content-type,x-field-sales-user-id,x-field-sales-organisation-id,x-field-sales-role,x-field-sales-permissions,x-resource-id"
  );
  response.setHeader("access-control-max-age", "600");
}

async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  const startedAt = Date.now();
  const correlationId = nextCorrelationId();
  response.setHeader("x-correlation-id", correlationId);

  applyCorsHeaders(request, response);
  applySecurityHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const clientIp =
    (typeof request.headers["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"].split(",")[0].trim() : undefined) ??
    request.socket.remoteAddress ??
    "unknown";
  const urlPath = pathOf(request.url);
  const method = request.method ?? "GET";

  if (urlPath !== "/health" && method !== "OPTIONS") {
    const auth = getRequestAuthSafe({ headers: request.headers });
    // Revocation chokepoint: a token whose jti was revoked (logout / forced
    // sign-out) is rejected here, before any route runs, without making the
    // per-route sync auth path async.
    if (auth?.jti && (await isJtiRevoked(auth.jti))) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "unauthenticated", message: "Session ended. Please sign in again." }));
      logRequest({ correlationId, method, path: urlPath, status: 401, durationMs: Date.now() - startedAt, clientIp });
      return;
    }
    const bucket = bucketForPath(method, urlPath);
    // Limit authenticated requests per user, not per IP, so reps sharing one
    // office NAT/egress IP don't exhaust a single bucket and 429 each other.
    const principal = rateLimitPrincipal(auth?.userId ?? null, clientIp);
    const decision = await checkRateLimitAsync(`${principal}:${method}:${urlPath}`, bucket);
    response.setHeader("x-ratelimit-limit", String(bucket.maxRequests));
    response.setHeader("x-ratelimit-remaining", String(decision.remaining));
    response.setHeader("x-ratelimit-reset", String(Math.ceil(decision.resetAt / 1000)));
    if (!decision.allowed) {
      response.writeHead(429, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "rate_limited", message: "Too many requests" }));
      logRequest({ correlationId, method, path: urlPath, status: 429, durationMs: Date.now() - startedAt, clientIp });
      return;
    }
  }

  const body = method === "POST" || method === "PUT" || method === "DELETE" ? await parseBody(request) : undefined;
  const routeRequest: MedusaRouteRequest = {
    headers: { ...request.headers, "x-request-url": request.url ?? "", "x-correlation-id": correlationId },
    body
  };
  const routeResponse = createRouteResponse(response);

  try {
    if (urlPath === "/health") {
      routeResponse.status(200).json({ status: "ok", service: "backend-medusa" });
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/auth/login") {
      await postLogin(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/auth/forgot-password") {
      await postForgotPassword(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/auth/reset-password") {
      await postAuthResetPassword(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/auth/logout") {
      await postLogout(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/auth/session") {
      await getSession(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/organisations") {
      await getOrganisation(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/outlets") {
      await getOutlets(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/outlets") {
      await postOutlet(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/outlets/import") {
      await postOutletsImport(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/leads") {
      await getLeads(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/leads") {
      await postLead(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/territories") {
      await getTerritories(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/territories") {
      await postTerritory(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath.startsWith("/api/v1/territories/")) {
      const outletsMatch = urlPath.match(/^\/api\/v1\/territories\/([^/]+)\/outlets\/?$/);
      if (outletsMatch) {
        routeRequest.headers["x-resource-id"] = outletsMatch[1];
        await getTerritoryOutlets(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/territories")) {
      const id = extractResourceId(urlPath, "/api/v1/territories");
      if (id) routeRequest.headers["x-resource-id"] = id;
      await putTerritory(routeRequest, routeResponse);
      return;
    }

    if (request.method === "DELETE" && urlPath.startsWith("/api/v1/territories")) {
      const id = extractResourceId(urlPath, "/api/v1/territories");
      if (id) routeRequest.headers["x-resource-id"] = id;
      await delTerritory(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/visits") {
      await getVisits(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/visits/schedule") {
      await postVisitSchedule(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/visits") {
      await postVisit(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath.startsWith("/api/v1/visits/")) {
      const m = urlPath.match(/^\/api\/v1\/visits\/([^/]+)\/attachments\/?$/);
      if (m) {
        routeRequest.headers["x-resource-id"] = m[1];
        await getVisitAttachments(routeRequest, routeResponse);
        return;
      }
      const ex = urlPath.match(/^\/api\/v1\/visits\/([^/]+)\/extras\/?$/);
      if (ex) {
        routeRequest.headers["x-resource-id"] = ex[1];
        await getVisitExtras(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/visits/")) {
      const visitId = urlPath.slice("/api/v1/visits/".length);
      if (visitId && !visitId.includes("/")) {
        routeRequest.headers["x-resource-id"] = visitId;
        await putVisit(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/tracking") {
      await getTracking(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/tracking/latest") {
      await getTrackingLatest(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/tracking/consent-status") {
      await getTrackingConsentStatus(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/tracking") {
      await postTracking(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/notifications") {
      await getNotifications(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/notifications/devices") {
      await postDeviceToken(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/notifications") {
      await postNotificationsRead(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/uploads") {
      await postUpload(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath.startsWith("/api/v1/uploads/")) {
      const id = extractResourceId(urlPath, "/api/v1/uploads");
      if (id) {
        routeRequest.headers["x-resource-id"] = id;
        await getUpload(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/audit-log") {
      await getAuditLog(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath.startsWith("/api/v1/compliance/users/")) {
      const m = urlPath.match(/^\/api\/v1\/compliance\/users\/([^/]+)\/export\/?$/);
      if (m) {
        routeRequest.headers["x-resource-id"] = m[1];
        await getComplianceExport(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "POST" && urlPath.startsWith("/api/v1/compliance/users/")) {
      const m = urlPath.match(/^\/api\/v1\/compliance\/users\/([^/]+)\/erase\/?$/);
      if (m) {
        routeRequest.headers["x-resource-id"] = m[1];
        await postComplianceErase(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "POST" && urlPath === "/api/v1/sync/push") {
      await postSyncPush(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/sync/pull") {
      await getSyncPull(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/sync/conflicts") {
      await getSyncConflicts(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath.startsWith("/api/v1/sync/conflicts/")) {
      const m = urlPath.match(/^\/api\/v1\/sync\/conflicts\/([^/]+)\/resolve\/?$/);
      if (m) {
        routeRequest.headers["x-resource-id"] = m[1];
        await postResolveSyncConflict(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/products") {
      await getProducts(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/products") {
      await postProduct(routeRequest, routeResponse);
      return;
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/products")) {
      const id = extractResourceId(urlPath, "/api/v1/products");
      if (id) routeRequest.headers["x-resource-id"] = id;
      await putProduct(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/field-orders") {
      await getFieldOrders(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/field-orders") {
      await postFieldOrder(routeRequest, routeResponse);
      return;
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/field-orders/")) {
      const orderId = extractResourceId(urlPath, "/api/v1/field-orders");
      if (orderId) {
        routeRequest.headers["x-resource-id"] = orderId;
        await putFieldOrder(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/summary") {
      await getReportsSummary(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/rep-activity") {
      await getReportsRepActivity(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/expenses") {
      await getReportsExpenses(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/geocode") {
      await getGeocode(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/coverage") {
      await getReportsCoverage(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/route-adherence") {
      await getReportsAdherence(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/fraud-signals") {
      await getReportsFraud(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/reorder") {
      await getReportsReorder(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/mileage") {
      await getReportsMileage(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/off-target-leaderboard") {
      await getReportsOffTarget(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/funnel") {
      await getReportsFunnel(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/time-on-field") {
      await getReportsTimeOnField(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/trends") {
      await getReportsTrends(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/reports/visit-quality") {
      await getReportsVisitQuality(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/payments") {
      await getPayments(routeRequest, routeResponse);
      return;
    }
    if (request.method === "POST" && urlPath === "/api/v1/payments") {
      await postPayment(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/beat-plans") {
      await getBeatPlans(routeRequest, routeResponse);
      return;
    }
    if (request.method === "POST" && urlPath === "/api/v1/beat-plans") {
      await postBeatPlan(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/attendance") {
      await getAttendance(routeRequest, routeResponse);
      return;
    }
    if (request.method === "POST" && urlPath === "/api/v1/attendance") {
      await postAttendance(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/surveys") {
      await getSurveys(routeRequest, routeResponse);
      return;
    }
    if (request.method === "POST" && urlPath === "/api/v1/surveys") {
      await postSurvey(routeRequest, routeResponse);
      return;
    }
    if (request.method === "POST" && urlPath.startsWith("/api/v1/surveys/")) {
      const m = urlPath.match(/^\/api\/v1\/surveys\/([^/]+)\/responses\/?$/);
      if (m) {
        routeRequest.headers["x-resource-id"] = m[1];
        await postSurveyResponse(routeRequest, routeResponse);
        return;
      }
    }
    if (request.method === "GET" && urlPath.startsWith("/api/v1/surveys/")) {
      const m = urlPath.match(/^\/api\/v1\/surveys\/([^/]+)\/responses\/?$/);
      if (m) {
        routeRequest.headers["x-resource-id"] = m[1];
        await getSurveyResponses(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/me/today") {
      await getMeToday(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/me/analytics") {
      await getMeAnalytics(routeRequest, routeResponse);
      return;
    }

    // --- Teams (manager↔team assignment) ---
    if (urlPath === "/api/v1/teams") {
      if (request.method === "GET") { await getTeams(routeRequest, routeResponse); return; }
      if (request.method === "POST") { await postTeam(routeRequest, routeResponse); return; }
    }
    if (urlPath.startsWith("/api/v1/teams/")) {
      const memberMatch = urlPath.match(/^\/api\/v1\/teams\/([^/]+)\/members(?:\/([^/]+))?\/?$/);
      if (memberMatch) {
        routeRequest.headers["x-resource-id"] = memberMatch[1];
        if (request.method === "POST") { await postTeamMember(routeRequest, routeResponse); return; }
        if (request.method === "DELETE" && memberMatch[2]) {
          routeRequest.headers["x-resource-sub-id"] = memberMatch[2];
          await delTeamMember(routeRequest, routeResponse); return;
        }
      } else {
        const id = extractResourceId(urlPath, "/api/v1/teams");
        if (id) {
          routeRequest.headers["x-resource-id"] = id;
          if (request.method === "PUT") { await putTeam(routeRequest, routeResponse); return; }
          if (request.method === "DELETE") { await delTeam(routeRequest, routeResponse); return; }
        }
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/organisation-settings") {
      await getOrgSettings(routeRequest, routeResponse);
      return;
    }

    if (request.method === "PUT" && urlPath === "/api/v1/organisation-settings") {
      await putOrgSettings(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/users") {
      await getUsers(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/users") {
      await postUser(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/users/me/password") {
      await postChangePassword(routeRequest, routeResponse);
      return;
    }

    if (request.method === "DELETE" && urlPath.startsWith("/api/v1/users/")) {
      const userId = urlPath.slice("/api/v1/users/".length);
      if (userId && !userId.includes("/")) {
        routeRequest.headers["x-resource-id"] = userId;
        await delUser(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "POST" && urlPath.startsWith("/api/v1/users/") && urlPath.endsWith("/reset-password")) {
      const userId = urlPath.slice("/api/v1/users/".length, -"/reset-password".length);
      if (userId && !userId.includes("/")) {
        routeRequest.headers["x-resource-id"] = userId;
        await postResetPassword(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "POST" && urlPath.startsWith("/api/v1/users/") && urlPath.endsWith("/impersonate")) {
      const userId = urlPath.slice("/api/v1/users/".length, -"/impersonate".length);
      if (userId && !userId.includes("/")) {
        routeRequest.headers["x-resource-id"] = userId;
        await postImpersonate(routeRequest, routeResponse);
        return;
      }
    }

    if (request.method === "GET" && urlPath === "/api/v1/integrations/erp/status") {
      await getErpStatus(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/integrations/erp/backfill") {
      await postErpBackfill(routeRequest, routeResponse);
      return;
    }

    // Inbound CRM→app webhook (secret-gated, unauthenticated by design).
    if (request.method === "POST" && urlPath === "/api/v1/integrations/erp/webhook") {
      await postErpWebhook(routeRequest, routeResponse);
      return;
    }

    if (request.method === "GET" && urlPath === "/api/v1/route-plans") {
      await getRoutePlans(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/route-plans") {
      await postRoutePlan(routeRequest, routeResponse);
      return;
    }

    if (request.method === "POST" && urlPath === "/api/v1/route-plans/preview") {
      await postRoutePlanPreview(routeRequest, routeResponse);
      return;
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/route-plans/")) {
      const id = extractResourceId(urlPath, "/api/v1/route-plans");
      if (id) {
        routeRequest.headers["x-resource-id"] = id;
        await putRoutePlanTransition(routeRequest, routeResponse);
        return;
      }
    }

    // Rep status-only update: POST /api/v1/leads/:id/status (owner-scoped).
    const leadStatusMatch = urlPath.match(/^\/api\/v1\/leads\/([^/]+)\/status$/);
    if (request.method === "POST" && leadStatusMatch) {
      routeRequest.headers["x-resource-id"] = leadStatusMatch[1];
      await patchLeadStatus(routeRequest, routeResponse);
      return;
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/leads")) {
      const leadId = extractResourceId(urlPath, "/api/v1/leads");
      if (leadId) routeRequest.headers["x-resource-id"] = leadId;
      await putLead(routeRequest, routeResponse);
      return;
    }

    if (request.method === "DELETE" && urlPath.startsWith("/api/v1/leads")) {
      const leadId = extractResourceId(urlPath, "/api/v1/leads");
      if (leadId) routeRequest.headers["x-resource-id"] = leadId;
      await delLead(routeRequest, routeResponse);
      return;
    }

    if (request.method === "PUT" && urlPath.startsWith("/api/v1/outlets")) {
      const outletId = extractResourceId(urlPath, "/api/v1/outlets");
      if (outletId) routeRequest.headers["x-resource-id"] = outletId;
      await putOutlet(routeRequest, routeResponse);
      return;
    }

    if (request.method === "DELETE" && urlPath.startsWith("/api/v1/outlets")) {
      const outletId = extractResourceId(urlPath, "/api/v1/outlets");
      if (outletId) routeRequest.headers["x-resource-id"] = outletId;
      await delOutlet(routeRequest, routeResponse);
      return;
    }

    routeResponse.status(404).json({ code: "not_found", message: "Route not found" });
  } catch (error) {
    const statusCode = error instanceof Error && "statusCode" in error ? Number(error.statusCode) : 500;
    if (statusCode >= 500) {
      captureError(error, { correlationId, path: urlPath, method });
    }
    routeResponse.status(statusCode).json({
      code: statusCode === 403 ? "forbidden" : statusCode === 401 ? "unauthenticated" : "internal_error",
      message: error instanceof Error ? error.message : "Unexpected error",
      correlationId
    });
  } finally {
    logRequest({
      correlationId,
      method,
      path: urlPath,
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
      clientIp
    });
  }
}

function createRouteResponse(response: http.ServerResponse): MedusaRouteResponse {
  let statusCode = 200;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    }
  };
}

attachWsGateway(server);

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
  } catch (error) {
    process.stderr.write(
      `ensureSeedUser failed (server will still start): ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
  // Ensure location_ping partitions exist before ingesting (scale C5). No-op if
  // the table isn't partitioned yet (un-migrated DB).
  try {
    const { ensureLocationPingPartitions } = await import("./internal/jobs/partition-manager.js");
    await ensureLocationPingPartitions();
  } catch (error) {
    process.stderr.write(`partition ensure failed (non-fatal): ${error instanceof Error ? error.message : String(error)}\n`);
  }
  // Self-heal the additive feature schema (notification columns, attachment,
  // payments, attendance, surveys, …) so a DB seeded before these existed gets
  // them on restart — otherwise endpoints like /notifications 500 on a missing
  // column. All statements are idempotent (IF NOT EXISTS).
  try {
    const { ensureFeatureSchema } = await import("./db/ensure-feature-schema.js");
    const summary = await ensureFeatureSchema();
    process.stdout.write(`[schema] feature DDL ensured (applied=${summary.applied} failed=${summary.failed})\n`);
  } catch (error) {
    process.stderr.write(`feature schema ensure failed (non-fatal): ${error instanceof Error ? error.message : String(error)}\n`);
  }

  startRetentionScheduler();
  // Auto-stop abandoned tracking sessions so the live map never shows a rep
  // whose app died without stopping their session (fake live location fix).
  startSessionExpiryScheduler();
  startVisitSweepScheduler();
  startEodAdherenceScheduler();

  // Register the ERPNext provider when configured (ERPNEXT_ENABLED=true + keys).
  // Without it, getErpProvider() returns the no-op provider and ERP pushes are
  // silently skipped — so the app runs identically whether or not ERP is wired.
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

void bootstrap().finally(() => {
  server.listen(port, () => {
    process.stdout.write(
      `backend-medusa scaffold listening on http://localhost:${port}; WS at ws://localhost:${port}/ws/tracking; sentry=${isSentryConfigured() ? "on" : "off"}\n`
    );
  });
});
