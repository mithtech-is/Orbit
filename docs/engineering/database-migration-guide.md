# Database Migration Guide

We use [node-pg-migrate](https://github.com/salsita/node-pg-migrate) — a mature MIT-licensed tool that gives us versioned, rollback-able SQL migrations against the same Postgres + PostGIS instance used by the rest of the platform.

Migrations live in `apps/backend-medusa/migrations/` and run inside a transaction by default.

## Quick reference

```powershell
# Apply all pending migrations
DATABASE_URL=postgres://… pnpm migrate up

# Roll back the last migration
DATABASE_URL=postgres://… pnpm migrate down

# Generate a new empty migration file (timestamp-prefixed)
pnpm exec node-pg-migrate create my-change --migrations-dir apps/backend-medusa/migrations --migration-file-language sql

# Skip a migration (dangerous, use rarely)
pnpm migrate redo
```

## File format

Each migration is a `.sql` file with **two clearly marked sections**:

```sql
-- Up
-- /////////////////////////////////////////////////////////////////////////
CREATE TABLE foo (...);

-- Down
-- /////////////////////////////////////////////////////////////////////////
DROP TABLE foo;
```

`node-pg-migrate` reads the `-- Up` / `-- Down` markers to know which direction to apply.

## Pilot deployment workflow

1. Provision Postgres (with PostGIS extension available).
2. Set `DATABASE_URL` in your deployment env.
3. Run `pnpm migrate up` BEFORE starting the backend.
4. Verify the `pgmigrations` table exists and lists your applied migration set.

## Adding a new migration

1. `pnpm exec node-pg-migrate create add-feature-x --migrations-dir apps/backend-medusa/migrations --migration-file-language sql`
2. Edit the generated file. Put the additive change under `-- Up` and the reverse under `-- Down`.
3. Commit it. **Never edit an already-deployed migration** — write a new one to amend.
4. CI runs `pnpm migrate up` on a fresh DB so misordered migrations are caught before deploy.

## Sequence number

`node-pg-migrate` uses the file's leading number/timestamp to order migrations. The initial baseline migration is `1700000000000_initial-schema.sql`. New migrations get a higher number; the CLI generates them automatically.

## Relationship with `src/db/schema.sql`

`schema.sql` is retained for local-only convenience (it lets you bootstrap a dev DB with one `psql` pipe). The **authoritative** source for production schema is the migrations directory. Any change to `schema.sql` must be mirrored as a new migration.

To keep them in sync:
- Add the change to the new migration file under `-- Up`
- Reflect the final state in `schema.sql` (CREATE TABLE IF NOT EXISTS …)
- Run `pnpm migrate up` against a fresh local DB to confirm both produce the same shape

## Initial deployment example

```powershell
# 1. Bring up Postgres (managed or self-host with PostGIS)
# 2. Apply schema:
$env:DATABASE_URL = "postgres://user:pw@host:5432/routepilot"
pnpm migrate up

# 3. Create the first organisation + admin:
pnpm create-initial-admin --org my-customer --orgName "My Customer" --email admin@my-customer.com --name "First Admin"
# (will prompt for password — pick something strong)

# 4. Start the backend
NODE_ENV=production JWT_SECRET=… DATABASE_URL=… REDIS_URL=… APP_URL=… AUTH_CORS=… pnpm --filter @orbit/backend-medusa dev:scaffold
```

## Rollback considerations

`pnpm migrate down` reverses the most recent migration. **Test rollbacks in staging** — destructive `DROP TABLE` operations cannot be undone without a backup. The pattern: any change touching customer data ships in two PRs — first additive, then a cleanup migration weeks later once the additive change is proven safe.
