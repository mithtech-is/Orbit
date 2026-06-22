@echo off
setlocal EnableExtensions
title Orbit - Start Android Native (No Expo CLI)
color 0A

set "REPO=%~dp0"
set "REPODIR=%REPO:~0,-1%"

echo ===================================================
echo    ORBIT - Run Mobile App on Real Android Device
echo ===================================================
echo    This script runs Orbit on a connected Android phone 
echo    WITHOUT using Expo CLI or Expo Go.
echo(

REM ---- 1) Find adb.exe -------------------------------------
set "ADB=adb"
where adb >nul 2>&1
if %errorlevel%==0 goto adbready

set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if exist "%ADB%" goto adbready

echo ERROR: adb.exe not found on PATH or in default Android SDK location:
echo   %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
echo Please install Android Studio and SDK platform-tools.
pause
exit /b 1

:adbready
echo [1/4] Found ADB at: "%ADB%"
echo(

REM ---- 2) Check for connected devices ---------------------
echo [2/4] Checking for connected Android devices...
"%ADB%" devices
echo(
echo Please make sure your physical Android device is:
echo   1. Connected via USB.
echo   2. Has USB Debugging enabled in Developer Options.
echo   3. Authorized (check for any popup on the phone screen).
echo(
choice /M "Is your Android device connected and authorized?"
if errorlevel 2 (
  echo Please connect your device and try again.
  pause
  exit /b 1
)

REM ---- 3) Set up ADB port forwarding ----------------------
echo(
echo [3/4] Configuring port forwarding (adb reverse)...
"%ADB%" reverse tcp:8088 tcp:8088
"%ADB%" reverse tcp:9090 tcp:9090
"%ADB%" reverse tcp:3001 tcp:3001
echo Port forwarding set up:
echo   - Phone localhost:8088 -^> PC Metro Server (8088)
echo   - Phone localhost:9090 -^> PC Backend API (9090)
echo   - Phone localhost:3001 -^> PC Web Dashboard (3001)
echo(

REM ---- 4) Start Metro and Install/Run App -----------------
echo [4/4] Starting the Metro Packager in a new window...
set "MOBILE_API_BASE_URL=http://localhost:9090"
set "MOBILE_WS_URL=ws://localhost:9090"
set "EXPO_PUBLIC_MOBILE_API_BASE_URL=http://localhost:9090"
set "EXPO_PUBLIC_MOBILE_WS_URL=ws://localhost:9090"

start "Orbit Metro Packager" /d "%REPODIR%" cmd /k "set MOBILE_API_BASE_URL=http://localhost:9090&& set MOBILE_WS_URL=ws://localhost:9090&& set EXPO_PUBLIC_MOBILE_API_BASE_URL=http://localhost:9090&& set EXPO_PUBLIC_MOBILE_WS_URL=ws://localhost:9090&& pnpm --filter @orbit/mobile-field-sales start"

echo(
echo Compiling the Android application and installing it on your device...
echo This might take a few minutes for the first build.
echo(
call pnpm --filter @orbit/mobile-field-sales android

echo(
echo ===================================================
echo    Android Native Launch Completed!
echo ===================================================
echo    If the app doesn't open automatically, look for "Orbit"
echo    on your phone and open it.
echo    Make sure your local backend is running (e.g. docker/start.bat)
echo ===================================================
echo(
pause
endlocal
