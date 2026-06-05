# Backup & Restore Runbook

## What gets backed up

The only durable customer data lives in **Postgres**. Redis is a cache; losing it
means losing rate-limit state and pending WebSocket subscriptions — operationally annoying but no data loss.

Sensitive columns:
- `app_user.password_hash` — bcrypt hashes
- `consent_log.*` and `location_ping.*` — personal location history (GDPR-class)
- `audit_log.metadata` — may include actor user ids and IPs

## Backup cadence (pilot tier)

| Frequency | Method | Retention |
|---|---|---|
| Hourly | `pg_dump --format=custom` to local disk | 24 hours |
| Daily | Same dump uploaded to object storage (R2/S3/MinIO) | 30 days |
| Weekly | Same dump, retained off-site | 12 weeks |

Production tier should add point-in-time recovery (WAL archiving) — most managed Postgres providers (RDS, Cloud SQL, Supabase, Neon) do this automatically.

## Taking a backup

### Local Docker

```powershell
$ts = Get-Date -Format yyyyMMdd-HHmmss
docker exec fieldsales-postgres pg_dump -U fieldsales -d fieldsales --format=custom > "C:\backups\routepilot-$ts.dump"
```

### Production (managed Postgres)

```bash
pg_dump --format=custom --no-owner --no-acl \
  --dbname="$DATABASE_URL" \
  --file=routepilot-$(date +%Y%m%d-%H%M%S).dump
```

Pipe straight to your object storage if you'd rather not stage on disk:

```bash
pg_dump ... | aws s3 cp - s3://your-bucket/backups/routepilot-$(date +%Y%m%d-%H%M%S).dump
```

## Restoring a backup

### Restore over an existing database (DESTRUCTIVE)

```bash
# 1. Stop the backend so no new writes land mid-restore
pm2 stop routepilot-backend     # or your process manager

# 2. Drop the target DB (or restore to a side DB first and rename)
psql "$DATABASE_URL_ADMIN" -c "DROP DATABASE routepilot; CREATE DATABASE routepilot;"

# 3. Restore
pg_restore --no-owner --no-acl --dbname="$DATABASE_URL" routepilot-20260528-120000.dump

# 4. Verify migrations table is intact
psql "$DATABASE_URL" -c "SELECT count(*) FROM pgmigrations;"

# 5. Restart backend
pm2 start routepilot-backend
```

### Side-by-side restore (PREFERRED — no downtime if data flows can be paused)

```bash
# 1. Restore to a new DB on the same instance
createdb -O routepilot routepilot_restore
pg_restore --no-owner --no-acl --dbname=routepilot_restore routepilot-20260528-120000.dump

# 2. Sanity-check the restored DB
psql -d routepilot_restore -c "SELECT count(*) FROM app_user; SELECT count(*) FROM organisation;"

# 3. Switch over (rename, or update DATABASE_URL + restart backend)
```

## Verifying restorability

Practice a restore **at least monthly**. A backup you've never restored is not a backup.

Recommended drill:
1. Take a fresh backup
2. Restore it to a separate `routepilot_test` database
3. Run `pnpm migrate up` against it (should be a no-op because every migration is already applied)
4. `psql -d routepilot_test -c "SELECT email FROM app_user LIMIT 5;"` to confirm rows are present
5. Drop the test DB

## Retention compliance

Even with backups, the platform's runtime retention sweep deletes raw location pings older than `organisation_setting.raw_location_retention_days` (default 90). Backups must NOT silently extend that window for the tenant.

If a customer requests a data-deletion (GDPR Article 17), you must:
1. Delete the live rows (cascade from `app_user` and `organisation_setting`)
2. Mark older backups as "deletion pending" and rotate them out within 30 days
3. Write an audit_log entry `data.deletion_executed` so the action is recorded

## Sensitive variables in backups

The dump file contains bcrypt hashes — but **not** plaintext passwords. Bcrypt is slow to brute-force, but treat the dump as a credential. Storage rules:
- Encrypt the dump at rest (use `pg_dump | gpg --encrypt --recipient ops@you.com`)
- Bucket access via IAM with least privilege
- Never put dumps in a public CDN

## Disaster recovery target

For the pilot tier:
- **RPO (recovery point objective):** 1 hour (matches the hourly local dump)
- **RTO (recovery time objective):** 2 hours from incident detection

Production tier targets:
- **RPO:** 5 minutes (continuous WAL archiving)
- **RTO:** 30 minutes (warm standby)
