$ErrorActionPreference = "Stop"

Write-Host "Adding Windows Firewall rules for HelloTo..." -ForegroundColor Cyan

$rules = @(
  @{ Name = "HelloTo Frontend 5173"; Port = 5173 },
  @{ Name = "HelloTo Backend 8787"; Port = 8787 }
)

foreach ($rule in $rules) {
  $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if (-not $existing) {
    New-NetFirewallRule `
      -DisplayName $rule.Name `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort $rule.Port `
      -Profile Private | Out-Null
    Write-Host "Added rule: $($rule.Name)" -ForegroundColor Green
  } else {
    Write-Host "Rule already exists: $($rule.Name)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Network ports are ready for devices on your private Wi-Fi." -ForegroundColor Green
