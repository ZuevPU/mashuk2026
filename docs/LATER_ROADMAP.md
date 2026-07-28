# Отложенный backlog (после v1 смены)

Краткий указатель; детали — [`admin-wave2-backlog.md`](admin-wave2-backlog.md), трекеры `scripts/spec-tracker-*.tsv`.

## Multi-shift

См. [`MULTI_SHIFT.md`](MULTI_SHIFT.md). Сделано: таблица `shifts`, resolve active, admin «Смены», copy/activate/sandbox clear, participant `(vkId, shiftId)`.

Later (не в этом треке):

- Авторотация смен по календарю без кнопки Activate.
- Мульти-тенант нескольких форумов.
- Каталог медалей / levels_config per-shift (сейчас глобальные).

## Admin wave 4

- Очередь push, preview шаблонов.
- Матрица прав админов в UI.
- Critical log tab.
- Единый registry `thematic_tags`.
- Статус «Опубликовано» вместо `includeInAnalytics`.

## LLM / embeddings (этап 2)

- `GIGACHAT_API_KEY`, `LLM_PROFILE_V2`, `LLM_REFLECTION_BONUS_V2`.
- Embeddings + LLM-фильтр для `club_matches`.
- LLM-сводки в дашбордах 1–4.

## Прочее

- Автоматизация отсроченного замера 6–8 недель (сейчас: `GET /exports/delayed-measure-template`).
- PDF итога смены без построчной детализации ([`GAMIFICATION_ADMIN.md`](GAMIFICATION_ADMIN.md)).
- Полный сценарий QR участника → бот VK (сейчас: волонтёр `/volunteer` + deep link).
