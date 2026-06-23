@echo off
setlocal EnableExtensions
title Orbit Tunnel - orbit.mith.tech
color 0B
REM ---------------------------------------------------------------------------
REM  Orbit named Cloudflare tunnel (Windows).
REM  Exposes the local backend (http://localhost:9090) at the PERMANENT URL
REM    https://orbit.mith.tech
REM  The URL never changes, so it's baked into the Orbit APK once. The phone
REM  reaches it from ANY network (mobile data, any Wi-Fi) - no hotspot, no
REM  IP juggling, no pasting.
REM
REM  Reads the tunnel config from %USERPROFILE%\.cloudflared\config.yml
REM  (created during setup). Requires cloudflared + a one-time
REM  `cloudflared tunnel login` against the mith.tech zone.
REM ---------------------------------------------------------------------------

set "CFD=%LOCALAPPDATA%\cloudflared\cloudflared.exe"

if not exist "%CFD%" (
  echo ERROR: cloudflared not found at %CFD%
  echo Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

if not exist "%USERPROFILE%\.cloudflared\config.yml" (
  echo ERROR: tunnel config not found at %USERPROFILE%\.cloudflared\config.yml
  echo Run the one-time setup first ^(see infra\cloudflared\README.md^).
  pause
  exit /b 1
)

echo(
echo ===================================================
echo   ORBIT tunnel - https://orbit.mith.tech
echo ===================================================
echo   Forwarding the public URL to your local backend on :9090.
echo   Keep this window OPEN during demos. Closing it takes the URL offline.
echo(
echo   Make sure the stack is running first (start.bat).
echo ===================================================
echo(

"%CFD%" tunnel run orbit

echo(
echo Tunnel stopped. The URL https://orbit.mith.tech is now offline until
echo you run this again.
pause
endlocal
