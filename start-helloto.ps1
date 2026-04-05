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

function Test-Url($url) {
  try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

function Wait-ForUrl($url, $label, $seconds = 45) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Url $url) {
      Write-Host "$label ready: $url" -ForegroundColor Green
      return $true
    }
    Start-Sleep -Milliseconds 750
  }
  Write-Host "$label not ready yet: $url" -ForegroundColor Yellow
  return $false
}

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location $frontendDir
npm run build
Pop-Location

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$backendDir'; npm run start"
) | Out-Null

Write-Host ""
Write-Host "Starting HelloTo server..." -ForegroundColor Cyan
Write-Host "Waiting for backend..." -ForegroundColor Cyan
Write-Host ""

$backendReady = Wait-ForUrl "http://127.0.0.1:8787/health" "Backend"
$lanIp = Get-LanIp

Write-Host ""
Write-Host "HelloTo URLs" -ForegroundColor Cyan
Write-Host "Local app:    http://localhost:8787"
Write-Host "Local health: http://localhost:8787/health"
if ($lanIp) {
  Write-Host "Network app:  http://$lanIp`:8787"
  Write-Host "Network API:  http://$lanIp`:8787/health"
}
Write-Host ""

if ($backendReady) {
  Write-Host "HelloTo is up. Keep the opened backend PowerShell window running." -ForegroundColor Green
} else {
  Write-Host "The server did not fully start. Check the opened backend PowerShell window for errors." -ForegroundColor Yellow
}
