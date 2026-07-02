# Timeweb deploy helper - validates artifacts and prints checklist
# Run from repo root: .\scripts\deploy-timeweb.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "=== Timeweb deploy checklist ===" -ForegroundColor Cyan

$checks = @(
  @{ Path = "docker-compose.prod.yml"; Label = "Docker Compose prod" },
  @{ Path = "mashuk-backend\.env.production.example"; Label = "Backend env template" },
  @{ Path = "mashuk-frontend\.env.production.example"; Label = "Frontend env template" },
  @{ Path = "mashuk-admin\.env.production.example"; Label = "Admin env template" },
  @{ Path = "mashuk-backend\dist\index.js"; Label = "Backend build (run pre-deploy first)" },
  @{ Path = "mashuk-frontend\dist\index.html"; Label = "Frontend dist" },
  @{ Path = "mashuk-admin\dist\index.html"; Label = "Admin dist" }
)

$missing = @()
foreach ($c in $checks) {
  if (Test-Path $c.Path) {
    Write-Host "  [ok] $($c.Label)" -ForegroundColor Green
  } else {
    Write-Host "  [!!] $($c.Label) - missing: $($c.Path)" -ForegroundColor Red
    $missing += $c.Path
  }
}

if ($missing.Count -gt 0) {
  Write-Host "`nRun .\scripts\pre-deploy.ps1 first to build artifacts." -ForegroundColor Yellow
  exit 1
}

Write-Host "`n--- Deploy steps (see DEPLOY.md) ---" -ForegroundColor Yellow
Write-Host "1. Copy .env.production.example -> .env.production on server"
Write-Host "2. Fill: DATABASE_URL, ADMIN_SECRET, CORS_ORIGIN, PUBLIC_URL, VK_APP_SECRET, VK_SERVICE_TOKEN"
Write-Host "3. docker compose -f docker-compose.prod.yml up -d --build"
Write-Host "4. Upload mashuk-frontend/dist and mashuk-admin/dist to static hosting"
Write-Host "5. Verify production: .\scripts\verify-timeweb.ps1"
Write-Host "6. VK app URL: https://zuevpu-mashuk2026-07d9.twc1.net"
Write-Host "`nArtifacts ready for Timeweb upload." -ForegroundColor Green
