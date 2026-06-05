import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { findUserByEmail, getUserPermissions, verifyPassword, signToken } from "../../../../auth/auth-service.js";
import { areaForRole } from "../../../../auth/areas.js";
import { loginLockRemaining, recordLoginFailure, clearLoginFailures } from "../../../../auth/login-security.js";
import { queryRows } from "../../../../db/client.js";

export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const body = req.body as Record<string, string> | undefined;

  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  const organisationId = body?.organisationId?.trim();

  if (!email || !password || !organisationId) {
    res.status(400).json({ code: "validation_error", message: "email, password, and organisationId are required" });
    return;
  }

  const lockRemaining = await loginLockRemaining(organisationId, email);
  if (lockRemaining > 0) {
    res.status(429).json({
      code: "account_locked",
      message: `Too many failed attempts. Try again in ${Math.ceil(lockRemaining / 60)} minute(s).`,
      retryAfterSeconds: lockRemaining
    });
    return;
  }

  const user = await findUserByEmail(organisationId, email);
  if (!user || !user.password_hash || !user.active) {
    await recordLoginFailure(organisationId, email);
    res.status(401).json({ code: "auth_error", message: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordLoginFailure(organisationId, email);
    res.status(401).json({ code: "auth_error", message: "Invalid credentials" });
    return;
  }

  await clearLoginFailures(organisationId, email);
  const permissions = await getUserPermissions(organisationId, user.role);

  const token = signToken({
    userId: user.id,
    organisationId: user.organisation_id,
    role: user.role,
    permissions
  });

  const flags = await queryRows<{ password_change_required: boolean }>(
    `SELECT password_change_required FROM app_user WHERE id = $1`,
    [user.id]
  );

  res.status(200).json({
    token,
    userId: user.id,
    organisationId: user.organisation_id,
    name: user.name,
    email: user.email,
    role: user.role,
    area: areaForRole(user.role),
    permissions,
    passwordChangeRequired: Boolean(flags[0]?.password_change_required)
  });
}
