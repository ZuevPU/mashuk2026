/** Чистые агрегаторы штабного дашборда «После блоков». */

import {
  REACTION_MAX_LEN,
  REFLECTION_LEVELS,
  REFLECTION_MARKERS,
  type ReflectionLevel,
} from './textLexicons.js';

export { REFLECTION_LEVELS, type ReflectionLevel };

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** Границы слова для кириллицы — чтобы «буду» не ловило «Будущее». */
export function containsMarker(text: string, marker: string): boolean {
  const t = text.toLowerCase();
  const m = marker.toLowerCase();
  if (!m) return false;
  if (m.includes(' ')) return t.includes(m);
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeReg(m)}($|[^\\p{L}\\p{N}_])`, 'u');
  return re.test(t);
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyReflection(text: string): ReflectionLevel {
  const raw = (text || '').trim();
  if (!raw) return 'Тезис';
  for (const m of REFLECTION_MARKERS.transfer) {
    if (containsMarker(raw, m)) return 'Перенос в практику';
  }
  for (const m of REFLECTION_MARKERS.self) {
    if (containsMarker(raw, m)) return 'Связь с собой';
  }
  if (raw.length <= REACTION_MAX_LEN) {
    for (const m of REFLECTION_MARKERS.reaction) {
      if (containsMarker(raw, m)) return 'Реакция';
    }
  }
  return 'Тезис';
}

export function isAppropriation(level: ReflectionLevel): boolean {
  return level === 'Перенос в практику' || level === 'Связь с собой';
}

export function appropriationPct(levels: ReflectionLevel[]): number {
  if (!levels.length) return 0;
  const own = levels.filter(isAppropriation).length;
  return round1((own / levels.length) * 100);
}

export function levelCounts(levels: ReflectionLevel[]): number[] {
  const map = Object.fromEntries(REFLECTION_LEVELS.map(l => [l, 0])) as Record<ReflectionLevel, number>;
  for (const l of levels) map[l] += 1;
  return REFLECTION_LEVELS.map(l => map[l]);
}

export type TimeBucket =
  | 'до 16:00 (по горячим следам)'
  | '17:00–20:00'
  | 'после 21:00 (вечером, задним числом)';

export const TIME_BUCKETS: TimeBucket[] = [
  'до 16:00 (по горячим следам)',
  '17:00–20:00',
  'после 21:00 (вечером, задним числом)',
];

export function timeBucketOf(createdAt: Date | null | undefined): TimeBucket | null {
  if (!createdAt) return null;
  const h = new Date(createdAt.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
  if (h >= 21 || h < 6) return 'после 21:00 (вечером, задним числом)';
  if (h >= 17) return '17:00–20:00';
  return 'до 16:00 (по горячим следам)';
}

export function shortSubtopicLabel(name: string, max = 34): string {
  const cleaned = name
    .replace(/^Мастер-класс:\s*/i, '')
    .replace(/^Мастер-класс\s+/i, '')
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}
