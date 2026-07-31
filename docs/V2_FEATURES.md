# Флаги v2 (prod)

Включать **после НФО** и smoke-теста на стенде. Базовая смена участника работает при всех флагах `false`.

| Переменная | Назначение |
|------------|------------|
| `SEMANTIC_ANALYTICS_V2=true` | Дашборды «Смысловая аналитика» и «Материал для клубов», ночной keyword-match `clubFragmentMatchNightly` |
| `ANALYTICS_REFRESH_MINUTES` | Интервал пересчёта daily stats (по умолчанию 15) |

LLM / GigaChat **не используются** — смысловой слой и клубы только на эвристиках и частотном анализе.

Пример: [`mashuk-backend/.env.production.example`](../mashuk-backend/.env.production.example).

Планировщик: [`refreshScheduler.ts`](../mashuk-backend/src/services/analytics/refreshScheduler.ts) — semantic v2 и клубы при `SEMANTIC_ANALYTICS_V2=true`.

**Рекомендуемый порядок:** `SEMANTIC_ANALYTICS_V2=true` на staging/prod → проверить дашборды 6–7 и вкладку клубов.
