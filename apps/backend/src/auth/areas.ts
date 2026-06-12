import { AuthorisationError } from "./tenant-auth.js";

/**
 * Strict two-area access model. Every role belongs to EXACTLY ONE area, and the
 * areas are mutually exclusive — an admin-area user can never reach a field
 * route and a field-area user can never reach an admin route.
 *
 *   - "admin"  → the back-office / management console (web dashboard):
 *                platform_admin, organisation_admin, sales_manager,
 *                operations_user, readonly_analyst.
 *   - "field"  → the field rep app (mobile): field_sales_representative.
 *
 * This is the single source of truth: the backend stamps `area` into the JWT and
 * the session response, and both frontends gate purely on that value so the rule
 * can never drift between client and server.
 */
export type AppArea = "admin" | "field";

/** Roles that live in the FIELD area. Everything else is admin-area. */
const FIELD_ROLES: ReadonlySet<string> = new Set(["field_sales_representative"]);

export function areaForRole(role: string): AppArea {
  return FIELD_ROLES.has(role) ? "field" : "admin";
}

/**
 * Throws 403 unless the actor's role belongs to `area`. Use on endpoints that
 * are exclusive to one area as defense-in-depth behind the per-permission gate,
 * so the separation holds even if a client is tricked into calling the wrong API.
 */
export function requireArea(actor: { role: string }, area: AppArea): void {
  if (areaForRole(actor.role) !== area) {
    throw new AuthorisationError(`This endpoint is restricted to the ${area} area.`);
  }
}
