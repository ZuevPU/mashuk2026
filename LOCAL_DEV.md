# Локальный запуск «Машук 2026»



## Требования



- Node.js 18+

- PostgreSQL (локально, пользователь `postgres`)

- База данных `mashuk`



## 1. База данных



```powershell

psql -U postgres -c "CREATE DATABASE mashuk;"

cd mashuk-backend

copy .env.example .env

npm install

npm run db:setup

```



В `.env` бэкенда:



```

DATABASE_URL=postgresql://postgres@localhost:5432/mashuk?sslmode=disable

SKIP_VK_SIGN=true

```



Seed создаёт тестового участника `vk_id=1`, демо-активность (ответы, задания, обмен, посещение) и пересчитывает аналитику.



## 2. Backend (порт 8080)



```powershell

cd mashuk-backend

npm run dev

```



Проверка: `curl http://localhost:8080/health`



## 3. Frontend VK Mini App (порт 5173)



```powershell

cd mashuk-frontend

copy .env.example .env

npm install --legacy-peer-deps

npm run dev

```



Откройте http://localhost:5173/



Локально используется тестовый участник `X-Test-Vk-Id: 1` (создаётся при seed). В VK окружении auth берёт launch params через `VKWebAppGetLaunchParams`.



## 4. Админ-панель (порт 5174)



```powershell

cd mashuk-admin

copy .env.example .env

npm install

npm run dev

```



Откройте http://localhost:5174/



Токен админа: `dev-admin-secret` (из `.env`).



### Проверка админки после seed



1. Вкладка **Данные** — submissions, attendance, архив exchange

2. **Модерация** — pending + approved exchange с ответами

3. **Выгрузки** — 7 CSV (участники, ответы, копилка, submissions, exchange, attendance, points)

4. **Аналитика** — «Пересчитать» → графики не пустые (seed вызывает recalculate)



Пример API:



```powershell

curl -H "X-Admin-Token: dev-admin-secret" http://localhost:8080/api/admin/task-submissions

curl -H "X-Admin-Token: dev-admin-secret" http://localhost:8080/api/admin/event-attendance

```



## Сборка



```powershell

cd mashuk-backend; npm run build

cd mashuk-frontend; npm run build

cd mashuk-admin; npm run build

```



## Проверка

См. [QA_CHECKLIST.md](./QA_CHECKLIST.md) — сценарии участника и E2E «данные в админку».

## Production checklist

Перед деплоем на Timeweb / прод:

| Переменная | Локально | Production |
|------------|----------|------------|
| `SKIP_VK_SIGN` | `true` | **`false`** |
| `VK_APP_SECRET` | любой | секрет VK Mini App |
| `ADMIN_SECRET` | `dev-admin-secret` | **уникальный секрет** |
| `CORS_ORIGIN` | `*` | URL фронта и админки |
| `VK_SERVICE_TOKEN` | пусто | токен сообщества для push |
| `DATABASE_URL` | localhost | managed PostgreSQL |
| `PUBLIC_URL` | `http://localhost:8080` | **HTTPS URL backend** (для фото) |

## Миграции БД

- **Локально / dev:** `npm run db:push` — быстрая синхронизация схемы.
- **Production / Docker:** `npm run db:migrate` — применяет файлы из `drizzle/`.
- Docker-образ запускает migrate автоматически через `docker-entrypoint.sh`.
- Healthcheck: `GET /health/ready` — проверяет подключение к PostgreSQL.


- `TIMEWEB_DEPLOY_WEBHOOK` — webhook деплоя
- При необходимости: `DATABASE_URL`, `VK_APP_SECRET`, `ADMIN_SECRET`, `VK_SERVICE_TOKEN` на сервере (не в репозитории)

## VK tunnel (тест mini app в реальном VK)

1. Запустите backend и frontend локально (порты 8080 и 5173).
2. Пробросьте HTTPS-туннель на frontend, например [vk-tunnel](https://dev.vk.com/mini-apps/development/vk-tunnel) или ngrok:
   ```powershell
   npx @vkontakte/vk-tunnel --http-protocol=http --host=localhost --port=5173
   ```
3. В настройках VK Mini App укажите URL туннеля как dev-адрес приложения.
4. В `.env` backend: `SKIP_VK_SIGN=false`, `VK_APP_SECRET` из настроек приложения.
5. Откройте приложение через VK — auth через launch params, без `X-Test-Vk-Id`.

## Push в VK

- При создании/публикации задания или вопроса с `pushOnPublish=true` backend шлёт push через VK API (нужен `VK_SERVICE_TOKEN`).
- Ручная отправка: админка → **Push** — всем или по `participantId`.
- Локально без токена записи попадают в `push_log` со статусом ошибки — это нормально.

## CRUD в админке

На вкладках **События**, **Задания**, **Вопросы**, **Баллы**, **Push** доступны inline edit/delete (PATCH/DELETE API). Материалы — редактирование title/url и удаление.

Полный чеклист деплоя: см. [DEPLOY.md](./DEPLOY.md)

## Автотесты

```powershell
cd mashuk-backend
npm install
npm test
```

Из корня репозитория:

```powershell
.\scripts\pre-deploy.ps1       # tests + builds
.\scripts\verify-vk-auth.ps1   # VK sign auth без реального клиента
.\scripts\e2e-verify.ps1         # E2E participant + admin (API)
.\scripts\deploy-timeweb.ps1     # готовность dist к Timeweb
.\scripts\vk-tunnel.ps1          # tunnel + ручной прогон в VK
```

Smoke-тесты: `/health`, 401 без токена, с БД — `/api/auth/me`, admin lists. CI: `.github/workflows/test-backend.yml`.

## Мобильная вёрстка

Frontend на экранах `<520px` — full width, tabbar с `safe-area-inset`. Проверка: DevTools 390×844 и 360×640 по QA_CHECKLIST.

