/** Чистые агрегаторы штабного дашборда «Обмен опытом». */

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

export function topShareCounts(counts: number[], k: number): number {
  if (!counts.length) return 0;
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const top = [...counts].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
  return round1((top / total) * 100);
}

export function answerLadderBucket(count: number): string {
  if (count <= 1) return '1 ответ';
  if (count <= 4) return '2–4';
  if (count <= 10) return '5–10';
  return '11 и больше';
}

export const ANSWER_LADDER = ['1 ответ', '2–4', '5–10', '11 и больше'] as const;

export function lenBin(len: number): string {
  if (len < 20) return 'меньше 20 знаков';
  if (len < 60) return '20–59';
  if (len < 150) return '60–149';
  return '150 и больше';
}

export const LEN_BINS = [
  'меньше 20 знаков',
  '20–59',
  '60–149',
  '150 и больше',
] as const;

export function mskHour(d: Date): number {
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
}

/** Медиана минут до первого ответа; null если нет пар. */
export function medianFirstReplyMinutes(
  pairs: Array<{ askedAt: Date; firstAnswerAt: Date }>,
): number | null {
  const mins = pairs
    .map(p => (p.firstAnswerAt.getTime() - p.askedAt.getTime()) / 60_000)
    .filter(m => Number.isFinite(m) && m >= 0);
  if (!mins.length) return null;
  return Math.round(median(mins));
}
