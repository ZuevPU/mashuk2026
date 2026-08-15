# Multi-shift (мультисмены)

## Active, published, live

- **`status === 'active'`** — смена идёт. Несколько active разрешены (уникальный индекс одной active снят в `0064_shift_publish_multi`).
- **`isPublished`** — смена видна для регистрации.
- **`listLiveShifts()`** — `active` и не sandbox. Так работают пуши и планировщик точек.
- `resolveActiveShift()` — одна строка, только легаси для запросов **без** смены. Если `shiftId` уже передан и строки нет — `null`, не подменять первой active. Участникские начисления, день форума и медали берут `participant.shiftId`. Новые пути `resolveActiveShift()` не зовут.

Участник: заголовок `X-Shift-Id` (localStorage `mashuk-shift-id`). Админ: `X-Admin-Shift-Id`.

## Что scoped по shift_id

| Per-shift | Global (пока общее) |
|-----------|---------------------|
| events, schedule_days, day_focus, day_experiments, home_notices | pedagogical_roles, admins |
| questions, tasks, materials | task_categories, exchange_categories, exchange_tags |
| directions, thematic_tags, program_speakers, places, block_types | rating_bonus_rules, consent_texts |
| participant_groups, participants | |
| medals, levels_config (свои строки смены, иначе легаси `shift_id IS NULL`) | |
| forum ops на строке `shifts` (currentDay, evening, KB, onboarding) | `forum_settings` — зеркало при activate, не источник для живых путей |
| admin_push_notifications, push_queue.shift_id | |

Персональные данные (answers, submissions, piggybank, points_log, user_medals) живут у participant → в контексте его смены.

Обмен опытом без колонки `shift_id`: изоляция через автора `participants.shift_id`.

## Регистрация

- Смена 1 (code `shift1` / имя «смена 1»): вход или дорегистрация.
- Копия в другую смену при завершённой смене 1 → `registrationAction: choose`.
- Новый VK без смены 1 → регистрация на смену 2.
- Третья опубликованная смена в этом маршруте не участвует.

Копия участника — оболочка: VK и имя, без онбординга, QR и прогресса.

## Admin

- Селектор смены пишет `X-Admin-Shift-Id`.
- Activate / publish / archive / copy / sandbox — вкладка «Смены».
- Копирование структуры без PII. Новая смена `draft`, контент неопубликован, пока админ не выпустит.
