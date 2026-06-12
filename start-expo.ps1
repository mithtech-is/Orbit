$lan = "192.168.0.5"
$env:EXPO_PUBLIC_MOBILE_API_BASE_URL = "http://${lan}:9090"
$env:EXPO_PUBLIC_MOBILE_WS_URL = "ws://${lan}:9090"
$env:EXPO_PUBLIC_WEB_DASHBOARD_URL = "http://${lan}:3001"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $lan
Set-Location "$PSScriptRoot"
pnpm --filter @orbit/mobile-field-sales dev -- --clear
