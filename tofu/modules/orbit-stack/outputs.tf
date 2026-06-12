output "client_id" {
  value = var.client_id
}

output "web_url" {
  description = "Where the dashboard is reachable on the host."
  value       = "http://localhost:${local.web_host_port}"
}

output "backend_url" {
  description = "Where the backend API is reachable on the host."
  value       = "http://localhost:${local.backend_host_port}"
}

output "postgres_url" {
  description = "Postgres connection URL for this tenant (host-facing)."
  value       = "postgres://fieldsales:${var.postgres_password}@localhost:${local.postgres_host_port}/fieldsales"
  sensitive   = true
}

output "ports" {
  description = "Host ports allocated to this tenant."
  value = {
    postgres = local.postgres_host_port
    redis    = local.redis_host_port
    backend  = local.backend_host_port
    web      = local.web_host_port
  }
}
