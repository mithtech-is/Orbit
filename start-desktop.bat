@echo off
setlocal EnableExtensions
title Orbit Desktop
REM ---------------------------------------------------------------------------
REM  Orbit desktop - one-click launcher.
REM  Just double-click this file. Opens the Orbit desktop app pointing at the
REM  local backend (http://localhost:3001).
REM
REM  Requirements:
REM   - start.bat has been run at least once (Docker stack is up)
REM   - pnpm + Node 20+ are installed
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

REM ORBIT_WEB_URL skips the "Server URL" prompt and defaults straight to the
REM local dashboard. Remove this line later if you want the prompt back.
set "ORBIT_WEB_URL=http://localhost:3001"

REM ensure-electron auto-fetches the Electron binary if it's missing
REM (e.g. after a fresh clone or a hoisted reinstall), so this script
REM never fails with "Electron failed to install correctly".
call pnpm dev:desktop

REM Keep the window only if there was an error, so the user can read it.
if errorlevel 1 (
  echo.
  echo [!] Orbit Desktop exited with an error. Read the messages above.
  pause
)
endlocal
