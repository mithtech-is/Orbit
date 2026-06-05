# Tenant Isolation Policy

Every field-sales business record includes `organisation_id`. Query services and API routes must derive tenant context from authenticated session data, not from untrusted request bodies.

Required safeguards:

- Reject cross-tenant record access before workflow execution.
- Include `organisation_id` in database unique constraints where natural keys could collide.
- Add tenant and time indexes for operational queries.
- Broadcast WebSocket events only after tenant and role filtering.
- Include tenant context in audit logs.
- Do not allow mobile clients to override organisation scope in sync payloads.

The first enforcement layer is `requireTenantPermission` in the backend scaffold. The next backend task is to wire this into Medusa middleware and module query services.
