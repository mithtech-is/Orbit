@echo off
setlocal EnableExtensions
title Orbit - Start
color 0B

REM ---------------------------------------------------------------------------
REM  Orbit one-click launcher (Windows).
REM  Portable: this file lives at the repo root, so %~dp0 is wherever you cloned
REM  Orbit - no hard-coded paths. Just double-click it.
REM  Requires: Docker Desktop installed. (Get it: https://www.docker.com/)
REM ---------------------------------------------------------------------------

set "REPO=%~dp0"
set "REPODIR=%REPO:~0,-1%"
set "COMPOSE=%REPO%infra\docker\docker-compose.yml"
set "WEB_URL=http://localhost:3001"
set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

echo(
echo ===================================================
echo    ORBIT  -  starting the full stack with Docker
echo ===================================================
echo    repo: %REPO%
echo(

if not exist "%COMPOSE%" (
  echo ERROR: could not find:
  echo   %COMPOSE%
  echo Run this file from INSIDE the cloned "Orbit" folder.
  pause
  exit /b 1
)

REM ---- 1) Make sure Docker is running -------------------------------------
docker info >nul 2>&1
if %errorlevel%==0 goto dockerready
echo [1/3] Docker is not running - launching Docker Desktop...
if exist "%DOCKER_EXE%" start "" "%DOCKER_EXE%"
echo       Waiting for the Docker engine (a cold start can take a minute)...
set /a t=0
:waitdocker
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if %errorlevel%==0 goto dockerready
set /a t+=1
if %t% lss 60 goto waitdocker
echo ERROR: Docker did not come up. Open Docker Desktop manually, then re-run.
pause
exit /b 1
:dockerready
echo [1/3] Docker engine: OK
echo(

REM ---- 2) Build images via docker-compose, then provision via OpenTofu -----
REM  Orbit's runtime is now managed by OpenTofu (tofu/). docker-compose is kept
REM  ONLY for building the orbit-backend:local and orbit-web:local images that
REM  the Tofu module reuses (a real cloud version would build/push to a registry).
REM
REM  Flow:
REM    a) `docker compose build` -> produces orbit-backend:local + orbit-web:local
REM    b) `tofu apply`           -> brings up postgres/redis/backend/web on the
REM                                 canonical ports (3001/9090/15432/6380) using
REM                                 the per-client module. Idempotent: re-running
REM                                 is a no-op if nothing changed.
echo [2/3] Building backend + web images (compose build only)...
docker compose -f "%COMPOSE%" build
if not %errorlevel%==0 (
  echo ERROR: "docker compose build" failed - see the messages above.
  pause
  exit /b 1
)
REM  If compose containers are running from a previous direct `compose up`, they
REM  hold the canonical ports (3001/9090/15432/6380) - which would make
REM  `tofu apply` fail with a "port already allocated" error. `compose down`
REM  releases the ports but PRESERVES the data volume (orbit-postgres), so this
REM  is safely re-runnable.
docker compose -f "%COMPOSE%" down 2>nul
set "TOFU=%LOCALAPPDATA%\OpenTofu\tofu.exe"
if not exist "%TOFU%" (
  where tofu >nul 2>&1
  if errorlevel 1 (
    echo ERROR: OpenTofu not found. Expected at %TOFU% or on PATH.
    echo Install: https://opentofu.org/docs/intro/install/  ^(or re-run the installer^)
    pause
    exit /b 1
  )
  set "TOFU=tofu"
)
echo [2b/3] Provisioning stack via OpenTofu...
pushd "%REPO%tofu" >nul
if not exist ".terraform" "%TOFU%" init -input=false
"%TOFU%" apply -auto-approve -input=false
if not %errorlevel%==0 (
  echo ERROR: "tofu apply" failed - see messages above.
  popd >nul
  pause
  exit /b 1
)
popd >nul
echo(

REM ---- 3) Wait for the dashboard, then open it ---------------------------
echo [3/4] Waiting for the dashboard at %WEB_URL% ...
set /a w=0
:waitweb
curl -s -o nul "%WEB_URL%" 2>nul
if %errorlevel%==0 goto webready
timeout /t 2 /nobreak >nul
set /a w+=1
if %w% lss 90 goto waitweb
echo       (taking a while to compile - opening anyway.)
:webready
start "" "%WEB_URL%"

