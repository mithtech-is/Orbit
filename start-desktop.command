#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Orbit desktop - one-click launcher (macOS).
#  Double-click this file in Finder, OR run `./start-desktop.command`.
#  Opens the Orbit desktop app pointing at the local backend (:3001).
#
#  Requirements:
#   - start.command has been run at least once (Docker stack is up)
#   - pnpm + Node 20+ are installed
# ---------------------------------------------------------------------------
set -u

# Move to the repo root regardless of where the user double-clicked from.
cd "$(dirname "${BASH_SOURCE[0]}")"

# ORBIT_WEB_URL skips the "Server URL" prompt and defaults straight to the
# local dashboard. Remove this line later if you want the prompt back.
export ORBIT_WEB_URL="http://localhost:3001"

# ensure-electron auto-fetches the Electron binary if it's missing, so this
# script never fails with "Electron failed to install correctly".
if ! pnpm dev:desktop; then
  echo
  echo "[!] Orbit Desktop exited with an error. Read the messages above."
  echo "    Press Enter to close this window."
  read -r _
fi
