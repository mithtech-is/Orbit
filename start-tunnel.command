#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Orbit Cloudflare quick tunnel (macOS).
#  Exposes the local backend (http://localhost:9090) at a public
#  `https://<random>.trycloudflare.com` URL so the installed Android APK
#  (Orbit-demo.apk) can reach it from any phone with internet, regardless
#  of which Wi-Fi the laptop is on.
#
#  Usage: double-click start-tunnel.command, OR run from Terminal. Requires
#  `cloudflared` on PATH. Install with `brew install cloudflared`.
# ---------------------------------------------------------------------------
set -u

if ! command -v cloudflared >/dev/null 2>&1; then
  cat <<'EOF'
ERROR: cloudflared not found.

Install it once:
  brew install cloudflared
EOF
  exit 1
fi

LOG="$(mktemp -t orbit-tunnel.XXXXXX.log)"
echo "Starting Cloudflare tunnel -> http://localhost:9090 ..."
echo "Log: $LOG"
cloudflared tunnel --url http://localhost:9090 > "$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; echo; echo "Tunnel stopped."; exit 0' INT TERM

# Wait for the trycloudflare URL to appear in the log
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -n1)"
  [[ -n "$URL" ]] && break
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "Did not get a tunnel URL within 30s. Tail of log:"
  tail -n 15 "$LOG"
  kill $PID 2>/dev/null
  exit 1
fi

cat <<EOF

===========================================================
   ORBIT public backend URL  (paste into the Orbit app):
   $URL
===========================================================

Open the Orbit app -> Login screen -> "Advanced - server URL"
-> paste $URL there -> Sign in.

The tunnel runs as long as this window is open.
Press Ctrl-C to stop it (the public URL stops working then).
EOF

# Block until killed
wait $PID
