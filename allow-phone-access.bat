@echo off
REM ---------------------------------------------------------------------------
REM  Orbit - allow phone access through the Windows Firewall (run ONCE).
REM  Opens inbound TCP 8088 (Expo/Metro), 9090 (backend API), 3001 (dashboard)
REM  on ALL network profiles, so your phone can reach the laptop on ANY Wi-Fi -
REM  including a client's network, which Windows treats as "Public" and blocks
REM  by default. The rule persists; you only need to run this once per machine.
REM  Just double-click it and click YES on the admin prompt.
REM ---------------------------------------------------------------------------
net session >nul 2>&1
if %errorlevel%==0 goto admin
echo Requesting administrator rights (click YES on the prompt)...
powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
exit /b

:admin
echo Adding firewall rule "Orbit (phone access)" for ports 8088, 9090, 3001 ...
netsh advfirewall firewall delete rule name="Orbit (phone access)" >nul 2>&1
netsh advfirewall firewall add rule name="Orbit (phone access)" dir=in action=allow protocol=TCP localport=8088,9090,3001 profile=any
echo(
echo Done. Your phone can now reach Orbit on any Wi-Fi (same network as the PC).
echo(
pause
