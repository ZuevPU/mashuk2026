export const DIR_MIN_REG = 40;
export const GROUP_MIN_N = 8;
export const PHASE_CELL_MIN = 5;

export type ProfileMetricKey =
  | 'idx'
  | 'neg'
  | 'stCov'
  | 'own'
  | 'rfCov'
  | 'points'
  | 'exp0'
  | 'exCov'
  | 'kopCov'
  | 'drafts';

export const PROFILE_METRICS: Array<{
  key: ProfileMetricKey;
  name: string;
  up: boolean;
  unit: string;
}> = [
  { key: 'idx', name: 'Индекс дня (итоги)', up: true, unit: '' },
  { key: 'neg', name: 'Усталость и риск', up: false, unit: '%' },
  { key: 'stCov', name: 'Охват проверок состояния', up: true, unit: '%' },
  { key: 'own', name: 'Присвоение после блоков', up: true, unit: '%' },
  { key: 'rfCov', name: 'Охват осмысления', up: true, unit: '%' },
  { key: 'points', name: 'Точки осмысления', up: true, unit: '' },
  { key: 'exp0', name: 'Без обмена опытом', up: false, unit: '%' },
  { key: 'exCov', name: 'Охват обмена опытом', up: true, unit: '%' },
  { key: 'kopCov', name: 'Охват копилки', up: true, unit: '%' },
  { key: 'drafts', name: 'Черновики итоговой анкеты', up: false, unit: '%' },
];

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function pct(n: number, d: number): number {
  return d ? round1((n / d) * 100) : 0;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  return round1(m);
}

/** Отклонение v от базы f в %; null если базы нет. */
export function deviationPct(v: number | null | undefined, f: number | null | undefined): number | null {
  if (v == null || f == null) return null;
  if (f === 0) return v === 0 ? 0 : null;
  return round1(((v - f) / f) * 100);
}

export function isGoodDeviation(dev: number | null, up: boolean): boolean | null {
  if (dev == null) return null;
  return up ? dev > 0 : dev < 0;
}

/** Место в ряду: 1 = лучший. up=true → больше лучше. */
export function rankOf(
  dirs: string[],
  values: Record<string, number | null | undefined>,
  dir: string,
  up: boolean,
): number {
  const ranked = dirs
    .map(d => ({ d, v: values[d] }))
    .filter((x): x is { d: string; v: number } => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => (up ? b.v - a.v : a.v - b.v));
  const i = ranked.findIndex(x => x.d === dir);
  return i >= 0 ? i + 1 : ranked.length + 1;
}

/** 0…1 для раскраски ячейки по месту в ряду (1 → 1, last → 0). Инвертированные метрики уже отсортированы. */
export function rankTone(rank: number, n: number): number {
  if (n <= 1) return 0.5;
  return 1 - (rank - 1) / (n - 1);
}

export function numScale(raw: unknown, maxScale = 5): number | null {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > maxScale) return null;
  return num;
}
