/** Направления для фильтра Штаба — без «Организатор форума». */
export function isOrganizerDirection(name: string | null | undefined): boolean {
  const d = (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!d) return false;
  return d === 'организатор форума' || d === 'организатор' || d.includes('организатор форума');
}

/** Список направлений участника для селекта Штаба (и «Итоги дня», и «Состояние», и дальше). */
export function hubDirections(directions: string[] | null | undefined): string[] {
  return (directions ?? []).filter(d => !isOrganizerDirection(d));
}

/** Общие query-параметры фильтров «Штаба» для analytics/hub и dashboards. */
export function hubFilterParams(opts: {
  mode?: string;
  forumDay?: string;
  direction?: string;
  group?: string;
  ageCategory?: string;
  activity?: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.mode) params.set('mode', opts.mode);
  if (opts.forumDay) params.set('day', opts.forumDay);
  if (opts.direction) params.set('direction', opts.direction);
  if (opts.group) params.set('group', opts.group);
  if (opts.ageCategory) params.set('ageCategory', opts.ageCategory);
  if (opts.activity) params.set('activity', opts.activity);
  return params;
}

const STOP = new Set([
  'и', 'в', 'на', 'с', 'по', 'для', 'не', 'что', 'как', 'это', 'а', 'но', 'к', 'из',
  'у', 'о', 'же', 'то', 'бы', 'от', 'за', 'все', 'так', 'его', 'её', 'их', 'мы',
  'вы', 'он', 'она', 'они', 'был', 'была', 'были', 'есть', 'нет', 'мне', 'меня',
  'очень', 'просто', 'когда', 'если', 'чтобы', 'уже', 'ещё', 'еще', 'или', 'да',
]);

/** Простой клиентский топ слов для WordDrilldown. */
export function topWordTokens(texts: string[], limit = 20): { token: string; count: number }[] {
  const map = new Map<string, number>();
  for (const text of texts) {
    const words = String(text || '').toLowerCase().match(/[а-яёa-z]{3,}/gi) ?? [];
    for (const w of words) {
      const key = w.toLowerCase();
      if (STOP.has(key)) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }));
}

export function statePhaseOf(timePoint: string | null | undefined): 'morning' | 'day' | 'evening' | 'other' {
  const tp = (timePoint || '').toLowerCase();
  if (tp.includes('вечер')) return 'evening';
  if (tp.includes('день')) return 'day';
  if (tp.includes('утро')) return 'morning';
  return 'other';
}
