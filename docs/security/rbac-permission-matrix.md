# RBAC Permission Matrix

| Permission | Platform Admin | Organisation Admin | Sales Manager | Field Rep | Operations User | Read-only Analyst |
|---|---:|---:|---:|---:|---:|---:|
| `organisation:manage` | Yes | Yes | No | No | No | No |
| `user:manage` | No | Yes | No | No | No | No |
| `team:manage` | No | Yes | No | No | No | No |
| `lead:read` | Audited | Yes | Team scoped | Assigned scoped | Yes | No |
| `lead:write` | Audited | Yes | Team scoped | No | Yes | No |
| `outlet:read` | Audited | Yes | Team scoped | Assigned scoped | Yes | No |
| `outlet:write` | Audited | Yes | No | No | Yes | No |
| `territory:manage` | Audited | Yes | No | No | No | No |
| `route:plan` | Audited | Yes | Team scoped | No | Yes | No |
| `visit:write` | No | No | Review only | Own visits | No | No |
| `tracking:send` | No | No | No | Active session only | No | No |
| `tracking:view_live` | Audited | Yes | Team scoped | No | No | No |
| `order:create` | No | No | No | Assigned outlet | Yes | No |
| `report:read` | Audited | Yes | Team scoped | No | Yes | Yes |
| `audit:read` | Audited | Yes | No | No | No | No |
| `policy:manage` | Audited | Yes | No | No | No | No |

Rules:

- Every permission is tenant-scoped unless explicitly platform-level.
- Platform Admin access to tenant-sensitive data is exceptional and audited.
- Managers only see assigned teams.
- Reps only see assigned outlets, leads, routes and own visits.
- Reps can send location only after consent and during an active work session.
