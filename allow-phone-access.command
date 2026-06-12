#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Orbit - allow phone access through the macOS Application Firewall.
#
#  Unlike Windows, macOS's firewall is OFF by default and only blocks inbound
#  per-application (not per-port). If a phone fails to reach Orbit (Metro :8088,
#  backend :9090, web :3001) the cause is usually one of:
#    1. Firewall is enabled AND `node` is set to "Block incoming connections"
#       → fix below.
#    2. The Wi-Fi network isolates clients (common on guest/office Wi-Fi)
#       → no firewall change helps; switch to phone hotspot.
#
#  This script: if the macOS firewall is ON, whitelist `node` and `Docker`
#  for inbound connections. If the firewall is OFF, it's a no-op and prints
#  a hint.
# ---------------------------------------------------------------------------
set -u

FW=/usr/libexec/ApplicationFirewall/socketfilterfw

state="$("$FW" --getglobalstate 2>/dev/null || echo unknown)"
echo "$state"

if ! echo "$state" | grep -qi enabled; then
  cat <<EOF

macOS Firewall is OFF (default). No changes needed - your phone can already
reach the laptop on any Wi-Fi where the two are on the same subnet.

If a phone still can't reach Orbit, the cause is the Wi-Fi network (client
isolation on guest/office Wi-Fi). Switch to your phone's hotspot:
  iPhone : Settings → Personal Hotspot → Allow Others to Join
  Android: Settings → Network → Hotspot & tethering
Then connect the Mac to that hotspot and re-run start.command.
EOF
  exit 0
fi

# Firewall is ON - whitelist node + Docker for inbound.
NODE_BIN="$(command -v node || true)"
DOCKER_BIN="$(command -v docker || true)"

echo "macOS Firewall is ON. Whitelisting node and Docker for inbound..."
echo "(you may be prompted for your password to update the firewall)"

if [[ -n "$NODE_BIN" ]]; then
  sudo "$FW" --add "$NODE_BIN" >/dev/null
  sudo "$FW" --unblockapp "$NODE_BIN" >/dev/null
  echo "  + $NODE_BIN  (Expo Metro on :8088)"
fi
if [[ -n "$DOCKER_BIN" ]]; then
  sudo "$FW" --add "$DOCKER_BIN" >/dev/null
  sudo "$FW" --unblockapp "$DOCKER_BIN" >/dev/null
  echo "  + $DOCKER_BIN  (backend :9090, web :3001)"
fi

echo
echo "Done. Your phone can now reach Orbit on any Wi-Fi (same network as the Mac)."
