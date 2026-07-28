# Настройка push-уведомлений VK (Машук)

Бэкенд отправляет уведомления **двумя каналами** (см. `mashuk-backend/src/services/pushService.ts`):

1. **Мини-приложение** — `notifications.send` + `VK_SERVICE_TOKEN`
2. **Fallback** — ЛС сообщества — `messages.send` + `VK_COMMUNITY_TOKEN`

Если mini-app не доставил (`error`, `skipped_no_token`, нет `vk_id`), пробуется сообщение от группы.

## Соответствие полей VK и переменных env

| В кабинете VK | Переменная на backend | Назначение |
|---------------|----------------------|------------|
| **Защищённый ключ** приложения | `VK_APP_SECRET` | Подпись launch params, авторизация участников |
| **Сервисный ключ** приложения | `VK_SERVICE_TOKEN` | Push мини-app (`notifications.send`) |
| Ключ API **сообщества** (право messages) | `VK_COMMUNITY_TOKEN` | ЛС от группы (`messages.send`) |
| ID сообщества (число без минуса) | `VK_GROUP_ID` | Справочно для настройки; отправка ЛС идёт по community token |

Файл на сервере: `mashuk-backend/.env.production` (не коммитить). После изменений — перезапуск backend.

```env
SKIP_VK_SIGN=false
VK_APP_SECRET=...
VK_SERVICE_TOKEN=...
VK_COMMUNITY_TOKEN=...
VK_GROUP_ID=...
PUBLIC_URL=https://...   # ссылка в тексте fallback-сообщения
```

## A1. Мини-приложение

1. [Управление приложениями VK](https://vk.com/apps?act=manage) → приложение форума.
2. **Защищённый ключ** → `VK_APP_SECRET`; в production `SKIP_VK_SIGN=false`.
3. **Сервисный ключ** → `VK_SERVICE_TOKEN`.
4. Приложение **размещено в сообществе** (мини-app открывается из группы).
5. URL мини-app (HTTPS) → деплой `mashuk-frontend`; `VITE_API_URL` → backend.
6. Участник должен **разрешить уведомления** мини-app: онбординг (`Registration.tsx`) или кнопка «Разрешить уведомления VK» в профиле (`VKWebAppAllowNotifications`).

## A2. Сообщество (fallback)

1. Сообщество → Управление → **Работа с API** → ключ с правами **messages**.
2. Включены **Сообщения сообщества**.
3. `VK_COMMUNITY_TOKEN` — токен группы с `messages`.
4. VK может отклонить ЛС, если пользователь не писал сообществу — смотрите `push_log.delivery_status` и подсказку в админке при тесте.

## A3. Планировщик и старт

`startPushScheduler()` вызывается в `mashuk-backend/src/index.ts` **после успешных миграций** БД. Backend должен работать постоянно.

При пустых **обоих** `VK_SERVICE_TOKEN` и `VK_COMMUNITY_TOKEN` в production в логах при старте:  
`WARN: VK_SERVICE_TOKEN and VK_COMMUNITY_TOKEN are both empty — push delivery will log skipped_no_token`.

## A4. Типичные `delivery_status`

| Статус | Значение |
|--------|----------|
| `sent_mini` | Push мини-приложения доставлен |
| `sent_community` | Доставлено ЛС от сообщества |
| `skipped_no_token` | Нет токенов на сервере |
| `skipped_no_vk_id` | У участника нет `vk_id` |
| `skipped_opt_out` | Отключено в профиле участника |
| `error: ...` | Ответ VK API (см. расшифровку в админке: `deliveryStatusHint`) |

Расшифровка для оператора: `describeDeliveryStatus()` в `pushService` / `pushDeliveryStatus.ts`.  
При ошибках доставки backend пишет в лог `[push] deliver vkId=... status=...` (без токенов).

## A5. Проверка после деплоя (чеклист организатора)

1. Перезапустить backend; убедиться, что **нет WARN** про пустые VK-токены.
2. В VK: мини-app открывается из сообщества; у тестового аккаунта включены уведомления приложения.
3. В админке у вашего admin-пользователя указан **VK ID**; в участниках есть запись с **тем же** `vk_id` (иначе тест push вернёт 400).
4. Админка → **Пуши** → черновик → **Тест** — в toast показывается `deliveryStatusHint` (`sent_mini` или расшифровка ошибки).
5. SQL (при доступе к БД):  
   `SELECT delivery_status, trigger_type, left(text, 80) FROM push_log ORDER BY sent_at DESC LIMIT 20;`

## A6. Тестовый API

`POST /api/admin/push/notifications/:id/test` — ответ:

```json
{
  "ok": true,
  "previewBody": "...",
  "deliveryStatus": "sent_mini",
  "deliveryStatusHint": "Доставлено: push мини-приложения ..."
}
```

## Планировщик

Авто-push по МСК-слотам и динамические напоминания по точкам осмысления — `pushScheduler` (тик ~1 мин). Слот 23:00 включается флагом **«Ночной push 23:00»** в админке (настройки push / forum_settings).
