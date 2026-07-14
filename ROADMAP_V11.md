# Дорожная карта Машук 2026 · статус реализации

Токены LLM (`GIGACHAT_CREDENTIALS`) — только `.env`, не в git.
Миграции: `npx tsx src/db/apply-0006.ts` · `npx tsx src/db/apply-0007.ts`

## S1 — Точки осмысления + вечерняя анкета · DONE
- [x] Шаблон 7 точек × дни 1–7 (`touchpointTemplates.ts` + seed + admin seed/copy-day)
- [x] Статусы pending/active/done/overdue/locked + календарный lock после 00:00 МСК
- [x] Итоговая анкета: 9 шкал + условные + открытые + роль на завтра
- [x] Админка: dayNumber / publishTime / closeTime / копирование дня

## Волна A — Операционка · DONE
- [x] Авто-push по слотам МСК + повтор +30 мин (`pushScheduler.ts`)
- [x] Push за 10–15 мин до событий (`pushReminder` на events)
- [x] `admin_actions_log` + вкладка «Журнал»
- [x] Пользователи админки + матрица прав
- [x] Версионность вопросов + `questionTextSnapshot`
- [x] `push_templates` + `push_queue` + admin CRUD UI
- [x] `push_opt_out` учитывается при отправке

## Волна B — Задания advanced · DONE
- [x] QR токены task/event/participant + download link
- [x] confirmationType: photo / post_url / qr / auto / team
- [x] Панель волонтёра `/#/volunteer` + `POST /volunteer/confirm`
- [x] Медали CRUD + auto-eval + список в профиле

## Волна C — PDF / рейтинг · DONE
- [x] PDF whitelist + pdfkit (fallback TXT) + admin UI
- [x] Экспорт копилки TXT участнику
- [x] Лидеры + `hideFromLeaderboard`
- [x] Выгрузка дня XLSX / multi-CSV

## Волна D — Аналитика v1 · DONE
- [x] `GET /admin/analytics/dashboards` — pulse / portrait / program / activity / piggybank
- [x] Admin UI charts (recharts)

## Волна E — ИИ · DONE
- [x] `gigachatService` — synthesizeOutcomes + clubMatchNightly (dedup)
- [x] Профиль: «Собрать Что получилось»
- [x] Admin: `POST /integrations/club-match`

## Волна F — Интеграции · DONE (база)
- [x] VK push throttle / rate-limit backoff
- [x] Импорт диагностики дирекции
- [x] Планирование отсроченного замера 6–8 недель

## S2 — Группы / согласия / org messenger · DONE
- [x] `participant_groups`, `consent_texts`, `org_threads` / `org_messages`
- [x] Онбординг: group list|auto + версии согласий
- [x] Org tab → threads API; admin reply + push
- [x] Admin UI: groups / consents / org threads

## S4 — Программа / БЗ · DONE
- [x] `schedule_days` + `schedule_day_versions` + publish endpoint
- [x] Participant program gate по `day_published`
- [x] materials: direction / tags / is_general / include_in_analytics
- [x] Save material → piggybank
- [x] KB threshold из forum_settings (tasks + KB)

## Остаток P0–P2 · DONE (2026-07-13)
- [x] Точка Б UI: 5 ответов + strong/growth
- [x] Push opt-out в профиле + Мой QR + volunteer deep-link
- [x] Admin: merge тегов, materials multi-bind, versions UI, medals conditionRule
- [x] Смысловая аналитика (слои + GigaChat/heuristic) + расширенный PDF
- [ ] Ручной UI-прогон в VK mini app (см. QA_CHECKLIST.md)

## Волна G — P1 fidelity · DONE (2026-07-13)
- [x] Мой QR = deep-link `#/volunteer?qr=` + paste/parse в Volunteer
- [x] Реакции 👍 / «Хочу обсудить» в Обмене опытом
- [x] Точки 4–5: выбор события дня + `{ eventId, text }`
- [x] Онбординг: confirmation summary + 6 полных role cards
- [x] `role_diagnostics_config` + UI весов в админке Роли (`apply-0008`)
- [x] XLSX day `type` + листы «Роли по дням» / «Траектория ролей»
- [x] Versioning toast, rights matrix view, participant card drawer
