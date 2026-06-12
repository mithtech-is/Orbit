# Orbit — Infrastructure as Code (OpenTofu)

This directory provisions Orbit deployments using [OpenTofu](https://opentofu.org/).
Today it runs locally via the [Docker provider](https://registry.terraform.io/providers/kreuzwerker/docker/latest);
the same module interface will graduate to a real cloud (see [DESIGN.md](DESIGN.md)).

## What it does

The `orbit-stack` module provisions **one isolated tenant** — postgres, redis,
backend, and web — on its own Docker network with its own named volumes and a
non-colliding host-port range. The root config calls it once per client.

```
tofu/
├─ providers.tf          # docker provider pin
├─ main.tf               # one module call per tenant
├─ outputs.tf
└─ modules/orbit-stack/  # the reusable tenant module
   ├─ variables.tf       # client_id, port_offset, image tags, extra env
   ├─ main.tf            # network, volumes, postgres, redis, backend, web
   └─ outputs.tf         # URLs and ports
```

## Prerequisites

- Docker Desktop running.
- The backend/web images built (run `start.bat` once — compose builds
  `orbit-backend:local` and `orbit-web:local`, which the module reuses).
- OpenTofu ≥ 1.6 installed (`tofu version`).

## Quick start

```powershell
cd tofu
tofu init       # downloads the docker provider
tofu plan       # shows what will change
tofu apply      # provisions the demo tenant
```

Default tenant (`client_id = "demo"`, `port_offset = 10`) is reachable at:

| Service  | URL                          |
|----------|------------------------------|
| Web      | http://localhost:3011        |
| Backend  | http://localhost:9100/health |
| Postgres | localhost:15442              |
| Redis    | localhost:6390               |

These ports are **offset by 10 from start.bat's stack** (which uses 3001 /
9090 / 15432 / 6380), so both stacks coexist — useful for showing isolation.

## Add another tenant

Copy a module block in `main.tf`, bump `port_offset` by 10, and `tofu apply`:

```hcl
module "client_acme" {
  source      = "./modules/orbit-stack"
  client_id   = "acme"
  port_offset = 20         # 3021 / 9110 / 15452 / 6400
  extra_backend_env = {
    ERPNEXT_ENABLED = "true"
  }
}
```

A second `tofu apply` brings up the second tenant — fully isolated, no
shared database, no shared cache, no port collision. That is the per-client
provisioning pattern in one command.

## Tear down

```powershell
tofu destroy            # removes ALL tenants
tofu destroy -target=module.client_demo   # one tenant only
```

Volumes are removed with the containers — data is wiped on destroy. To
persist data across destroys, add `external = true` to the `docker_volume`
resources in the module.

## Coexistence with `start.bat`

Both stacks can run at the same time:

- `start.bat` → `orbit-postgres`, `orbit-backend`, `orbit-web` on
  15432 / 9090 / 3001 (the demo stack).
- `tofu apply` → `orbit-tf-demo-postgres`, `orbit-tf-demo-backend`,
  `orbit-tf-demo-web` on 15442 / 9100 / 3011.

The Tofu-managed containers use the `orbit-tf-` prefix and offset ports, so
they never collide. The dev workflow (start.bat) is unchanged.
