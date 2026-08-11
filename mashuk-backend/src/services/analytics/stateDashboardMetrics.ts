/** Чистые агрегаторы штабного дашборда «Состояние». */

import { REASON_THEMES } from './textLexicons.js';

export { REASON_THEMES };

export const ZONE_ORDER = ['lift', 'engagement', 'neutral', 'fatigue', 'risk'] as const;
export type ZoneKey = (typeof ZONE_ORDER)[number];

export const ZONE_RU: Record<ZoneKey, string> = {
  lift: 'Подъём',
  engagement: 'Включение',
  neutral: 'Нейтраль',
  fatigue: 'Усталость',
  risk: 'Риск',
};

export const PHASE_ORDER = ['morning', 'day', 'evening'] as const;
export type PhaseKey = (typeof PHASE_ORDER)[number];

export const PHASE_RU: Record<PhaseKey, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
};

const PSYCHO_MARKERS = [
  'близк', 'семь', 'войн', 'тревог за', 'потеря', 'смерть', 'похорон', 'госпитал', 'больниц',
];

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function isNegZone(zone: string | null | undefined): boolean {
  return zone === 'risk' || zone === 'fatigue';
}

export function zoneDistCounts(zones: Iterable<string | null | undefined>): number[] {
  const counts: Record<ZoneKey, number> = {
    lift: 0, engagement: 0, neutral: 0, fatigue: 0, risk: 0,
  };
  for (const z of zones) {
    if (z && z in counts) counts[z as ZoneKey] += 1;
  }
  return ZONE_ORDER.map(k => counts[k]);
}

export function negSharePct(dist: number[]): number | null {
  const tot = dist.reduce((a, b) => a + b, 0);
  if (tot < 5) return null;
  const neg = (dist[3] ?? 0) + (dist[4] ?? 0);
  return round1((neg / tot) * 100);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  return round1(m);
}

export function energyHist(values: number[]): Array<{ v: number; n: number }> {
  const bins = Array.from({ length: 11 }, (_, i) => ({ v: i, n: 0 }));
  for (const raw of values) {
    const n = Math.round(raw);
    if (n >= 0 && n <= 10) bins[n].n += 1;
  }
  return bins;
}

export function isPsychoReason(text: string): boolean {
  const t = text.toLowerCase();
  return PSYCHO_MARKERS.some(k => t.includes(k));
}

export function classifyReasonTheme(text: string): string | null {
  const t = text.toLowerCase();
  for (const theme of REASON_THEMES) {
    if (theme.keywords.some(k => t.includes(k))) return theme.name;
  }
  return null;
}

export function countThemes(texts: string[]): Array<{ name: string; n: number }> {
  const map = new Map<string, number>();
  for (const text of texts) {
    if (isPsychoReason(text)) continue;
    const theme = classifyReasonTheme(text) ?? 'Прочее';
    map.set(theme, (map.get(theme) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
}

export type GroupCell = { n: number; neg: number | null };

/** Клетка с n < minN — доля не считается (null). */
export function cellNeg(n: number, negCount: number, minN = 5): GroupCell {
  if (n < minN) return { n, neg: null };
  return { n, neg: round1((negCount / n) * 100) };
}

export type TransitionMatrix = { n: number; m: number[][] };

/** Матрица 5×5 по ZONE_ORDER: утро → вечер. */
export function buildTransition(
  pairs: Array<{ from: ZoneKey; to: ZoneKey }>,
): TransitionMatrix {
  const m = ZONE_ORDER.map(() => ZONE_ORDER.map(() => 0));
  for (const p of pairs) {
    const i = ZONE_ORDER.indexOf(p.from);
    const j = ZONE_ORDER.indexOf(p.to);
    if (i >= 0 && j >= 0) m[i][j] += 1;
  }
  return { n: pairs.length, m };
}
