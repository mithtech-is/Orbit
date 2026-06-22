@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Orbit - Cloudflare Tunnel
color 0B
REM ---------------------------------------------------------------------------
REM  Orbit Cloudflare quick tunnel (Windows).
REM  Exposes the local backend (http://localhost:9090) at a public
REM  https://<random>.trycloudflare.com URL so the installed Android APK
REM  (Orbit-demo.apk) can reach it from any phone with internet, regardless
REM  of which Wi-Fi the laptop is on.
REM
REM  Requires cloudflared at %LOCALAPPDATA%\cloudflared\cloudflared.exe.
REM  Install: https://developers.cloudflare.com/cloudflare-one/connections/
REM           connect-networks/downloads/
REM ---------------------------------------------------------------------------

set "CFD=%LOCALAPPDATA%\cloudflared\cloudflared.exe"
set "LOG=%TEMP%\orbit-tunnel.log"

if not exist "%CFD%" (
  echo ERROR: cloudflared not found at %CFD%
  echo Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

echo Starting Cloudflare tunnel -^> http://localhost:9090 ...
echo Log: %LOG%
echo.
del "%LOG%" 2>nul
start "Orbit Cloudflare daemon" /MIN cmd /c "%CFD% tunnel --url http://localhost:9090 > %LOG% 2>&1"

REM Poll the log for the public URL (cloudflared usually prints it within 5-10s)
set "URL="
for /l %%i in (1,1,30) do (
  if not defined URL (
    timeout /t 1 /nobreak >nul
    for /f "usebackq tokens=*" %%U in (`powershell -NoProfile -Command "(Select-String -Path '%LOG%' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue | Select-Object -First 1).Matches.Value"`) do set "URL=%%U"
  )
)

echo.
echo ===========================================================
if defined URL (
  echo    ORBIT public backend URL ^(paste into the Orbit app^):
  echo    !URL!
) else (
  echo    No tunnel URL appeared within 30 seconds.
  echo    Tail of log:
  powershell -NoProfile -Command "Get-Content -Tail 15 '%LOG%'"
)
echo ===========================================================
echo.
echo Open the Orbit app -^> Login screen -^> "Advanced - server URL"
echo -^> paste the URL above -^> Sign in.
echo.
echo The tunnel runs as long as the "Orbit Cloudflare daemon" window stays open.
echo Closing that window stops the tunnel and the URL stops working.
echo.
pause
endlocal
