# VK tunnel helper for manual mini app testing
# Prerequisites: backend :8080, frontend :5173 running

Write-Host "=== VK Tunnel - Mashuk 2026 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Backend .env:" -ForegroundColor Yellow
Write-Host "   SKIP_VK_SIGN=false"
Write-Host "   VK_APP_SECRET=<from VK Mini App settings>"
Write-Host ""
Write-Host "2. Start backend:  cd mashuk-backend; npm run dev"
Write-Host "3. Start frontend: cd mashuk-frontend; npm run dev"
Write-Host ""
Write-Host "4. Run tunnel (in new terminal):" -ForegroundColor Yellow
Write-Host "   npx @vkontakte/vk-tunnel --http-protocol=http --host=localhost --port=5173"
Write-Host ""
Write-Host "5. Paste tunnel HTTPS URL into VK Mini App dev settings"
Write-Host ""
Write-Host "6. Verify in VK app:" -ForegroundColor Yellow
Write-Host "   - Registration works (no X-Test-Vk-Id)"
Write-Host "   - /auth/me returns 200"
Write-Host "   - Push: set VK_SERVICE_TOKEN, send from admin Push tab"
Write-Host ""
Write-Host "Automated sign verification: cd mashuk-backend; npm test (vkSign utility tests)"
Write-Host ""

$run = Read-Host "Start vk-tunnel now? (y/N)"
if ($run -eq 'y' -or $run -eq 'Y') {
  npx @vkontakte/vk-tunnel --http-protocol=http --host=localhost --port=5173
}
