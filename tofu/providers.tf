terraform {
  required_version = ">= 1.6.0"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {
  # Defaults to the local Docker daemon (Docker Desktop on Windows). To target
  # a remote daemon over SSH, set `host = "ssh://user@host"`. When this stack
  # graduates to a real cloud, the docker provider stays only for builds/pushes
  # and resources move to e.g. hcloud_server / aws_instance / digitalocean_droplet.
}
