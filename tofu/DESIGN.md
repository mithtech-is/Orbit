# Per-client provisioning — design

The current `orbit-stack` module uses the Docker provider so it runs locally
with no cloud spend. This document captures the architecture so the same
module interface graduates to a real cloud without reshaping the call sites.

## The contract

A tenant is provisioned by calling:

```hcl
module "client_X" {
  source            = "./modules/orbit-stack"
  client_id         = "<slug>"
  port_offset       = <int>     # local-only; ignored in cloud
  extra_backend_env = { ... }   # per-tenant config
}
```

Outputs are always `web_url`, `backend_url`, `postgres_url`, `ports`. Anything
calling the module (CI, admin tooling, a self-serve UI) sees the same shape
regardless of substrate.

## Substrate evolution

| Tier | Substrate | What changes |
|------|-----------|--------------|
| 0 (today) | Docker provider, single host | — |
| 1 | Single VM (Hetzner/DO) running Docker, one tenant per VM, DNS via Cloudflare | Add `hcloud_server` + `cloudflare_record` resources; backend/web become `docker_container` on the VM via remote daemon |
| 2 | Single VM, multiple tenants per VM (today's offset model, but in the cloud) | Same as tier 1 + reverse proxy (Caddy) routing `${client_id}.orbit.app` to the right tenant's port |
| 3 | Managed services per tenant: managed Postgres, managed Redis, container runtime (ECS/Cloud Run/Fly) | Swap `docker_container "postgres"` → `hcloud_managed_postgres` or `aws_db_instance`; `docker_container "backend"` → `aws_ecs_service` or `fly_app` |
| 4 | Multi-region, per-tenant region pinning, blue/green | Region becomes a module variable; add `cloudfront_distribution` / global DNS |

Each step is a localized resource swap — `client_id`, `extra_backend_env`,
and the outputs stay constant.

## State management

Today: local state (`tofu/terraform.tfstate`), gitignored. Fine for
exploration and a single operator.

For tier 1+ this MUST become remote state, otherwise two operators racing
`apply` will corrupt each other's work. Options:

- **S3 + DynamoDB lock** (AWS-native, ~free at this scale)
- **Cloudflare R2 + lock via Workers** (cheapest, requires custom lock impl)
- **Terraform Cloud / Scalr / Spacelift** (managed; the easy answer if budget allows)

Pick when tier 1 lands.

## Secrets

Today: `postgres_password` is a Tofu variable with a dev default. State
contains it; state is gitignored. Acceptable for tier 0 only.

For tier 1+: secrets MUST come from a vault, not Tofu variables.

- **Doppler / 1Password Connect / AWS Secrets Manager / SOPS-encrypted YAML**.
- Tofu reads them via a `data` source at apply time; state still holds the
  rendered value, which is why remote state with at-rest encryption matters.
- For per-tenant secrets (each client's SMTP password, ERPNext API keys),
  the pattern is `data "vault_kv_v2" { path = "orbit/tenants/${client_id}" }`.

## Tenant lifecycle

The module today provisions containers + volumes. For cloud, a tenant also
has:

- DNS records (`${client_id}.orbit.app`)
- TLS certificate (Let's Encrypt via Caddy auto-cert, or ACM)
- Per-tenant S3 bucket (for object storage isolation)
- Per-tenant secret bundle (vault path)
- A backup schedule (managed DB snapshots, S3 lifecycle rules)

These all become additional resources inside `orbit-stack` — same `client_id`,
no caller changes.

## What still needs decision (defer until tier 1)

- **Cloud:** Hetzner (cheapest), AWS (most flexible), GCP (best managed runtimes), Fly.io (developer-friendly).
- **Database:** Self-hosted Postgres-on-VM (cheapest) vs managed Postgres (one less ops surface, ~3x cost).
- **Container runtime:** docker-compose-on-VM (familiar, what we have today) vs ECS / Cloud Run / Fly Machines (real platform features but new ops vocabulary).
- **Tenant density:** one VM per client (clean blast radius, more spend) vs many tenants per VM (cheaper, shared-fate risk).

These are decisions worth making with real client revenue and reliability
needs in hand — not now. The module's job today is to make the *interface*
stable so those decisions become resource-body swaps, not architectural
rewrites.
