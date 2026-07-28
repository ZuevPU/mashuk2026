# Multi-shift (мультисмены)

## Правило active

После первой активации в продукте **ровно одна** смена со статусом `active` (partial unique index `shifts_one_active_idx`). Участнический API всегда резолвит active shift прозрачно — клиенту `shiftId` не обязателен.

## Backfill (миграция `0038_forum_shifts`)

1. Создаётся таблица `shifts`.
2. Из текущего `forum_settings` создаётся **Смена 0 · песочница** (`code=sandbox`, `is_sandbox=true`, `status=active`) с переносом operational-полей.
3. Создаются пустые **Смена 1** / **Смена 2** (`draft`).
4. Весь существующий контент и участники получают `shift_id` активной (песочницы).
5. `participants.vk_id` больше не глобально уникален → unique `(vk_id, shift_id)`.

## Что scoped по shift_id

| Per-shift | Global |
|-----------|--------|
| events, schedule_days, day_focus, day_experiments | directions, thematic_tags |
| questions (+options), tasks, materials | pedagogical_roles, admins |
| participant_groups, participants | program_speakers, places, block_types |
| forum ops (currentDay, evening, KB unlock, onboarding config на смене) | medals / levels_config (каталог) |
| admin_push_notifications (кампании) | consent_texts |

Персональные данные (answers, submissions, piggybank, points_log, user_medals) живут у participant row → автоматически в контексте смены.

## Admin

- Вкладка **Смены**: CRUD дат, activate / archive / copy / clear sandbox.
- Контекст редактирования: header `X-Admin-Shift-Id` (sessionStorage в админке).
- Активация: settings/admin; очистка песочницы: delete + `confirm: CLEAR_SANDBOX` + critical log.

## Копирование

Копирует структуру программы без PII. Новая смена в `draft`, даты задаёт админ.
