/** Чистые агрегаторы штабного дашборда «Активность». */

export type ActivityPerson = {
  id: number;
  direction: string;
  group: string;
  points: number;
  exp: number;
  lastActiveAt: Date | null;
};

export type SegmentName = 'Ядро' | 'Слушатели' | 'Общительные' | 'Тихие';

export const SEGMENT_ORDER: SegmentName[] = ['Ядро', 'Слушатели', 'Общительные', 'Тихие'];

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Джини 0…1 по неотрицательным значениям. */
export function gini(values: number[]): number {
  const vals = values.filter(v => v >= 0).sort((a, b) => a - b);
  const n = vals.length;
  if (n === 0) return 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (2 * (i + 1) - n - 1) * vals[i];
  }
  return round1(Math.abs(acc) / (n * sum));
}

export function topShare(values: number[], fraction: number): number {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => b - a);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || !sorted.length) return 0;
  const k = Math.max(1, Math.ceil(values.length * fraction));
  const top = sorted.slice(0, k).reduce((a, b) => a + b, 0);
  return round1((top / total) * 100);
}

export type LastBucket = 'today' | 'yesterday' | 'old' | 'never';

/** Календарные дни МСК: сегодня / вчера / 2+ дня / никогда. */
export function lastActiveBucket(
  lastActiveAt: Date | null | undefined,
  nowDateKey: string,
): LastBucket {
  if (!lastActiveAt) return 'never';
  const key = mskDateKey(lastActiveAt);
  if (key === nowDateKey) return 'today';
  const yest = shiftDateKey(nowDateKey, -1);
  if (key === yest) return 'yesterday';
  return 'old';
}

export function mskDateKey(d: Date): string {
  const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const y = msk.getUTCFullYear();
  const mo = String(msk.getUTCMonth() + 1).padStart(2, '0');
  const day = String(msk.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function mskHour(d: Date): number {
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
}

export function segmentOf(points: number, exp: number, medPoints: number): SegmentName {
  const prog = points > medPoints;
  const exchange = exp > 0;
  if (prog && exchange) return 'Ядро';
  if (prog && !exchange) return 'Слушатели';
  if (!prog && exchange) return 'Общительные';
  return 'Тихие';
}

export function buildSegments(
  people: ActivityPerson[],
  medPoints: number,
  nowDateKey: string,
): Array<{ name: SegmentName; desc: string; n: number; points: number; exp: number; old: number }> {
  const desc: Record<SegmentName, string> = {
    'Ядро': 'идут по программе и делятся опытом',
    'Слушатели': 'программа без обмена',
    'Общительные': 'обмен без программы',
    'Тихие': 'низко по обоим',
  };
  const buckets: Record<SegmentName, ActivityPerson[]> = {
    'Ядро': [], 'Слушатели': [], 'Общительные': [], 'Тихие': [],
  };
  for (const p of people) {
    buckets[segmentOf(p.points, p.exp, medPoints)].push(p);
  }
  return SEGMENT_ORDER.map(name => {
    const list = buckets[name];
    const pts = list.map(p => p.points);
    const exps = list.map(p => p.exp);
    const old = list.filter(p => {
      const b = lastActiveBucket(p.lastActiveAt, nowDateKey);
      return b === 'old' || b === 'never';
    }).length;
    return {
      name,
      desc: desc[name],
      n: list.length,
      points: pts.length ? round1(pts.reduce((a, b) => a + b, 0) / pts.length) : 0,
      exp: exps.length ? round1(exps.reduce((a, b) => a + b, 0) / exps.length) : 0,
      old,
    };
  });
}

export function pointsHistogram(points: number[], maxPoints: number): Array<{ v: number; n: number }> {
  const max = Math.max(0, maxPoints);
  const bins = Array.from({ length: max + 1 }, (_, v) => ({ v, n: 0 }));
  for (const p of points) {
    const v = Math.max(0, Math.min(max, Math.round(p)));
    bins[v].n += 1;
  }
  return bins;
}

export function expBuckets(exps: number[]): Array<{ name: string; n: number }> {
  const counts = [0, 0, 0, 0, 0];
  for (const e of exps) {
    if (e <= 0) counts[0] += 1;
    else if (e <= 20) counts[1] += 1;
    else if (e <= 60) counts[2] += 1;
    else if (e <= 150) counts[3] += 1;
    else counts[4] += 1;
  }
  return [
    { name: '0 — не участвует', n: counts[0] },
    { name: '1–20', n: counts[1] },
    { name: '21–60', n: counts[2] },
    { name: '61–150', n: counts[3] },
    { name: '150+', n: counts[4] },
  ];
}
