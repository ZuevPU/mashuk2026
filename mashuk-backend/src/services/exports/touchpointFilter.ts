import type { questions } from '../../db/schema.js';
import { lessonSlotIndexForQuestion } from '../lessonSlotEvents.js';
import { reflectionKindFromQuestion } from '../reflectionTypeLabel.js';

export type ExportTouchpointFilter =
  | 'all'
  | 'checkin'
  | 'direction'
  | 'lesson_important'
  | 'lesson_open'
  | 'evening'
  | 'point_a'
  | 'point_b';

export const EXPORT_TOUCHPOINT_FILTERS: ExportTouchpointFilter[] = [
  'all',
  'checkin',
  'direction',
  'lesson_important',
  'lesson_open',
  'evening',
  'point_a',
  'point_b',
];

export function normalizeExportTouchpointFilter(raw: string | null | undefined): ExportTouchpointFilter {
  const t = (raw || 'all').toLowerCase();
  const map: Record<string, ExportTouchpointFilter> = {
    all: 'all',
    checkin: 'checkin',
    проверка: 'checkin',
    direction: 'direction',
    направление: 'direction',
    lessons: 'lesson_important',
    lesson_important: 'lesson_important',
    lesson_open: 'lesson_open',
    lessons_open: 'lesson_open',
    evening: 'evening',
    итоги: 'evening',
    point_a: 'point_a',
    точка_а: 'point_a',
    point_b: 'point_b',
    точка_б: 'point_b',
  };
  return map[t] ?? 'all';
}

export function touchpointTypeForQuestion(q: typeof questions.$inferSelect): string {
  const kind = reflectionKindFromQuestion(q);
  if (kind === 'state_check') return 'checkin';
  if (kind === 'point_a') return 'point_a';
  if (kind === 'point_b') return 'point_b';
  if (kind === 'evening_summary') return 'evening';
  const slot = lessonSlotIndexForQuestion(q);
  if (slot === 4) return 'lesson_important';
  if (slot === 5) return 'lesson_open';
  const block = (q.block || '').toLowerCase();
  const title = (q.title || '').toLowerCase();
  if (block.includes('направлен') || (block.includes('осмыслен') && !title.includes('урок'))) {
    return 'direction';
  }
  if (title.includes('урок') || block.includes('урок')) {
    return 'lesson_important';
  }
  return kind || 'other';
}

export function questionMatchesExportFilter(
  q: typeof questions.$inferSelect,
  filter: ExportTouchpointFilter,
): boolean {
  if (filter === 'all') return true;
  const tp = touchpointTypeForQuestion(q);
  if (filter === 'checkin') return tp === 'checkin';
  if (filter === 'direction') return tp === 'direction';
  if (filter === 'lesson_important') return tp === 'lesson_important';
  if (filter === 'lesson_open') return tp === 'lesson_open';
  if (filter === 'evening') return tp === 'evening';
  if (filter === 'point_a') return tp === 'point_a';
  if (filter === 'point_b') return tp === 'point_b';
  return true;
}
