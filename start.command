#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Orbit one-click launcher (macOS).
#  Sibling of start.bat. Same flow: Docker → compose build → tofu apply →
#  open the dashboard → launch Expo on the laptop's real LAN IP with the
#  backend URL baked into the bundle so the phone reaches the right host
#  regardless of network.
#
#  Usage: double-click start.command in Finder, OR run `./start.command`
#         from Terminal. Requires Docker Desktop and pnpm. OpenTofu is
#         optional (the script installs it via Homebrew if missing).
# ---------------------------------------------------------------------------
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$REPO/infra/docker/docker-compose.yml"
WEB_URL="http://localhost:3001"
cd "$REPO"

# Open new Terminal tabs/windows so logs stay visible (mirrors start.bat's
# "Orbit Expo" window). On macOS we use AppleScript via osascript.
open_new_terminal() {
  local title="$1"; local cmd="$2"
  osascript >/dev/null 2>&1 <<EOF
tell application "Terminal"
  activate
  do script "cd '$REPO' && printf '\\\\033]0;$title\\\\007' && $cmd"
end tell
EOF
}

printf '\n===================================================\n'
printf '   ORBIT  -  starting the full stack with Docker\n'
printf '===================================================\n'
printf '   repo: %s\n\n' "$REPO"

[[ -f "$COMPOSE" ]] || { echo "ERROR: missing $COMPOSE - run this from the Orbit folder."; exit 1; }

# ---- 1) Docker running? --------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "[1/4] Docker is not running - launching Docker Desktop..."
  open -a Docker 2>/dev/null || { echo "ERROR: install Docker Desktop: https://www.docker.com/"; exit 1; }
  for i in $(seq 1 60); do
    sleep 3
    docker info >/dev/null 2>&1 && break
    [[ $i -eq 60 ]] && { echo "ERROR: Docker did not come up. Open Docker Desktop manually, then re-run."; exit 1; }
  done
fi
echo "[1/4] Docker engine: OK"

# ---- 2) Build the backend + web images via docker-compose ----------------
echo "[2/4] Building backend + web images (compose build only)..."
docker compose -f "$COMPOSE" build || { echo "ERROR: docker compose build failed."; exit 1; }
# Release the canonical ports if a previous `compose up` is holding them
# (Tofu would otherwise hit "port already allocated"). Volumes are preserved.
docker compose -f "$COMPOSE" down 2>/dev/null || true

# ---- 2b) OpenTofu provisions the runtime ---------------------------------
# Prefer tofu on PATH; fall back to Homebrew install if missing.
TOFU="$(command -v tofu || true)"
if [[ -z "$TOFU" ]]; then
  if command -v brew >/dev/null 2>&1; then
    echo "[2b/4] OpenTofu not found - installing via Homebrew..."
    brew install opentofu || { echo "ERROR: brew install opentofu failed."; exit 1; }
    TOFU="$(command -v tofu)"
  else
    echo "ERROR: OpenTofu not found and Homebrew not installed."
    echo "       Install OpenTofu: https://opentofu.org/docs/intro/install/"
    exit 1
  fi
fi
echo "[2b/4] Provisioning stack via OpenTofu (tofu apply)..."
(
  cd "$REPO/tofu"
  [[ -d .terraform ]] || "$TOFU" init -input=false
  "$TOFU" apply -auto-approve -input=false
) || { echo "ERROR: tofu apply failed."; exit 1; }

# ---- 3) Wait for the dashboard, then open it ----------------------------
echo "[3/4] Waiting for the dashboard at $WEB_URL ..."
for i in $(seq 1 90); do
  curl -s -o /dev/null "$WEB_URL" && { open "$WEB_URL"; break; }
  sleep 2
  [[ $i -eq 90 ]] && { echo "       (taking a while - opening anyway.)"; open "$WEB_URL"; }
done

# ---- 3.5) Detect the laptop's REAL LAN IP --------------------------------
# Phones reach the laptop by IP. macOS has many adapters too (utun, bridge,
# vbox, etc.); prefer en0 (Wi-Fi on most Macs), then any en* with an inet,
# skipping link-local and Docker/VPN/utun ranges. The detected IP is BAKED
# into the Expo bundle so the phone hits the right backend.
LANIP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "$LANIP" ]]; then
  for ifc in en1 en2 en3 en4 en5; do
    LANIP="$(ipconfig getifaddr "$ifc" 2>/dev/null || true)"
    [[ -n "$LANIP" ]] && break
  done
fi
[[ -z "$LANIP" ]] && LANIP="localhost"
echo "[*] This Mac's Wi-Fi IP for the phone: $LANIP"

# macOS Application Firewall blocks inbound by default. The user has to allow
# node.exe / dockerd once via System Settings → Network → Firewall → Options
# ("Allow incoming connections" for `node` / `Docker`). pf rules require sudo
# so we don't add one automatically here. We DO print a hint if the firewall
# is enabled, since that's the #1 reason a phone fails to reach Metro.
if /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -qi enabled; then
  echo "[!] macOS Firewall is ON. If the phone can't reach Orbit, allow inbound"
  echo "    for 'node' under System Settings → Network → Firewall → Options."
fi

# ---- 4) Launch Expo with the LAN IP + backend URL baked in --------------
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[4/4] pnpm not found - skipping Expo. Install Node 20+ and pnpm:"
  echo "      brew install node && npm i -g pnpm"
else
  [[ -d "$REPO/node_modules" ]] || { echo "[4/4] First-run install..."; pnpm install; }
  echo "[4/4] Launching Expo in a new Terminal window (QR + link appear there)..."
  EXPO_CMD="REACT_NATIVE_PACKAGER_HOSTNAME=$LANIP \
EXPO_PUBLIC_MOBILE_API_BASE_URL=http://$LANIP:9090 \
EXPO_PUBLIC_MOBILE_WS_URL=ws://$LANIP:9090 \
EXPO_PUBLIC_WEB_DASHBOARD_URL=http://$LANIP:3001 \
pnpm --filter @orbit/mobile-field-sales dev -- --clear"
  open_new_terminal "Orbit Expo" "$EXPO_CMD"
fi

cat <<EOF

===================================================
   ORBIT is running!
===================================================
   This Mac IP : $LANIP   (phone + laptop must be on the SAME Wi-Fi)
   Dashboard   : $WEB_URL        (also http://$LANIP:3001 from the phone)
   Web login   : admin@fieldsales.local  /  admin123   (org: mithtech)
   Backend     : http://$LANIP:9090/health
   Mobile      : open the QR / exp://$LANIP:8088 link in the "Orbit Expo" window
   Phone login : rep1@acme-fieldsales.test  /  admin123   (org: mithtech)

   STOP everything later (containers paused, data KEPT):
     docker stop orbit-tf-demo-web orbit-tf-demo-backend orbit-tf-demo-redis orbit-tf-demo-postgres
   FULL TEARDOWN (also wipes the demo data volumes):
     cd "$REPO/tofu" && tofu destroy -auto-approve
===================================================
EOF
