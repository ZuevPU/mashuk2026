# Флаги v2 (prod)

Включать **после НФО** и smoke-теста на стенде. Базовая смена участника работает при всех флагах `false`.

| Переменная | Назначение |
|------------|------------|
| `SEMANTIC_ANALYTICS_V2=true` | Ночной `clubMatchNightly`, дашборд «Смысловая аналитика», расширенный semantic refresh |
| `GIGACHAT_API_KEY` + `GIGACHAT_SCOPE` | LLM для semantic v2 (обязателен при включённой смысловой аналитике) |
| `LLM_PROFILE_V2=true` | Генерация outcomes/маршрута в `GET /profile` через GigaChat (fallback — эвристики) |
| `LLM_REFLECTION_BONUS_V2=true` | Бонус XP за содержательность рефлексии (+0/+3/+5) в `questionsController` |

Пример: [`mashuk-backend/.env.production.example`](../mashuk-backend/.env.production.example).

Планировщик: [`refreshScheduler.ts`](../mashuk-backend/src/services/analytics/refreshScheduler.ts) — semantic и LLM-флаги читаются при старте и в cron.

**Рекомендуемый порядок включения:** сначала `SEMANTIC_ANALYTICS_V2` + GigaChat на staging → затем `LLM_PROFILE_V2` → затем `LLM_REFLECTION_BONUS_V2`.
