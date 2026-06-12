terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

# ---------------------------------------------------------------------------
#  orbit-stack module — one isolated tenant.
#
#  Layout: every resource is prefixed with "orbit-tf-${client_id}-" so it
#  cannot collide with the docker-compose stack (orbit-postgres / orbit-web /
#  ...) that start.bat manages. The two stacks coexist; you can blow away
#  Tofu-managed clients without touching the demo stack.
# ---------------------------------------------------------------------------

locals {
  name_prefix = "orbit-tf-${var.client_id}"
  # Base host ports — matched to docker-compose so the runbook is identical.
  postgres_host_port = 15432 + var.port_offset
  redis_host_port    = 6380 + var.port_offset
  backend_host_port  = 9090 + var.port_offset
  web_host_port      = 3001 + var.port_offset
}

# Tenant-private network: every container in this stack is reachable as its
# service name (postgres, redis, backend) from any other container, and is
# isolated from other tenants' networks.
resource "docker_network" "this" {
  name = "${local.name_prefix}-net"
}

# Named volumes — persist data across `tofu destroy` only if `external = true`
# is later added. Today, destroy removes them; matches dev expectations.
resource "docker_volume" "postgres_data" {
  name = "${local.name_prefix}-postgres-data"
}

resource "docker_volume" "redis_data" {
  name = "${local.name_prefix}-redis-data"
}

# ---- postgres -------------------------------------------------------------
resource "docker_image" "postgres" {
  name         = "postgis/postgis:16-3.4"
  keep_locally = true
}

resource "docker_container" "postgres" {
  name  = "${local.name_prefix}-postgres"
  image = docker_image.postgres.image_id

  networks_advanced {
    name    = docker_network.this.name
    aliases = ["postgres"]
  }

  env = [
    "POSTGRES_DB=fieldsales",
    "POSTGRES_USER=fieldsales",
    "POSTGRES_PASSWORD=${var.postgres_password}",
    "POSTGRES_HOST_AUTH_METHOD=trust",
  ]

  ports {
    internal = 5432
    external = local.postgres_host_port
  }

  volumes {
    volume_name    = docker_volume.postgres_data.name
    container_path = "/var/lib/postgresql/data"
  }

  restart = "unless-stopped"

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U fieldsales -d fieldsales"]
    interval = "10s"
    timeout  = "5s"
    retries  = 5
  }
}

# ---- redis ----------------------------------------------------------------
resource "docker_image" "redis" {
  name         = "redis:7-alpine"
  keep_locally = true
}

resource "docker_container" "redis" {
  name  = "${local.name_prefix}-redis"
  image = docker_image.redis.image_id

  networks_advanced {
    name    = docker_network.this.name
    aliases = ["redis"]
  }

  command = ["redis-server", "--appendonly", "yes"]

  ports {
    internal = 6379
    external = local.redis_host_port
  }

  volumes {
    volume_name    = docker_volume.redis_data.name
    container_path = "/data"
  }

  restart = "unless-stopped"

  healthcheck {
    test     = ["CMD", "redis-cli", "ping"]
    interval = "10s"
    timeout  = "5s"
    retries  = 5
  }
}

# ---- wait gate: block backend until postgres ACCEPTS CONNECTIONS ----------
#  docker_container "depends_on" only waits for the container to exist, NOT
#  for postgres to be ready. The backend's schema-init runs once on startup
#  and silently swallows errors, so an early race leaves the DB empty. This
#  null_resource polls pg_isready and only completes when postgres answers,
#  giving the backend a clean DB to initialize against.
resource "null_resource" "postgres_ready" {
  triggers = {
    postgres_id = docker_container.postgres.id
  }

  provisioner "local-exec" {
    interpreter = ["powershell", "-NoProfile", "-Command"]
    command     = <<-EOT
      for ($i = 0; $i -lt 60; $i++) {
        docker exec ${docker_container.postgres.name} pg_isready -U fieldsales -d fieldsales 2>$null
        if ($LASTEXITCODE -eq 0) { exit 0 }
        Start-Sleep -Seconds 2
      }
      Write-Error "postgres did not become ready within 120s"
      exit 1
    EOT
  }
}

# ---- backend --------------------------------------------------------------
# Backend reuses the image docker-compose builds (orbit-backend:local). If
# that image doesn't exist locally yet, run start.bat once first so compose
# builds it. A real cloud version would build via a docker_image resource
# with a build {} block, or pull from a registry.
resource "docker_container" "backend" {
  name  = "${local.name_prefix}-backend"
  image = var.backend_image

  networks_advanced {
    name    = docker_network.this.name
    aliases = ["backend"]
  }

  # extra_backend_env overrides any default with the same key.
  env = [for k, v in merge({
    NODE_ENV          = "development"
    PORT              = "9090"
    DATABASE_URL      = "postgres://fieldsales:${var.postgres_password}@postgres:5432/fieldsales"
    REDIS_URL         = "redis://redis:6379"
    APP_URL           = "http://localhost:${local.web_host_port}"
    AUTH_CORS         = "http://localhost:${local.web_host_port}"
    MAP_PROVIDER      = "osrm"
    OSRM_USER_AGENT   = "Orbit/1.0 (+https://orbit.app)"
    OSRM_BASE_URL     = "https://router.project-osrm.org"
    NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"
  }, var.extra_backend_env) : "${k}=${v}"]

  ports {
    internal = 9090
    external = local.backend_host_port
  }

  restart = "unless-stopped"

  depends_on = [null_resource.postgres_ready, docker_container.redis]
}

# ---- web dashboard --------------------------------------------------------
resource "docker_container" "web" {
  name  = "${local.name_prefix}-web"
  image = var.web_image

  networks_advanced {
    name    = docker_network.this.name
    aliases = ["web"]
  }

  env = [
    "NODE_ENV=development",
    "PORT=3001",
    # Browser runs on the host, so it reaches the backend via host port.
    "NEXT_PUBLIC_API_BASE_URL=http://localhost:${local.backend_host_port}",
    "NEXT_PUBLIC_WS_URL=ws://localhost:${local.backend_host_port}",
    "NEXT_PUBLIC_MEDUSA_ADMIN_URL=http://localhost:${local.backend_host_port}",
  ]

  ports {
    internal = 3001
    external = local.web_host_port
  }

  restart = "unless-stopped"

  depends_on = [docker_container.backend]
}
