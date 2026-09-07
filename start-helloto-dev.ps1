$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

function Get-LanIp {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.PrefixOrigin -ne "WellKnown"
    } |
    Select-Object -ExpandProperty IPAddress

  return ($ips | Select-Object -First 1)
}

$lanIp = Get-LanIp

Write-Host ""
Write-Host "Starting HelloToo in live dev mode..." -ForegroundColor Cyan
Write-Host "Frontend changes will hot reload automatically." -ForegroundColor Green
Write-Host "Backend starts locally on port 8787." -ForegroundColor Green
Write-Host ""

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$backendDir'; npm run dev"
) | Out-Null

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$frontendDir'; npm run dev -- --host 0.0.0.0"
) | Out-Null

Write-Host "HelloToo Dev URLs" -ForegroundColor Cyan
Write-Host "Frontend local:   http://localhost:5173"
if ($lanIp) {
  Write-Host "Frontend network: http://$lanIp`:5173"
}
Write-Host "Backend API:      http://localhost:8787"
if ($lanIp) {
  Write-Host "Backend network:  http://$lanIp`:8787"
}
Write-Host ""
Write-Host "Keep both opened PowerShell windows running while you develop." -ForegroundColor Yellow
Write-Host "Restart the backend window after backend code changes." -ForegroundColor Yellow
