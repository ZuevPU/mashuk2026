# Verify VK auth path with SKIP_VK_SIGN=false (no real VK client needed)
# Run from repo root: .\scripts\verify-vk-auth.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== VK Auth strict test ===" -ForegroundColor Cyan
Write-Host "Simulates production auth: signed Bearer token, no X-Test-Vk-Id" -ForegroundColor DarkGray

$env:SKIP_VK_SIGN = "false"
$env:VK_APP_SECRET = "test-vk-secret-for-ci"

Set-Location "$root\mashuk-backend"

# Load DATABASE_URL from .env if present (getMe hits DB)
$envFile = Join-Path (Get-Location) ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL=(.+)$') {
      $env:DATABASE_URL = $matches[1].Trim('"')
    }
  }
}

node --import tsx --test src/tests/vkAuthStrict.test.ts
if ($LASTEXITCODE -ne 0) { throw "VK auth strict tests failed" }

Write-Host "`nVK auth strict tests passed." -ForegroundColor Green
Write-Host "Next: run .\scripts\vk-tunnel.ps1 for real VK client test"
