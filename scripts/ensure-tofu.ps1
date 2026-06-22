# Defensive guard for start.bat's `tofu apply` step.
#
# OpenTofu lives at %LOCALAPPDATA%\OpenTofu\tofu.exe. If it isn't there,
# or if start.bat is somehow running in an elevated context where
# %LOCALAPPDATA% points elsewhere, this script downloads the OpenTofu
# Windows binary once (~85MB), extracts it, and writes the resolved path
# to stdout so the caller can capture it. No-op if already installed.
#
# Usage from start.bat:
#   for /f "usebackq tokens=*" %%T in (`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-tofu.ps1`) do set "TOFU=%%T"

$ErrorActionPreference = 'Stop'

# Hard-coded path so we don't depend on %LOCALAPPDATA% being set correctly.
$installDir = Join-Path $env:USERPROFILE 'AppData\Local\OpenTofu'
$tofuExe = Join-Path $installDir 'tofu.exe'

if (Test-Path $tofuExe) {
  # Echo to stdout so the bat file can capture it via for /f.
  Write-Output $tofuExe
  exit 0
}

# Fall back to PATH-discovered tofu if any
$pathHit = Get-Command tofu -ErrorAction SilentlyContinue
if ($pathHit) {
  Write-Output $pathHit.Source
  exit 0
}

# Not installed. Download a stable OpenTofu release. v1.8.6 matches what
# this repo was built against; bump in lockstep with tofu/ config changes.
$version = '1.8.6'
$url = "https://github.com/opentofu/opentofu/releases/download/v$version/tofu_${version}_windows_amd64.zip"
$zip = Join-Path $env:TEMP "tofu_$version.zip"

Write-Host "ensure-tofu: OpenTofu not found, downloading v$version (~85 MB)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force $installDir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $installDir -Force
Remove-Item $zip -ErrorAction SilentlyContinue

if (-not (Test-Path $tofuExe)) {
  Write-Error "ensure-tofu: download finished but $tofuExe is missing"
  exit 1
}

# Add to user PATH so future shells find it without needing this script.
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$installDir*") {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$installDir", 'User')
}

Write-Host "ensure-tofu: installed OK ($tofuExe)" -ForegroundColor Green
Write-Output $tofuExe
