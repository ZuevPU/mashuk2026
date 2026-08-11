/** Чистые агрегаторы штабного дашборда «Копилка». */

export const TAG_ORDER = [
  'мысль',
  'вопрос',
  'идея',
  'в работу',
  'на будущее',
  'контакт',
] as const;

export const FUNNEL_STAGES = [
  { name: 'Наблюдение — «мысль», «вопрос»', tags: ['мысль', 'вопрос'] as const },
  { name: 'Замысел — «идея»', tags: ['идея'] as const },
  { name: 'Перенос — «в работу», «на будущее»', tags: ['в работу', 'на будущее'] as const },
  { name: 'Сеть — «контакт»', tags: ['контакт'] as const },
] as const;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Автосохранение материала программы (не заметка участника). */
export function isAutoBookmark(text: string | null | undefined): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return t.startsWith('Блок:') || t.startsWith('Материал:');
}

export function hasActionTag(tags: string[]): boolean {
  return tags.includes('в работу') || tags.includes('на будущее');
}

export function ladderBucket(count: number): string {
  if (count <= 1) return '1 запись';
  if (count <= 3) return '2–3';
  if (count <= 7) return '4–7';
  return '8 и больше';
}

export const LADDER_ORDER = ['1 запись', '2–3', '4–7', '8 и больше'] as const;

export function topShareCounts(counts: number[], k: number): number {
  if (!counts.length) return 0;
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const top = [...counts].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
  return round1((top / total) * 100);
}

export function mskHour(d: Date): number {
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
}
