# Чеклист деплоя и ops (Sprint 0)

## Перед push в `main`

1. `npm run build` в `mashuk-frontend`, `mashuk-admin`, `mashuk-backend`.
2. `npm test` в `mashuk-backend`.
3. Не коммитить `gh-*.txt`, `.env`, ключи VK.

## После GitHub Actions

| Workflow | Проверка |
|----------|----------|
| Deploy Frontend | Мини-app: главная → «Копилка» открывает модалку; профиль → «Создать запись». |
| Deploy Backend | `GET /api/health` или старт без ошибок миграций в логах. |
| Deploy Admin | Логин → аналитика «Программа» → блок NPS (если есть ответы вечерней анкеты). |

## Push VK (мини-app, не сообщество)

См. [`PUSH_VK_SETUP.md`](PUSH_VK_SETUP.md):

- `VK_SERVICE_TOKEN` на backend.
- Тест: админка → Пуши → тест → `deliveryStatusHint` = push мини-приложения.
- У участника включены уведомления (`VKWebAppAllowNotifications`).

## Миграции PostgreSQL (prod)

Backend применяет drizzle при старте. После деплоя убедиться в логах, что нет ошибок миграции. Актуальные файлы: `mashuk-backend/drizzle/0036_forum_points_unified_rating.sql`, `0037_program_speakers_credentials.sql`.

Локально: `cd mashuk-backend && npm run db:prod-ready`.

## Staging: семантическая аналитика v1 (без LLM)

```env
SEMANTIC_ANALYTICS_V2=true
SEMANTIC_ANALYTICS_V2_HEURISTICS_ONLY=true
```

См. [`V2_FEATURES.md`](V2_FEATURES.md).
