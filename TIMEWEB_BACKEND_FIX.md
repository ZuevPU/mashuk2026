# Бэкенд не открывается — чеклист Timeweb Apps

Если фронтенд работает, а `https://ВАШ-BACKEND.twc1.net/health` **не открывается** (таймаут) — контейнер бэкенда не запущен или упал при старте.

## 1. Проверка

Откройте в браузере:
```
https://zuevpu-mashuk2026-1535.twc1.net/health
```
Должно быть: `{"status":"ok"}`

## 2. Настройки приложения mashuk-backend (Timeweb Apps → Docker)

| Поле | Значение |
|------|----------|
| Тип | Dockerfile |
| Путь до директории | `mashuk-backend` |
| Порт | `8080` |
| **Порт** | `8080` |
| **Путь проверки состояния** | `/health` |

Если в логах несколько раз подряд `Running database migrations...` / `Server running on port 8080` — контейнер перезапускается. Обычно помогает: порт `8080`, health path `/health`, пересборка после фикса `0.0.0.0`.

## 3. Переменные окружения (обязательно все)

```
DATABASE_URL=postgresql://gen_user:2h%2Ce%7D%3ClZMB5kC2@85.198.80.180:5432/default_db
PORT=8080
NODE_ENV=production
SKIP_VK_SIGN=false
VK_APP_SECRET=<ваш ключ из dev.vk.com>
ADMIN_SECRET=MashukAdminSuperSecret2026
CORS_ORIGIN=https://zuevpu-mashuk2026-07d9.twc1.net
PUBLIC_URL=https://zuevpu-mashuk2026-1535.twc1.net
```

Для админки добавьте в CORS_ORIGIN через запятую URL админки, когда она будет готова.

## 4. База данных — доступ из Apps

В панели Timeweb → ваша PostgreSQL → **доступ извне / whitelist**:
- Разрешите подключения с Timeweb Apps (или публичный доступ).
- Если БД в другом регионе/сети — Apps может не достучаться до `85.198.80.180`.

## 5. Логи деплоя

Timeweb Apps → mashuk-backend → **Логи** / Deploy logs.

Частые ошибки:
- `Migration failed` — нет доступа к БД или неверный DATABASE_URL
- `FATAL: VK_APP_SECRET is required` — не задан VK_APP_SECRET
- `FATAL: Change ADMIN_SECRET` — оставили dev-admin-secret

## 6. Фронтенд и админка

После того как `/health` откроется:

**mashuk-frontend** → переменная:
```
VITE_API_URL=https://zuevpu-mashuk2026-1535.twc1.net/api
```
(обязательно `https://` и `/api` в конце)

**mashuk-admin** → переменные:
```
VITE_API_URL=https://zuevpu-mashuk2026-1535.twc1.net/api
VITE_ADMIN_TOKEN=MashukAdminSuperSecret2026
```

Пересоберите оба приложения (Deploy).
