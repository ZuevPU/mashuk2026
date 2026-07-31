# Отложенный backlog (после v1 смены)

Краткий указатель; детали — [`admin-wave2-backlog.md`](admin-wave2-backlog.md), трекеры `scripts/spec-tracker-*.tsv`.

## Multi-shift

См. [`MULTI_SHIFT.md`](MULTI_SHIFT.md). Сделано: таблица `shifts`, resolve active, admin «Смены», copy/activate/sandbox clear, participant `(vkId, shiftId)`, авторотация (`SHIFT_AUTO_ROTATE`), medals/levels `shift_id` в schema.

Later (не в этом треке):

- Мульти-тенант нескольких форумов.
- Полный UI-каталог медалей / levels_config строго per-shift (schema есть).

## Admin wave 4 — статус

Сделано: очередь push + preview, матрица прав, critical log, registry `thematic_tags` (+ upsert при сохранении событий/материалов), статус материалов `draft|published|archived` (analytics по `status`, без `includeInAnalytics`).

## Аналитика / QR

Сделано:

- Semantic v2 на **эвристиках** (`SEMANTIC_ANALYTICS_V2=true`) — без LLM.
- QR участника → бот VK: печать QR события как `vk.me/club…?ref=event_<id>_<token>` при `VK_GROUP_ID`; Callback `POST /api/bot/vk`; мини-app deep link `#/program?event=&qr=` как fallback.
- Отсроченный замер: шаблон + schedule + ingest ответов.
- PDF итога смены: `GET /exports/shift-summary.pdf`.

## Прочее (later)

- Среднее время в боте по направлениям/группам — нужна телеметрия сессий (сейчас только completion/activityRate).
- Расширенная rating-analytics (опционально, фаза 4 геймификации).
