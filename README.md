# Машук 2026

VK Mini App и админ-панель для педагогического форума «Машук»: программа смены, точки осмысления, задания, обмен вопросами, профиль участника и аналитика для организаторов.

## Состав репозитория

| Папка | Назначение |
|-------|------------|
| `mashuk-frontend` | VK Mini App для участников (React + VKUI) |
| `mashuk-backend` | REST API (Node.js, Express, PostgreSQL, Drizzle ORM) |
| `mashuk-admin` | Веб-админка для организаторов |

## Быстрый старт (локально)

### Backend

```bash
cd mashuk-backend
cp .env.production.example .env   # заполните DATABASE_URL, VK_APP_SECRET и др.
npm ci
npm run dev
```

API по умолчанию: `http://localhost:8080`

### Frontend (VK Mini App)

```bash
cd mashuk-frontend
cp .env.example .env
npm ci
npm run dev
```

### Admin

```bash
cd mashuk-admin
npm ci
npm run dev
```

## База данных

Миграции применяются автоматически при старте бэкенда. Для подготовки продакшн-БД:

```bash
cd mashuk-backend
npm run db:prod-ready
```

Скрипт последовательно выполняет миграции, seed и ops-bootstrap (шаблоны точек, группы, push-шаблоны, демо-расписание).

## Деплой

Push в ветку `main` запускает GitHub Actions:

- `Deploy Backend` — при изменениях в `mashuk-backend/**`
- `Deploy Frontend` — при изменениях в `mashuk-frontend/**`
- `Deploy Admin` — при изменениях в `mashuk-admin/**`

Сборка и выкладка на Timeweb через webhook (`TIMEWEB_DEPLOY_WEBHOOK` в secrets репозитория).

## Основные переменные окружения

**Backend:** `DATABASE_URL`, `VK_APP_SECRET`, `VK_SERVICE_TOKEN`, `ADMIN_SECRET`, `CORS_ORIGIN`, `PUBLIC_URL`

**Frontend:** `VITE_API_URL` — URL API бэкенда

Примеры — в `.env.example` / `.env.production.example` внутри каждого пакета.

## Тесты

```bash
cd mashuk-backend
npm test
```
