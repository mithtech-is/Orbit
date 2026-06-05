# API Usage Examples

## Development Session Request

```bash
curl http://localhost:9000/api/v1/auth/session \
  -H "x-field-sales-user-id: user_admin" \
  -H "x-field-sales-organisation-id: org_acme" \
  -H "x-field-sales-role: organisation_admin" \
  -H "x-field-sales-permissions: organisation:manage,user:manage,policy:manage"
```

## Tenant Status Request

```bash
curl http://localhost:9000/api/v1/organisations \
  -H "x-field-sales-user-id: user_admin" \
  -H "x-field-sales-organisation-id: org_acme" \
  -H "x-field-sales-role: organisation_admin" \
  -H "x-field-sales-permissions: organisation:manage"
```

Production authentication will use Medusa auth/session tokens. The current header context is a development scaffold for testing tenant and permission boundaries before the full auth provider is wired.