REM ---- 3.5) Figure out THIS PC's Wi-Fi LAN IP (changes on every network) ------
REM  The phone reaches the laptop by IP, not "localhost". This machine has many
REM  Hyper-V/WSL/Docker virtual adapters, so we pick the real physical adapter's
REM  IPv4 - preferring Wi-Fi - and skip every virtual one. That is the address the
REM  phone shares on the same Wi-Fi. (Find-NetRoute was unreliable here - it could
REM  return a stale route IP the PC no longer owns.)
set "LANIP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Default Switch|Hyper-V|VirtualBox|VMware|Docker' } | Sort-Object @{ Expression = { if ($_.InterfaceAlias -match 'Wi-Fi|Wireless|WLAN') { 0 } else { 1 } } } | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LANIP=%%I"
if not defined LANIP set "LANIP=localhost"
echo [*] This PC's Wi-Fi IP for the phone: %LANIP%
REM  Force Expo/Metro to advertise THIS IP in the QR/link (otherwise it may pick a
REM  Docker or virtual adapter the phone cannot reach).
set "REACT_NATIVE_PACKAGER_HOSTNAME=%LANIP%"
REM  BAKE the backend/WS/dashboard URLs (this PC's IP) straight into the app bundle.
REM  EXPO_PUBLIC_* are inlined at bundle build time, so the app talks to the right
REM  backend regardless of any stale Expo Go cache or scriptURL quirks. start.bat
REM  recomputes %LANIP% every run, so this stays correct on any network/hotspot.
set "EXPO_PUBLIC_MOBILE_API_BASE_URL=http://%LANIP%:9090"
set "EXPO_PUBLIC_MOBILE_WS_URL=ws://%LANIP%:9090"
set "EXPO_PUBLIC_WEB_DASHBOARD_URL=http://%LANIP%:3001"

REM ---- 3.6) Firewall: let the phone reach Metro(8088) + backend(9090) + web(3001)
REM  A client's Wi-Fi is usually classified "Public", where Windows blocks inbound
REM  connections by default - so the phone can't reach the laptop until we allow it.
REM  profile=any covers Public+Private. One-time; persists after the first Yes.
netsh advfirewall firewall show rule name="Orbit (phone access)" >nul 2>&1
if %errorlevel%==0 goto fwdone
echo [*] Adding a one-time Windows Firewall rule so your phone can reach Orbit...
echo     ^>^>^> a Windows admin prompt may pop up - click YES ^<^<^<
powershell -NoProfile -Command "Start-Process netsh -Verb RunAs -ArgumentList 'advfirewall firewall add rule name=\"Orbit (phone access)\" dir=in action=allow protocol=TCP localport=8088,9090,3001 profile=any'" 2>nul
:fwdone

REM ---- 4) Mobile app (Expo) in its own window - the QR code + link show there
echo(
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [4/4] Node/pnpm not found - skipping the mobile app ^(Expo^).
  echo       To run it later: install Node 20+ and pnpm, then:
  echo         pnpm install   and   pnpm --filter @orbit/mobile-field-sales dev
  goto mobiledone
)
if not exist "%REPO%node_modules" (
  echo [4/4] Installing mobile dependencies ^(first run only - may take a few minutes^)...
  call pnpm install
)
echo [4/4] Launching the mobile app ^(Expo^) in a new window...
echo       ^>^>^>  The QR code and the  exp://%LANIP%:8088  link appear in the "Orbit Expo" window  ^<^<^<
start "Orbit Expo" /d "%REPODIR%" cmd /k "set REACT_NATIVE_PACKAGER_HOSTNAME=%LANIP%&& set EXPO_PUBLIC_MOBILE_API_BASE_URL=http://%LANIP%:9090&& set EXPO_PUBLIC_MOBILE_WS_URL=ws://%LANIP%:9090&& set EXPO_PUBLIC_WEB_DASHBOARD_URL=http://%LANIP%:3001&& pnpm --filter @orbit/mobile-field-sales dev -- --clear"
:mobiledone

echo(
echo ===================================================
echo    ORBIT is running!
echo ===================================================
echo      This PC IP : %LANIP%   (phone + laptop must be on the SAME Wi-Fi)
echo      Dashboard  : %WEB_URL%      (also http://%LANIP%:3001 from the phone)
echo      Web login  : admin@fieldsales.local  /  admin123   (org: mithtech)
echo      Backend    : http://%LANIP%:9090/health
echo      Mobile     : open the QR / exp://%LANIP%:8088 link in the "Orbit Expo" window
echo      Phone login: rep1@acme-fieldsales.test  /  admin123   (org: mithtech)
echo(
echo    To STOP everything later (containers paused, your DATA is KEPT):
echo      docker stop orbit-tf-demo-web orbit-tf-demo-backend orbit-tf-demo-redis orbit-tf-demo-postgres
echo    To FULL TEARDOWN (also wipes volumes / all demo data):
echo      cd /d "%REPO%tofu" ^&^& "%TOFU%" destroy -auto-approve
echo ===================================================
echo(
echo This window can be closed - the apps keep running in Docker.
pause
endlocal
