/**
 * Чистые агрегаторы дашборда «Итоги дня» (спека §13).
 * Без БД — удобно тестировать на фикстурах.
 */

export const FORMAL_STOP = new Set([
  '.',
  '-',
  '—',
  'нет',
  'не',
  'ок',
  'ok',
  'все ок',
  'всё ок',
  'все хорошо',
  'всё хорошо',
  'нормально',
  'норм',
  'без изменений',
  'ничего',
  'нету',
]);

/** Индекс переноса: первые два исхода ролевого эксперимента. */
const TRANSFER_OK = [
  'получилось естественно',
  'получилось, но было непривычно',
];

export type ScaleSample = {
  key: string;
  label: string;
  value: number;
};

export type NamedCount = { name: string; n: number };

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isFormalAnswer(text: unknown): boolean {
  if (text == null) return false;
  const s = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return false;
  if (s.length < 4) return true;
  return FORMAL_STOP.has(s);
}

export function scaleDist(values: number[], maxScale = 5): number[] {
  const dist = Array.from({ length: maxScale }, () => 0);
  for (const v of values) {
    const n = Math.round(v);
    if (n >= 1 && n <= maxScale) dist[n - 1] += 1;
  }
  return dist;
}

export function lowSharePct(dist: number[]): number {
  const n = dist.reduce((a, b) => a + b, 0);
  if (!n) return 0;
  const low = (dist[0] ?? 0) + (dist[1] ?? 0) + (dist[2] ?? 0);
  return round1((low / n) * 100);
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Разрыв направлений: max − min средних при n ≥ minN. */
export function directionSpread(
  byDir: { n: number; mean: number | null }[],
  minN = 10,
): number {
  const eligible = byDir.filter(d => d.n >= minN && d.mean != null) as {
    n: number;
    mean: number;
  }[];
  if (eligible.length < 2) return 0;
  const vals = eligible.map(d => d.mean);
  return round2(Math.max(...vals) - Math.min(...vals));
}

export function deviation(value: number, baseline: number): number {
  return round2(value - baseline);
}

export type GroupAgg = {
  group: string;
  dir: string;
  n: number;
  idx: number;
  byBlock: Record<string, { mean: number; n: number; label: string }>;
};

/** Слабые/сильные группы: только n ≥ minN. */
export function pickGroupExtremes(
  groups: GroupAgg[],
  minN = 8,
  worstLimit = 6,
  bestLimit = 4,
): {
  worst: Array<{
    group: string;
    dir: string;
    n: number;
    idx: number;
    weak: string;
    weakVal: number;
  }>;
  best: Array<{ group: string; n: number; idx: number }>;
} {
  const eligible = groups.filter(g => g.n >= minN).sort((a, b) => a.idx - b.idx);
  const worst = eligible.slice(0, worstLimit).map(g => {
    let weak = '—';
    let weakVal = g.idx;
    for (const b of Object.values(g.byBlock)) {
      if (b.n < 3) continue;
      if (b.mean < weakVal || weak === '—') {
        weak = b.label;
        weakVal = b.mean;
      }
    }
    return {
      group: g.group,
      dir: g.dir,
      n: g.n,
      idx: g.idx,
      weak,
      weakVal: round2(weakVal),
    };
  });
  const best = [...eligible]
    .sort((a, b) => b.idx - a.idx)
    .slice(0, bestLimit)
    .map(g => ({ group: g.group, n: g.n, idx: g.idx }));
  return { worst, best };
}

export function transferIndexPct(experiment: NamedCount[]): number {
  const tot = experiment.reduce((a, e) => a + e.n, 0);
  if (!tot) return 0;
  const done = experiment
    .filter(e => TRANSFER_OK.some(ok => e.name.toLowerCase().startsWith(ok)))
    .reduce((a, e) => a + e.n, 0);
  return Math.round((done / tot) * 100);
}

export function countNamed(values: string[]): NamedCount[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const name = v.trim();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
}

export function medianLen(texts: string[]): number {
  const lens = texts.map(t => t.trim().length).filter(n => n > 0).sort((a, b) => a - b);
  if (!lens.length) return 0;
  const mid = Math.floor(lens.length / 2);
  return lens.length % 2 === 0
    ? Math.round((lens[mid - 1] + lens[mid]) / 2)
    : lens[mid];
}

export function formalSharePct(texts: string[]): number {
  if (!texts.length) return 0;
  const junk = texts.filter(t => isFormalAnswer(t)).length;
  return round1((junk / texts.length) * 100);
}

/** Склейка полей с одним лейблом / семейством new_field*. */
export function mergeFieldKeys(
  fields: { key: string; label: string }[],
): Map<string, string[]> {
  const byLabel = new Map<string, string[]>();
  for (const f of fields) {
    const label = (f.label || f.key).trim() || f.key;
    const bucket = byLabel.get(label) ?? [];
    bucket.push(f.key);
    byLabel.set(label, bucket);
  }
  // new_field / new_field_1.. без общего лейбла — одна корзина на «одинаковый префикс смысла»
  const newFields = fields.filter(f => /^new_field(_\d+)?$/i.test(f.key));
  if (newFields.length > 1) {
    const labels = new Set(newFields.map(f => (f.label || f.key).trim()));
    // если у всех разные автолейблы (=ключ), склеиваем в одну группу
    if (labels.size === newFields.length) {
      const keys = newFields.map(f => f.key);
      byLabel.set('__new_field_merged__', keys);
      for (const f of newFields) {
        byLabel.delete((f.label || f.key).trim() || f.key);
      }
    }
  }
  return byLabel;
}

/**
 * Тема шкалы для дедупа: «housing» с подписью про куратора = та же тема, что curator.
 * В анкете часто переименовывают housing → «работу куратора», оставляя пустой curator.
 */
export function eveningScaleTopicKey(f: { key: string; label?: string | null }): string {
  const key = (f.key || '').trim();
  const label = (f.label || '').toLowerCase();
  if (key === 'curator' || /куратор/.test(label)) return '__curator__';
  if (key === 'housing' || /проживан|быт/.test(label)) return '__housing__';
  return key || label || 'unknown';
}

/**
 * Оставляет одну шкалу на тему (куратор / проживание / …), с наибольшим числом ответов.
 */
export function pickPreferredScaleFields<T extends { key: string; label?: string | null }>(
  fields: T[],
  answerCount: (key: string) => number,
): T[] {
  const groups = new Map<string, T[]>();
  const firstIndex = new Map<string, number>();
  fields.forEach((f, i) => {
    const topic = eveningScaleTopicKey(f);
    if (!groups.has(topic)) {
      groups.set(topic, []);
      firstIndex.set(topic, i);
    }
    groups.get(topic)!.push(f);
  });

  const out: T[] = [];
  for (const [topic, group] of groups) {
    if (group.length === 1) {
      const only = group[0]!;
      out.push(
        topic === '__curator__'
          ? { ...only, label: 'Работа куратора группы' }
          : only,
      );
      continue;
    }
    const ranked = [...group].sort((a, b) => {
      const dn = answerCount(b.key) - answerCount(a.key);
      if (dn !== 0) return dn;
      if (a.key === 'curator') return -1;
      if (b.key === 'curator') return 1;
      return a.key.localeCompare(b.key);
    });
    const winner = ranked[0]!;
    out.push(
      topic === '__curator__'
        ? { ...winner, label: 'Работа куратора группы' }
        : winner,
    );
  }

  out.sort((a, b) =>
    (firstIndex.get(eveningScaleTopicKey(a)) ?? 99)
    - (firstIndex.get(eveningScaleTopicKey(b)) ?? 99));
  return out;
}

export function isDirectionWorkField(f: { key: string; label?: string }): boolean {
  if (f.key === 'direction') return true;
  const label = (f.label || '').toLowerCase();
  return /тематическ\S* направлен/.test(label) && /работ|оценк/.test(label);
}

function parseDayScale(raw: unknown, maxScale: number): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > maxScale) return null;
  return num;
}

