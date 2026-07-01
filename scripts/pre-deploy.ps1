# Pre-deploy verification for Mashuk 2026
# Run from repo root: .\scripts\pre-deploy.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "=== Mashuk pre-deploy checks ===" -ForegroundColor Cyan

Write-Host "`n[1/4] Backend tests..." -ForegroundColor Yellow
Set-Location "$root\mashuk-backend"
npm test
if ($LASTEXITCODE -ne 0) { throw "Backend tests failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }

Write-Host "`n[2/4] Frontend build..." -ForegroundColor Yellow
Set-Location "$root\mashuk-frontend"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

Write-Host "`n[3/4] Admin build..." -ForegroundColor Yellow
Set-Location "$root\mashuk-admin"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Admin build failed" }

Write-Host "`n[4/4] Docker backend build (optional)..." -ForegroundColor Yellow
Set-Location "$root\mashuk-backend"
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker build -t mashuk-backend:local .
  if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }
} else {
  Write-Host "Docker not found - skip (run on Timeweb or install Docker Desktop)" -ForegroundColor DarkYellow
}

Set-Location $root
Write-Host "`n=== All pre-deploy checks passed ===" -ForegroundColor Green
Write-Host "Next: copy .env.production.example files, deploy per DEPLOY.md, run VK tunnel per scripts/vk-tunnel.ps1"
