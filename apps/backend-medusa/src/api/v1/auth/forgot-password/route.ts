import type { MedusaRouteRequest, MedusaRouteResponse } from "../../../types.js";
import { findUserByEmail } from "../../../../auth/auth-service.js";
import { generateResetToken, hashResetToken, createResetToken, RESET_TOKEN_TTL_MINUTES } from "../../../../auth/password-reset.js";
import { sendEmail } from "../../../../integrations/email-provider.js";
import { getEnv } from "../../../../config/env.js";
import { writeAuditLog } from "../../../../modules/audit-and-compliance/repository.js";

/**
 * POST /api/v1/auth/forgot-password  { email, organisationId }
 *
 * Always returns 200 with the same message whether or not the account exists —
 * never leak which emails are registered. When the account does exist we email
 * a single-use, time-boxed reset link.
 */
export async function POST(req: MedusaRouteRequest, res: MedusaRouteResponse) {
  const body = (req.body as Record<string, unknown>) ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const organisationId = typeof body.organisationId === "string" ? body.organisationId.trim() : "";

  const generic = { status: "ok", message: "If that account exists, a reset link has been sent." };

  if (!email || !organisationId) {
    res.status(400).json({ code: "validation_error", message: "email and organisationId are required" });
    return;
  }

  const user = await findUserByEmail(organisationId, email);
  if (user && user.active) {
    const token = generateResetToken();
    await createResetToken({ organisationId, userId: user.id, tokenHash: hashResetToken(token) });
    const url = `${getEnv().appUrl}/reset-password?org=${encodeURIComponent(organisationId)}&token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your Orbit password",
      text: `Reset your password (valid for ${RESET_TOKEN_TTL_MINUTES} minutes):\n\n${url}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>Reset your Orbit password (valid for ${RESET_TOKEN_TTL_MINUTES} minutes):</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p>`
    });
    await writeAuditLog({
      organisationId,
      actorUserId: user.id,
      action: "auth.password_reset.requested",
      targetType: "app_user",
      targetId: user.id,
      metadata: {}
    });
  }

  res.status(200).json(generic);
}
