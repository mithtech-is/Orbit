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

REM ---- 2) Build + start backend + web + postgres + redis ------------------
echo [2/3] Building and starting containers...
echo       (the FIRST run downloads images and builds - please be patient)
docker compose -f "%COMPOSE%" up -d --build
if not %errorlevel%==0 (
  echo ERROR: "docker compose up" failed - see the messages above.
  pause
  exit /b 1
)
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
echo       ^>^>^>  The QR code and the  exp://...:8088  link appear in the "Orbit Expo" window  ^<^<^<
start "Orbit Expo" /d "%REPODIR%" cmd /k "pnpm --filter @orbit/mobile-field-sales dev"
:mobiledone

echo(
echo ===================================================
echo    ORBIT is running!
echo ===================================================
echo      Dashboard : %WEB_URL%
echo      Login     : admin@fieldsales.local  /  admin123   (org: mithtech)
echo      Backend   : http://localhost:9090/health
echo      Mobile    : Expo QR / link is in the "Orbit Expo" window (Metro on :8088)
echo(
echo    To STOP everything later (your data is KEPT), run this in a terminal:
echo      docker compose -f "%COMPOSE%" down
echo ===================================================
echo(
echo This window can be closed - the apps keep running in Docker.
pause
endlocal
