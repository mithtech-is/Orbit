#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Orbit named Cloudflare tunnel (macOS).
#  Exposes the local backend (http://localhost:9090) at the PERMANENT URL
#    https://orbit.mith.tech
#  The URL never changes, so it's baked into the Orbit APK once. The phone
#  reaches it from ANY network — no hotspot, no IP juggling, no pasting.
#
#  Reads ~/.cloudflared/config.yml. Requires cloudflared + a one-time
#  `cloudflared tunnel login` against the mith.tech zone.
#  Install cloudflared: brew install cloudflared
# ---------------------------------------------------------------------------
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared not found. Install: brew install cloudflared"
  exit 1
fi
if [[ ! -f "$HOME/.cloudflared/config.yml" ]]; then
  echo "ERROR: ~/.cloudflared/config.yml not found. Run the one-time setup"
  echo "       (see infra/cloudflared/README.md)."
  exit 1
fi

cat <<'EOF'

===================================================
  ORBIT tunnel - https://orbit.mith.tech
===================================================
  Forwarding the public URL to your local backend on :9090.
  Keep this window OPEN during demos. Closing it takes the URL offline.
  Make sure the stack is running first (start.command).
===================================================

EOF

cloudflared tunnel run orbit

echo
echo "Tunnel stopped. https://orbit.mith.tech is offline until you run this again."
