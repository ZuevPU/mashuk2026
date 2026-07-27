# Настройка push-уведомлений VK (Машук)

Бэкенд отправляет уведомления **двумя каналами** (см. `mashuk-backend/src/services/pushService.ts):

1. **Мини-приложение** — `notifications.send` + `VK_SERVICE_TOKEN`
2. **Fallback** — ЛС сообщества — `messages.send` + `VK_COMMUNITY_TOKEN` + `VK_GROUP_ID`

Если mini-app не доставил (`error`, `skipped_no_token`, нет `vk_id`), пробуется сообщение от группы.

## A1. Мини-приложение

1. [Управление приложениями VK](https://vk.com/apps?act=manage) → приложение форума.
2. **Защищённый ключ** → `VK_APP_SECRET` на сервере; в production `SKIP_VK_SIGN=false`.
3. **Сервисный ключ доступа** → `VK_SERVICE_TOKEN`.
4. Приложение **размещено в сообществе** (мини-app открывается из группы).
5. URL мини-app (HTTPS) → деплой `mashuk-frontend`; `VITE_API_URL` → backend.
6. Участник должен **разрешить уведомления** мини-app (запрос в онбординге / настройках профиля).

## A2. Сообщество (fallback)

1. Сообщество → Управление → **Работа с API** → ключ с правами **messages**.
2. Включены **Сообщения сообщества**.
3. На сервере:
   - `VK_GROUP_ID` — числовой ID группы (без минуса в env; в API peer для ЛС = `user_id`).
   - `VK_COMMUNITY_TOKEN` — токен группы с `messages`.
4. VK может отклонить ЛС, если пользователь не писал сообществу — смотрите `push_log.delivery_status`.

## A3. Переменные окружения (backend)

| Переменная | Назначение |
|------------|------------|
| `VK_APP_SECRET` | Подпись launch params |
| `VK_SERVICE_TOKEN` | `notifications.send` |
| `VK_GROUP_ID` | ID сообщества |
| `VK_COMMUNITY_TOKEN` | `messages.send` |
| `PUBLIC_URL` | Ссылка в тексте fallback (опционально) |

В production при пустых **обоих** `VK_SERVICE_TOKEN` и `VK_COMMUNITY_TOKEN` в логах будет предупреждение при старте.

## A4. Проверка

1. Backend работает постоянно (`startPushScheduler` после миграций).
2. Админка → **Уведомления** → отправка одному участнику по `participantId`.
3. SQL: `SELECT delivery_status, trigger_type, text FROM push_log ORDER BY sent_at DESC LIMIT 20`.
   - `sent_mini` — доставлено через mini-app
   - `sent_community` — через ЛС группы
   - `skipped_no_token` — нет токенов
   - `skipped_opt_out` — участник отключил тип в профиле
   - `error: ...` — ответ VK API

4. У участника в `participants` заполнен `vk_id`.

## Планировщик

Авто-push по МСК-слотам и динамические напоминания по точкам осмысления — `pushScheduler` (тик ~1 мин). Слот 23:00 включается флагом **«Ночной push 23:00»** в админке (настройки push / forum_settings).
