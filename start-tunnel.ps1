$logFile = "$env:TEMP\cloudflared-tunnel.log"
$exe = "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"

# Kill any existing cloudflared
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Start tunnel using WMI (fully detached, survives shell exit)
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "`"$exe`" tunnel --url http://localhost:9090"
}
Write-Host "Process started with PID: $($result.ProcessId)"

# Wait for URL to appear
Start-Sleep -Seconds 15
$url = Select-String -Path "$env:TEMP\cflog.txt" -Pattern "https://[a-z,-]+\.trycloudflare\.com" 2>$null
if (-not $url) {
    # Try reading from stdout redirected log
    $url = Select-String -Path "$env:TEMP\cloudflared-tunnel.log" -Pattern "https://[a-z,-]+\.trycloudflare\.com" 2>$null
}
if ($url) {
    Write-Host "Tunnel URL: $($url.Matches.Value)"
} else {
    Write-Host "Could not find URL in logs yet. Check: $logFile"
}
