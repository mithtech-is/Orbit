output "demo" {
  description = "URLs and ports for the demo tenant."
  value       = module.client_demo
  sensitive   = true # the module exports postgres_url as sensitive
}
