# Verify Mashuk 2026 Timeweb production deployment
# Run from repo root: .\scripts\verify-timeweb.ps1

$ErrorActionPreference = "Continue"

$BackendUrl = "https://zuevpu-mashuk2026-ae82.twc1.net"
$FrontendUrl = "https://zuevpu-mashuk2026-dc9b.twc1.net"
$AdminUrl = "https://zuevpu-mashuk2026-9a9a.twc1.net"
$ExpectedApi = "$BackendUrl/api"
$AdminLogin = "zuev"
$AdminPassword = "ZuevPu26"

function Test-Http {
  param(
    [string]$Label,
    [string]$Url,
    [int]$TimeoutSec = 15,
    [hashtable]$Headers = @{}
  )
  Write-Host "`n[$Label] $Url" -ForegroundColor Yellow
  try {
    $requestParams = @{
      Uri = $Url
      TimeoutSec = $TimeoutSec
      UseBasicParsing = $true
    }
    if ($Headers.Count -gt 0) { $requestParams.Headers = $Headers }
    $res = Invoke-WebRequest @requestParams
    Write-Host "  OK $($res.StatusCode) ($($res.RawContentLength) bytes)" -ForegroundColor Green
    if ($res.Content.Length -le 200) { Write-Host "  $($res.Content)" }
    return $true
  } catch {
    Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

Write-Host "=== Timeweb production verification ===" -ForegroundColor Cyan

$results = @{}

$results["backend-health"] = Test-Http "Backend /health" "$BackendUrl/health"
$results["backend-ready"] = Test-Http "Backend /health/ready" "$BackendUrl/health/ready"
$results["frontend"] = Test-Http "Frontend" "$FrontendUrl/"
$results["admin"] = Test-Http "Admin" "$AdminUrl/"

Write-Host "`n[Frontend bundle] VITE_API_URL" -ForegroundColor Yellow
try {
  $html = (Invoke-WebRequest -Uri "$FrontendUrl/" -UseBasicParsing -TimeoutSec 10).Content
  if ($html -match 'assets/(index-[^"]+\.js)') {
    $jsUrl = "$FrontendUrl/assets/$($Matches[1])"
    $js = (Invoke-WebRequest -Uri $jsUrl -UseBasicParsing -TimeoutSec 15).Content
    if ($js -match 'https://zuevpu-mashuk2026-ae82\.twc1\.net/api') {
      Write-Host "  OK baked API URL is https://...ae82.../api" -ForegroundColor Green
      $results["frontend-api-url"] = $true
    } else {
      Write-Host "  FAIL expected API URL not found in bundle" -ForegroundColor Red
      $results["frontend-api-url"] = $false
    }
  }
} catch {
  Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
  $results["frontend-api-url"] = $false
}

Write-Host "`n[Admin bundle] VITE_API_URL" -ForegroundColor Yellow
try {
  $html = (Invoke-WebRequest -Uri "$AdminUrl/" -UseBasicParsing -TimeoutSec 10).Content
  if ($html -match 'assets/(index-[^"]+\.js)') {
    $jsUrl = "$AdminUrl/assets/$($Matches[1])"
    $js = (Invoke-WebRequest -Uri $jsUrl -UseBasicParsing -TimeoutSec 15).Content
    if ($js -match 'https://zuevpu-mashuk2026-ae82\.twc1\.net/api') {
      Write-Host "  OK baked API URL is https://...ae82.../api" -ForegroundColor Green
      $results["admin-api-url"] = $true
    } else {
      Write-Host "  FAIL expected API URL not found in bundle" -ForegroundColor Red
      $results["admin-api-url"] = $false
    }
  }
} catch {
  Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
  $results["admin-api-url"] = $false
}

if ($results["backend-health"]) {
  $adminBearer = $null
  Write-Host "`n[Admin login] POST /api/admin/login" -ForegroundColor Yellow
  try {
    $loginBody = @{ login = $AdminLogin; password = $AdminPassword } | ConvertTo-Json
    $loginRes = Invoke-RestMethod -Uri "$ExpectedApi/admin/login" -Method Post -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $adminBearer = $loginRes.token
    Write-Host "  OK token received" -ForegroundColor Green
    $results["admin-login"] = $true
  } catch {
    Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
    $results["admin-login"] = $false
  }

  if ($adminBearer) {
    $results["admin-api-json"] = Test-Http "Admin API /participants" "$ExpectedApi/admin/participants" -Headers @{
      "Authorization" = "Bearer $adminBearer"
    }
  } else {
    $results["admin-api-json"] = $false
  }
  $results["auth-me"] = Test-Http "Auth /me (test header)" "$ExpectedApi/auth/me" -Headers @{
    "X-Test-Vk-Id" = "1"
  }
} else {
  Write-Host "`n[Skip] Admin API and auth checks - backend unreachable" -ForegroundColor DarkYellow
  $results["admin-api-json"] = $false
  $results["auth-me"] = $false
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$passed = ($results.Values | Where-Object { $_ }).Count
$total = $results.Count
foreach ($key in $results.Keys | Sort-Object) {
  $color = if ($results[$key]) { "Green" } else { "Red" }
  $mark = if ($results[$key]) { "PASS" } else { "FAIL" }
  Write-Host "  [$mark] $key" -ForegroundColor $color
}

if (-not $results["backend-health"]) {
  Write-Host "`nBackend TCP timeout usually means Timeweb Apps routing is broken for the Docker app." -ForegroundColor Yellow
  Write-Host "See TIMEWEB_BACKEND_FIX.md - redeploy mashuk-backend (port 8080, health /health, no Dockerfile HEALTHCHECK)." -ForegroundColor Yellow
}

if ($passed -lt $total) { exit 1 }
Write-Host "`nAll checks passed." -ForegroundColor Green
