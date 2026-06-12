# ---------------------------------------------------------------------------
#  Root config — instantiate Orbit clients.
#
#  Each `module "client_*"` block = one fully isolated tenant: own postgres,
#  own redis, own backend, own web, own network, own port range. To add a new
#  client, copy a block and bump `port_offset` by 10 (room for future ports).
#
#  IMPORTANT: by default, port_offset=0 collides with the start.bat /
#  docker-compose stack. Start fresh tenants at offset=10+, OR stop the
#  compose stack first (`docker compose -f infra/docker/docker-compose.yml down`).
# ---------------------------------------------------------------------------

# Primary tenant — uses canonical ports (3001 / 9090 / 15432 / 6380), which is
# what the mobile app, desktop app, and dashboard bookmarks already target.
# REQUIRES the docker-compose stack to be DOWN first
# (`docker compose -f infra/docker/docker-compose.yml down`), else ports collide.
# start.bat now stops compose and runs `tofu apply` automatically.
module "client_demo" {
  source = "./modules/orbit-stack"

  client_id   = "demo"
  port_offset = 0
  # Reachable at:
  #   postgres = localhost:15432
  #   redis    = localhost:6380
  #   backend  = localhost:9090
  #   web      = localhost:3001
}

# Example: add a second tenant by uncommenting. Ports auto-offset by 20.
#
# module "client_mithtech" {
#   source = "./modules/orbit-stack"
#
#   client_id   = "mithtech"
#   port_offset = 20
#   extra_backend_env = {
#     ERPNEXT_ENABLED = "true"
#     ERPNEXT_BASE_URL = "http://host.docker.internal:8082"
#   }
# }
