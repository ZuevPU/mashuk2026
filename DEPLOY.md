# Деплой «Машук 2026» на Timeweb

Пошаговый чеклист перед запуском форума в production.

## 1. Подготовка секретов

На сервере backend (не в git):

| Переменная | Пример | Обязательно |
|------------|--------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/mashuk` | да |
| `SKIP_VK_SIGN` | `false` | да |
| `VK_APP_SECRET` | из настроек VK Mini App | да |
| `ADMIN_SECRET` | уникальная строка | да |
| `CORS_ORIGIN` | `https://your-frontend.ru,https://your-admin.ru` | да |
| `PUBLIC_URL` | `https://api.your-domain.ru` | да (для фото) |
| `VK_SERVICE_TOKEN` | токен сообщества | для push |
| `NODE_ENV` | `production` | да |
| `PORT` | `8080` | да |

Frontend build env:

- `VITE_API_URL=https://api.your-domain.ru` (если API на другом домене)

Admin build env:

- `VITE_API_URL=https://api.your-domain.ru/api`

Вход в админку — логин и пароль из таблицы `admin_users` (см. `mashuk-backend/ADMIN_USERS.md`). На backend нужен `ADMIN_SECRET` для подписи JWT-токенов.

## 2. Backend (Docker)

Локальная prod-симуляция:

```powershell
copy mashuk-backend\.env.production.example mashuk-backend\.env.production
# заполните секреты
docker compose -f docker-compose.prod.yml up -d --build
```

Timeweb (один контейнер):

```bash
cd mashuk-backend
docker build -t mashuk-backend .
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL=... \
  -e SKIP_VK_SIGN=false \
  -e VK_APP_SECRET=... \
  -e ADMIN_SECRET=... \
  -e CORS_ORIGIN=... \
  -e PUBLIC_URL=... \
  -e VK_SERVICE_TOKEN=... \
  -e NODE_ENV=production \
  -v mashuk-uploads:/app/uploads \
  mashuk-backend
```

Образ автоматически выполняет `db:migrate` перед стартом (`docker-entrypoint.sh`).

Проверка:

```bash
curl https://api.your-domain.ru/health
curl https://api.your-domain.ru/health/ready
```

## 3. Frontend + Admin (static)

```powershell
cd mashuk-frontend
npm ci --legacy-peer-deps
npm run build
# dist/ → static hosting Timeweb

cd mashuk-admin
npm ci
npm run build
# dist/ → отдельный static site или поддомен
```

GitHub Actions (при push в `main`):

- `.github/workflows/deploy-backend.yml` — test + build + webhook
- `.github/workflows/deploy-frontend.yml` — build artifact + webhook
- `.github/workflows/deploy-admin.yml` — build artifact + webhook

Secrets в GitHub:

- `TIMEWEB_DEPLOY_WEBHOOK` — backend
- `TIMEWEB_STATIC_WEBHOOK` — frontend/admin
- `VITE_API_URL` — для frontend build

## 4. VK Mini App

1. Dev-адрес приложения → URL frontend (HTTPS)
2. Backend URL проксируется через frontend `/api` или напрямую с CORS
3. Локальный тест через tunnel — см. [LOCAL_DEV.md](./LOCAL_DEV.md) § VK tunnel

### Manual checklist

- [ ] Открыть mini app через VK (не localhost)
- [ ] Регистрация и `/auth/me` без 401
- [ ] Push: задание с `pushOnPublish` или админка → Push
- [ ] Загрузка фото задания — URL с `PUBLIC_URL`

## 5. Перед открытием форума

```powershell
cd mashuk-backend; npm test; npm run build
cd mashuk-frontend; npm run build
cd mashuk-admin; npm run build
```

Прогон [QA_CHECKLIST.md](./QA_CHECKLIST.md) — секции E2E и VK test.

Автоматизация перед деплоем:

```powershell
.\scripts\pre-deploy.ps1          # tests + builds + docker build
.\scripts\verify-vk-auth.ps1      # /auth/me with SKIP_VK_SIGN=false
.\scripts\e2e-verify.ps1          # E2E participant + admin (API)
.\scripts\deploy-timeweb.ps1      # artifact check + deploy checklist
.\scripts\vk-tunnel.ps1           # real VK client test
```

## 6. Rollback

- Backend: откат Docker image / webhook на предыдущий SHA
- DB: миграции необратимы — делайте backup PostgreSQL перед деплоем
- Static: redeploy предыдущего `dist` artifact из GitHub Actions
