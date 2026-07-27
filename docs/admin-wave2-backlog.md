# Админ-панель §14: backlog волн 2–4

Документ фиксирует scope после **волны 1** (Участники + Программа). Использовать как основу для GitHub Issues / spec-tracker.

## Волна 2 — База знаний, Вопросы, Задания

| Область | Цель |
|---------|------|
| **База знаний** | Список с «N всего», фильтры по дню/событию/статусу; форма материала по ТЗ; привязка к событию из программы |
| **Вопросы** | Табы по дням/типам; фильтры; UI версий вопроса (history); массовое копирование дня |
| **Задания** | Hero «N всего»; категории из dropdown; мультивыбор способов подтверждения; статусы ответов в списке; модерация (уже частично) |

**Issue-шаблоны (предложение):**

- `[admin-w2] KB: list filters + hero count`
- `[admin-w2] Questions: version history UI + copy-day bulk`
- `[admin-w2] Tasks: category dropdown + confirmation multi-select`

## Волна 3 — Рейтинг, медали, копилка, ручные начисления

| Область | Цель |
|---------|------|
| **Рейтинг / LevelsTab** | Конструктор ставок уровней; preview формулы |
| **Медали** | PATCH правил; ручная выдача участнику |
| **Копилка (admin)** | Список записей с фильтрами + XLSX export |
| **Модерация** | Оставшиеся пункты §14 по контенту участников |

**Issue-шаблоны:**

- `[admin-w3] LevelsTab: stake constructor`
- `[admin-w3] Medals: award + PATCH rules`
- `[admin-w3] Piggybank admin list + export`

## Волна 4 — Пуши, админы, журнал, теги §13, черновики

| Область | Цель |
|---------|------|
| **Пуши** | Очередь; шаблоны с плейсхолдерами; preview |
| **Админы** | Матрица прав в UI |
| **Журнал** | Critical log tab; фильтры |
| **Теги §13** | Единый registry thematic tags |
| **Сквозные черновики** | Убрать `includeInAnalytics` в пользу статуса «Опубликовано» |

**Issue-шаблоны:**

- `[admin-w4] Push queue + template placeholders`
- `[admin-w4] Admin permissions matrix UI`
- `[admin-w4] Unified publish status (drop includeInAnalytics)`

## Зависимости

- Волна 2 может идти параллельно backend/frontend по разделам.
- Волна 3 опирается на стабильный participants/points API (волна 1).
- Волна 4 — после согласования модели публикации (program/tasks/questions).

## Приёмка волны 1 (reference)

- Участники: фильтры, XLSX, kebab push/block, карточка «Активность» / «Логи».
- Программа: справочники мест/типов/спикеров, дни смены, под-темы, mini-app expand.
