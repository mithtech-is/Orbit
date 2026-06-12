# ---------------------------------------------------------------------------
#  module: orbit-stack
#  One isolated Orbit deployment for a single client/tenant.
#
#  Inputs are intentionally minimal: a client_id (slug, becomes the resource
#  name prefix) and a port_offset (so multiple clients can run side-by-side
#  on the same host without colliding). Image tags default to :local — the
#  images built by the existing infra/docker/docker-compose.yml — so this
#  module reuses what the dev workflow already produces.
#
#  When this graduates from the Docker provider to a real cloud (Hetzner,
#  AWS, etc.), the variables stay the same; only the resource bodies change.
# ---------------------------------------------------------------------------

variable "client_id" {
  description = "Slug used to name this client's resources (e.g. 'mithtech', 'acme'). Must match ^[a-z0-9-]+$."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.client_id))
    error_message = "client_id must be lowercase letters, digits, and hyphens only."
  }
}

variable "port_offset" {
  description = "Added to base host ports so multiple clients don't collide. Stack uses postgres=15432+offset, redis=6380+offset, backend=9090+offset, web=3001+offset."
  type        = number
  default     = 0
}

variable "backend_image" {
  description = "Backend container image. Defaults to the locally-built image from docker-compose."
  type        = string
  default     = "orbit-backend:local"
}

variable "web_image" {
  description = "Web dashboard container image."
  type        = string
  default     = "orbit-web:local"
}

variable "postgres_password" {
  description = "Postgres password for this client. Defaults to a dev value; OVERRIDE in any non-dev environment."
  type        = string
  default     = "fieldsales"
  sensitive   = true
}

variable "extra_backend_env" {
  description = "Extra env vars to inject into the backend (overrides built-ins). Useful per-client config: ERPNext keys, SMTP, S3, etc."
  type        = map(string)
  default     = {}
}