export type DirectionDayCell = { filled: number; avg: number | null };

export type DirectionDayRatings = {
  fieldKey: string;
  fieldLabel: string;
  days: Array<{ day: number; label: string }>;
  rows: Array<{ direction: string; cells: DirectionDayCell[] }>;
};

/** Матрица: направление × день форума по шкале «работа тематического направления». */
export function buildDirectionDayRatings(opts: {
  days: Array<{ day: number; label: string }>;
  directions: string[];
  rows: Array<{ dayNumber: number; direction: string; ratings: Record<string, unknown> }>;
  field: { key: string; label: string; type?: string };
}): DirectionDayRatings {
  const maxScale = opts.field.type === 'scale_1_10' ? 10 : 5;
  const buckets = new Map<string, number[]>();
  const cellKey = (dir: string, day: number) => `${dir}\0${day}`;

  for (const r of opts.rows) {
    const v = parseDayScale(r.ratings[opts.field.key], maxScale);
    if (v == null) continue;
    const k = cellKey(r.direction, r.dayNumber);
    const arr = buckets.get(k) ?? [];
    arr.push(v);
    buckets.set(k, arr);
  }

  return {
    fieldKey: opts.field.key,
    fieldLabel: opts.field.label,
    days: opts.days,
    rows: opts.directions.map(direction => ({
      direction,
      cells: opts.days.map(({ day }) => {
        const vals = buckets.get(cellKey(direction, day)) ?? [];
        return { filled: vals.length, avg: mean(vals) };
      }),
    })),
  };
}
