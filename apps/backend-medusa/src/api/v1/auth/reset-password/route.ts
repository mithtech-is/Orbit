import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { hashResetToken, findValidResetToken, markResetTokenUsed } from "../../../../auth/password-reset.js";
import { setUserPassword } from "../../../../auth/auth-service.js";
import { writeAuditLog } from "../../../../modules/audit-and-compliance/repository.js";

/**
 * POST /api/v1/auth/reset-password  { organisationId, token, newPassword }
 *
 * Redeems a single-use reset token: validates it, sets the new password (with
 * strength rules), and burns the token. Invalid/expired/used tokens return 400
 * without revealing which condition failed.
 */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const body = (req.body as Record<string, unknown>) ?? {};
  const organisationId = typeof body.organisationId === "string" ? body.organisationId.trim() : "";
  const token = typeof body.token === "string" ? body.token : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!organisationId || !token || !newPassword) {
    res.status(400).json({ code: "validation_error", message: "organisationId, token and newPassword are required" });
    return;
  }

  const row = await findValidResetToken(organisationId, hashResetToken(token));
  if (!row) {
    res.status(400).json({ code: "invalid_token", message: "This reset link is invalid or has expired. Request a new one." });
    return;
  }

  try {
    const updated = await setUserPassword(organisationId, row.user_id, newPassword);
    if (!updated) {
      res.status(400).json({ code: "invalid_token", message: "This reset link is no longer valid." });
      return;
    }
  } catch (error) {
    res.status(400).json({ code: "weak_password", message: error instanceof Error ? error.message : "Invalid password" });
    return;
  }

  await markResetTokenUsed(row.id);
  await writeAuditLog({
    organisationId,
    actorUserId: row.user_id,
    action: "auth.password_reset.completed",
    targetType: "app_user",
    targetId: row.user_id,
    metadata: {}
  });

  res.status(200).json({ status: "ok", message: "Your password has been reset. You can sign in now." });
}
