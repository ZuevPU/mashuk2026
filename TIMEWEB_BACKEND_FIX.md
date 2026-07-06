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
| **Путь проверки состояния** | `/health` или `/` |

**Внимание:** Для корректной работы healthcheck в Dockerfile добавлен `HEALTHCHECK` и установлен `curl`. Это решает проблему, когда контейнер остаётся в статусе `starting`.

Если DNS резолвится (например `5.129.194.57`), но TCP на `:443` **таймаут** — это проблема маршрутизации Timeweb Apps, не кода. Пересоберите приложение или обратитесь в поддержку: «Docker App Running, порт 8080, `/health` внутри OK, снаружи connection timeout на 443».

## 3. Переменные окружения (обязательно все)

```
DATABASE_URL=postgresql://<db-user>:<db-password>@<db-host>:5432/<db-name>
PORT=8080
NODE_ENV=production
SKIP_VK_SIGN=false
VK_APP_SECRET=<ваш ключ из dev.vk.com>
ADMIN_SECRET=<сгенерируйте уникальный секрет, не коммитьте его>
CORS_ORIGIN=https://zuevpu-mashuk2026-07d9.twc1.net,https://zuevpu-mashuk2026-feae.twc1.net
PUBLIC_URL=https://zuevpu-mashuk2026-1535.twc1.net
```

Optional for empty database after first successful deploy:
```
AUTO_SEED=true
```
(Set once, redeploy, then remove or set `false`.)

Для админки добавьте URL админки в CORS_ORIGIN через запятую (см. пример ниже).

## 4. База данных — доступ из Apps

В панели Timeweb → ваша PostgreSQL → **доступ извне / whitelist**:
- Разрешите подключения с Timeweb Apps (или публичный доступ).
- Если БД в другом регионе/сети — Apps может не достучаться до её хоста.

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
VITE_API_URL=https://zuevpu-mashuk2026-ae82.twc1.net/api
```
(обязательно `https://` и `/api` в конце)

**mashuk-admin** → переменная:
```
VITE_API_URL=https://zuevpu-mashuk2026-ae82.twc1.net/api
```

Вход — логин/пароль админа из БД. На backend при первом деплое: `AUTO_SEED=true`, затем уберите.

Пересоберите оба приложения (Deploy).
