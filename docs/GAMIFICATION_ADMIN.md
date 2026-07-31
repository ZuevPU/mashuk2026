# Доступ игропатиков (роль `gamification`)

Роль **игропатика** (`gamification`) даёт доступ к тому же приложению **mashuk-admin**, но только к разделам системы рейтинга.

## Создание учётки

1. Войти под администратором → вкладка **Админы** → **Пользователи админки**.
2. Создать пользователя с ролью **игропатика**.
3. После входа видны вкладки: **Рейтинг** (хаб), **Задания**, **Модерация**, **Медали**, **Система баллов**, **Участники**, **Данные**, **Дашборды** (только активность), **Выгрузки**.

Матрица прав по умолчанию задаётся в `adminPermissionsDefaults.ts` и подмешивается в БД при старте backend (`ensureGamificationRolePermissions`).

## API для клиента

- `GET /api/admin/auth/me` — `{ role, permissions, allowedSections, allowedTabs, defaultTab, analyticsDashboards }`
- `GET /api/admin/me/permissions` — то же (legacy alias через `getMyPermissions`)

## Переменные окружения

| Переменная | Значение | Назначение |
|------------|----------|------------|
| `UNIFIED_RATING` | `true` (по умолчанию) | Единый счётчик `forum_points` = path + experience + bonus; колонка синхронизируется при начислениях и пересчёте |
| `UNIFIED_RATING=false` | | Старое отображение «Путь + Опыт» в mini-app |

Миграция: `drizzle/0036_forum_points_unified_rating.sql`.

## Операции по ТЗ

| Действие | API |
|----------|-----|
| Отметить задание вручную | `POST /api/admin/participants/:id/tasks/:taskId/complete` |
| Отменить выполнение заявки | `POST /api/admin/participants/:id/task-submissions/:submissionId/revoke` |
| Экран лидеров | `#/leaderboard-screen?scope=shift&track=total` (нужен admin token в том же браузере) |
| Таблица лидеров (JSON) | `GET /api/admin/leaderboard?scope=day|shift|total&track=total&day=N` |

Античит: дубликат ссылок VK при submit задания — `assertPostUrlUnique` в `taskEligibility.ts`.

## Чеклист ТЗ (кратко)

- [x] Роль и матрица прав, `requireAdminPermission` на задания/медали/уровни/выгрузки рейтинга
- [x] Фильтр вкладок admin UI + хаб «Рейтинг»
- [x] Ручное complete/revoke + UI в карточке участника
- [x] Единый `forum_points` + `UNIFIED_RATING`
- [x] Публичный экран лидеров + пресеты выгрузок
- [x] Расширенная rating-analytics (опционально, фаза 4 плана) — базовые дашборды активности/рейтинга; углубление later
- [x] PDF итога смены без построчной детализации (`GET /exports/shift-summary.pdf` + job)

## Проверка после деплоя

1. `npm run build` в `mashuk-backend` и `mashuk-admin`.
2. Применить миграцию 0036 на production DB.
3. Создать тестового игропатика, убедиться что нет доступа к «Форум», «Push», «Админы».
4. Открыть `#/leaderboard-screen?scope=shift&track=total` после логина в admin.
