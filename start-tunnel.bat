@echo off
echo Starting Cloudflare Tunnel to localhost:9090 ...
echo The URL will appear below (it takes ~10 seconds):
start /b "" "%LOCALAPPDATA%\cloudflared\cloudflared.exe" tunnel --url http://localhost:9090 > "%TEMP%\cflog.txt" 2>&1
timeout /t 15 /nobreak >nul
echo.
echo Tunnel URL:
findstr "https://" "%TEMP%\cflog.txt" | findstr "trycloudflare"
echo.
echo Log file: %%TEMP%%\cflog.txt
echo Tunnel is running in background. Close this window to stop it.
pause
