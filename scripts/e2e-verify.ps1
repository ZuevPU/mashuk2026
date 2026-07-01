# E2E API verification (participant + admin flow)
# Run from repo root: .\scripts\e2e-verify.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== E2E API verification ===" -ForegroundColor Cyan
Set-Location "$root\mashuk-backend"

$envFile = Join-Path (Get-Location) ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL=(.+)$') {
      $env:DATABASE_URL = $matches[1].Trim('"')
    }
    if ($_ -match '^\s*ADMIN_SECRET=(.+)$') {
      $env:ADMIN_SECRET = $matches[1].Trim('"')
    }
  }
}

if (-not $env:DATABASE_URL) {
  Write-Host "DATABASE_URL not set - E2E tests require PostgreSQL." -ForegroundColor Red
  exit 1
}

npm run test:e2e
if ($LASTEXITCODE -ne 0) { throw "E2E tests failed" }

Write-Host "`nE2E API flow passed (participant + admin CSV/analytics/push)." -ForegroundColor Green
Write-Host "Manual UI check: QA_CHECKLIST.md section E2E participant"
