/**
 * Production-safe first-admin provisioning CLI.
 *
 * Usage:
 *   pnpm create-initial-admin --org acme --email admin@acme.example --name "Anika Rao"
 *
 * The password is read from stdin (hidden) so it never lands in shell history.
 * Refuses to run unless DATABASE_URL is reachable. Refuses weak passwords.
 *
 * For automation, set INITIAL_ADMIN_PASSWORD env var instead of typing.
 */

import { createInterface } from "node:readline";
import { getEnv } from "../config/env.js";
import { createUserWithPassword } from "../auth/auth-service.js";
import { getDatabasePool } from "../db/client.js";

interface CliArgs {
  organisationId: string;
  organisationName?: string;
  email: string;
  name: string;
  role: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        args[key] = value;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  if (!args.org || !args.email || !args.name) {
    throw new Error(
      "Usage: pnpm create-initial-admin --org <id> --email <user@example.com> --name \"First Last\" [--orgName \"Org Name\"] [--role organisation_admin]"
    );
  }
  return {
    organisationId: args.org,
    organisationName: args.orgName,
    email: args.email,
    name: args.name,
    role: args.role ?? "organisation_admin"
  };
}

async function readHiddenLine(prompt: string): Promise<string> {
  const env = process.env.INITIAL_ADMIN_PASSWORD;
  if (env) return env;
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const env = getEnv();
  process.stdout.write(`Connecting to ${env.databaseUrl.replace(/:[^@/]*@/, ":***@")} …\n`);
  const args = parseArgs(process.argv.slice(2));

  const pool = getDatabasePool();
  // Ensure the organisation exists. We don't create it implicitly because
  // organisation creation is a deliberate operational step.
  const orgCheck = await pool.query(`SELECT id, name FROM organisation WHERE id = $1`, [args.organisationId]);
  if (orgCheck.rowCount === 0) {
    if (!args.organisationName) {
      throw new Error(
        `Organisation '${args.organisationId}' does not exist. Re-run with --orgName "Acme Field Sales" to create it.`
      );
    }
    await pool.query(
      `INSERT INTO organisation (id, name, slug) VALUES ($1, $2, $3)`,
      [args.organisationId, args.organisationName, args.organisationId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()]
    );
    await pool.query(
      `INSERT INTO organisation_setting (organisation_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [args.organisationId]
    );
    process.stdout.write(`Created organisation '${args.organisationId}'.\n`);
  } else {
    process.stdout.write(`Organisation '${args.organisationId}' found.\n`);
  }

  // Seed role_permission rows if missing, so the admin can actually do things.
  const permissions = [
    "organisation:manage", "user:manage", "team:manage", "policy:manage",
    "audit:read", "report:read",
    "lead:read", "lead:write", "outlet:read", "outlet:write",
    "territory:manage", "route:plan", "tracking:view_live", "visit:write", "order:create"
  ];
  for (const permission of permissions) {
    await pool.query(
      `INSERT INTO role_permission (organisation_id, role, permission) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [args.organisationId, args.role, permission]
    );
  }

  const password = await readHiddenLine(
    `Set initial password for ${args.email} (min 12 chars, not 'admin*' / 'password*'): `
  );

  const { id } = await createUserWithPassword({
    organisationId: args.organisationId,
    email: args.email,
    name: args.name,
    role: args.role,
    password,
    forcePasswordChange: true
  });

  process.stdout.write(`\nUser created.\n  id: ${id}\n  email: ${args.email}\n  role: ${args.role}\n`);
  process.stdout.write(`The user will be required to change their password on first sign-in.\n`);
  await pool.end();
}

main().catch((err) => {
  process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
