# Флаги v2 (prod)

Включать **после НФО** и smoke-теста на стенде. Базовая смена участника работает при всех флагах `false`.

| Переменная | Назначение |
|------------|------------|
| `SEMANTIC_ANALYTICS_V2=true` | Дашборды «Смысловая аналитика» и «Материал для клубов», ночной прогон `clubFragmentMatchNightly` (keyword по фрагментам) |
| `SEMANTIC_ANALYTICS_V2_HEURISTICS_ONLY=true` | По умолчанию эвристики без GigaChat для v2 (LLM отложен). Установите `false`, когда подключите GigaChat |
| `GIGACHAT_API_KEY` + `GIGACHAT_SCOPE` | LLM-слой (кластеризация, embeddings) — **отдельный этап**, сейчас не обязателен |
| `LLM_PROFILE_V2=true` | Генерация outcomes/маршрута в `GET /profile` через GigaChat (fallback — эвристики) |
| `LLM_REFLECTION_BONUS_V2=true` | Бонус XP за содержательность рефлексии (+0/+3/+5) в `questionsController` |

Пример: [`mashuk-backend/.env.production.example`](../mashuk-backend/.env.production.example).

Планировщик: [`refreshScheduler.ts`](../mashuk-backend/src/services/analytics/refreshScheduler.ts) — semantic v2 и клубы при `SEMANTIC_ANALYTICS_V2=true`.

**Рекомендуемый порядок включения сейчас:** `SEMANTIC_ANALYTICS_V2=true` на staging/prod **без** GigaChat → проверить дашборды 6–7 → позже LLM-флаги по отдельному решению.
