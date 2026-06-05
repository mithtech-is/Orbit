import { getEnv } from "../config/env.js";

/**
 * Pluggable outbound email. The `log` provider (default) writes the message to
 * stdout — fine for dev and for a pilot where transactional email isn't wired
 * yet — while `smtp` sends for real via nodemailer. The selection is centralised
 * here so callers just `sendEmail(...)` without knowing the transport.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ ok: boolean; id?: string; error?: string }>;
}

/** Minimal structural type for the optional `nodemailer` dependency. */
interface NodemailerLike {
  createTransport(opts: unknown): {
    sendMail(opts: Record<string, unknown>): Promise<{ messageId: string }>;
  };
}

export function createLogEmailProvider(): EmailProvider {
  return {
    name: "log",
    async send(message) {
      process.stdout.write(
        `[email:log] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n`
      );
      return { ok: true, id: "log" };
    }
  };
}

/**
 * SMTP transport via nodemailer. Imported dynamically so the dependency is only
 * required when EMAIL_PROVIDER=smtp (add it with `pnpm --filter @orbit/backend-medusa add nodemailer`).
 * Config from SMTP_URL, or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.
 */
export function createSmtpEmailProvider(): EmailProvider {
  return {
    name: "smtp",
    async send(message) {
      try {
        // Non-literal specifier so tsc/bundlers don't require the optional dep at
        // build time — it's only present when EMAIL_PROVIDER=smtp.
        const specifier = "nodemailer";
        const mod = (await import(specifier)) as { default?: NodemailerLike } & NodemailerLike;
        const nodemailer: NodemailerLike = mod.default ?? mod;
        const url = process.env.SMTP_URL;
        const transport = url
          ? nodemailer.createTransport(url)
          : nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT ?? 587),
              secure: process.env.SMTP_SECURE === "true",
              auth: process.env.SMTP_USER
                ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
                : undefined
            });
        const info = await transport.sendMail({
          from: getEnv().emailFrom,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html
        });
        return { ok: true, id: info.messageId };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  };
}

/** Pure selector — exported for tests. */
export function selectEmailProvider(provider: "log" | "smtp"): EmailProvider {
  return provider === "smtp" ? createSmtpEmailProvider() : createLogEmailProvider();
}

let cached: EmailProvider | undefined;
export function getEmailProvider(): EmailProvider {
  if (!cached) cached = selectEmailProvider(getEnv().emailProvider);
  return cached;
}

/** Convenience entrypoint used across the app. Never throws — logs on failure. */
export async function sendEmail(message: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  const result = await getEmailProvider().send(message);
  if (!result.ok) {
    process.stderr.write(`[email] send failed to=${message.to}: ${result.error}\n`);
  }
  return { ok: result.ok, error: result.error };
}

/** Test helper. */
export function resetEmailProviderCache(): void {
  cached = undefined;
}
