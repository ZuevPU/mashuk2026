# Seed production database if empty (directions, tasks, demo data)
# Usage: $env:DATABASE_URL='postgresql://...'; .\scripts\seed-prod.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $env:DATABASE_URL) {
  Write-Host "Set DATABASE_URL to the production PostgreSQL connection string." -ForegroundColor Red
  Write-Host "Example: `$env:DATABASE_URL='postgresql://gen_user:...@85.198.80.180:5432/default_db'"
  exit 1
}

Write-Host "=== Seed production database ===" -ForegroundColor Cyan
Write-Host "Target: $($env:DATABASE_URL -replace '://[^@]+@', '://***@')"

Set-Location "$root\mashuk-backend"
npm run db:seed
if ($LASTEXITCODE -ne 0) { throw "Seed failed" }

Write-Host "`nSeed complete. Verify via admin panel or GET /api/directions." -ForegroundColor Green
