@echo off
REM LAN config — phone and PC must be on the same Wi-Fi. 192.168.0.5 is this PC.
REM Cloudflare Tunnel — update this URL if the tunnel restarts.
set EXPO_PUBLIC_MOBILE_API_BASE_URL=https://bob-flying-second-gives.trycloudflare.com
set EXPO_PUBLIC_MOBILE_WS_URL=wss://bob-flying-second-gives.trycloudflare.com
set EXPO_PUBLIC_WEB_DASHBOARD_URL=http://192.168.0.5:3001
set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.0.5
cd /d "%~dp0"
pnpm --filter @orbit/mobile-field-sales dev -- --clear
pause
