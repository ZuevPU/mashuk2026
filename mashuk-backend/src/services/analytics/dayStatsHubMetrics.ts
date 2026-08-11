export type DayStatsToolKey =
  | 'checkin'
  | 'lesson_important'
  | 'direction'
  | 'evening'
  | 'lesson_open'
  | 'other';

export type SlotStatus = 'ok' | 'empty' | 'wait';

/** Канонический порядок инструментов в сетке. */
export const TOOL_ORDER: DayStatsToolKey[] = [
  'checkin',
  'lesson_important',
  'direction',
  'evening',
  'lesson_open',
];

export const TOOL_META: Record<DayStatsToolKey, { name: string; note: string }> = {
  checkin: { name: 'Проверка состояния', note: 'утро, день, вечер' },
  lesson_important: { name: 'Важный урок', note: 'осмысление после блока' },
  direction: { name: 'Направление', note: 'работа в тематическом направлении' },
  evening: { name: 'Итоги дня', note: 'анкета открывается в 22:00' },
  lesson_open: { name: 'Открытый урок', note: 'второй слот осмысления урока' },
  other: { name: 'Прочее', note: 'вопросы вне пяти инструментов' },
};

export function toolKeyFromTouchpoint(tp: string): DayStatsToolKey {
  if (tp === 'checkin') return 'checkin';
  if (tp === 'lesson_important' || tp === 'point_a') return 'lesson_important';
  if (tp === 'direction') return 'direction';
  if (tp === 'evening') return 'evening';
  if (tp === 'lesson_open' || tp === 'point_b') return 'lesson_open';
  return 'other';
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function pct(n: number, d: number): number {
  return d ? round1((n / d) * 100) : 0;
}

/** Пустые = открытые без ответов; waiting не входят. */
export function countEmptySlots(slots: Array<{ status: SlotStatus }>): number {
  return slots.filter(s => s.status === 'empty').length;
}

export function countOpenSlots(slots: Array<{ status: SlotStatus }>): number {
  return slots.filter(s => s.status !== 'wait').length;
}

export function reconDiffTone(stat: number, src: number): 'ok' | 'warn' | 'bad' {
  if (src <= 0) return Math.abs(stat - src) > 0 ? 'warn' : 'ok';
  const rel = Math.abs(stat - src) / src;
  if (rel > 0.02) return 'bad';
  if (rel > 0) return 'warn';
  return 'ok';
}
