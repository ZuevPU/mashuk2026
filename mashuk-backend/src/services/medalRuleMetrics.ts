/** Catalog of medal auto-award rule metrics (DSL: metric>=N). */

export const MEDAL_RULE_METRICS = [
  { key: 'tasks_completed', label: 'Заданий выполнено (одобрено)', example: 5 },
  { key: 'piggybank_count', label: 'Записей в копилке', example: 20 },
  { key: 'answers_count', label: 'Ответов на вопросы', example: 10 },
  { key: 'path_points', label: 'Баллов «Путь»', example: 100 },
  { key: 'experience_points', label: 'Баллов «Опыт»', example: 50 },
  { key: 'event_attendance', label: 'Посещённых активностей (программа)', example: 5 },
  { key: 'reflection_streak', label: 'Дней подряд с рефлексией', example: 7 },
  { key: 'piggybank_streak', label: 'Дней подряд с записью в копилке', example: 7 },
  { key: 'exchange_answers', label: 'Ответов участникам в «Обмене»', example: 10 },
] as const;

export type MedalRuleMetricKey = (typeof MEDAL_RULE_METRICS)[number]['key'];

export function medalRuleLabel(metric: string, target: number): string {
  const row = MEDAL_RULE_METRICS.find(m => m.key === metric);
  if (!row) return `${metric} ≥ ${target}`;
  return `${row.label} ≥ ${target}`;
}
