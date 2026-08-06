# Чеклист деплоя и ops (Sprint 0)

## Перед push в `main`

1. `npm run build` в `mashuk-frontend`, `mashuk-admin`, `mashuk-backend`.
2. `npm test` в `mashuk-backend`.
3. Не коммитить `gh-*.txt`, `.env`, ключи VK.

## После GitHub Actions

| Workflow | Проверка |
|----------|----------|
| Deploy Frontend | Мини-app: главная → «Копилка» открывает модалку; профиль → «Создать запись». В логе Actions не должно быть warning про пустой `TIMEWEB_STATIC_WEBHOOK`. |
| Deploy Backend | `GET https://…twc1.net/health` (не `/api/health`) — 200. Старт без ошибок миграций в логах. Нет warning про пустой `TIMEWEB_DEPLOY_WEBHOOK`. |
| Deploy Admin | Логин → аналитика «Программа» → блок NPS (если есть ответы вечерней анкеты). |

### Стабильность очереди Actions

- У Deploy Frontend / Backend включён `concurrency` с `cancel-in-progress: true` — повторный dispatch отменяет зависший queued run той же группы.
- Если job долго в `queued` без runner: cancel + `gh workflow run "Deploy …" --ref main`.
- Пустой webhook secret = сборка ок, но Timeweb не обновлён — проверить Secrets репозитория.

## Admin smoke (Wave 3)

1. **Рейтинг:** «Система рейтинга» → «Как считается рейтинг» (формула + примеры уровней).
2. **Медали:** карточка участника → выдача только ручных медалей; прогресс auto-медалей «N / M».
3. **Копилка:** фильтр → hero «N в списке · M всего»; экспорт XLSX с теми же фильтрами (роль с правом копилки).

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
ANALYTICS_REFRESH_MINUTES=15
```

См. [`V2_FEATURES.md`](V2_FEATURES.md).
