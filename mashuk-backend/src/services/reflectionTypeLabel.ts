import { formatTime } from './helpers.js';

export const REFLECTION_KIND_LABELS = [
  'Проверка состояния',
  'После события',
  'Итоги дня',
  'Точка А',
  'Точка Б',
] as const;

export type ReflectionKind =
  | 'state_check'
  | 'after_event'
  | 'evening_summary'
  | 'point_a'
  | 'point_b';

const KIND_TO_LABEL: Record<ReflectionKind, string> = {
  state_check: 'Проверка состояния',
  after_event: 'После события',
  evening_summary: 'Итоги дня',
  point_a: 'Точка А',
  point_b: 'Точка Б',
};

function isLessonReflectionQuestion(q: { title?: string | null; block?: string | null }): boolean {
  const t = (q.title || '').toLowerCase();
  return t.includes('осмысление урока') || t.includes('слот 1') || t.includes('слот 2');
}

export function reflectionKindFromQuestion(q: {
  reflectionKind?: string | null;
  block?: string | null;
  type?: string | null;
  title?: string | null;
  timePoint?: string | null;
}): ReflectionKind | null {
  const rk = q.reflectionKind as ReflectionKind | null | undefined;
  if (rk && rk in KIND_TO_LABEL) return rk;
  const block = (q.block || '').toLowerCase();
  if (block.includes('точка а')) return 'point_a';
  if (block.includes('точка б')) return 'point_b';
  // State checks first — evening checkin must not become evening_summary
  if (
    q.type === 'checkin'
    || block.includes('проверк')
    || q.timePoint === 'утро'
    || (q as { questionKind?: string | null }).questionKind === 'state_check'
  ) {
    return 'state_check';
  }
  if (block.includes('итог') || q.timePoint === 'вечер') return 'evening_summary';
  if (isLessonReflectionQuestion(q)) return 'after_event';
  return null;
}

export function getReflectionTypeLabel(q: {
  reflectionKind?: string | null;
  block?: string | null;
  type?: string | null;
  title?: string | null;
  timePoint?: string | null;
}): string {
  const kind = reflectionKindFromQuestion(q);
  if (kind) return KIND_TO_LABEL[kind];
  if (q.block?.trim()) return q.block.trim();
  return 'Рефлексия';
}

export function formatQuestionTimeWindow(
  publishTime: Date | null | undefined,
  closeTime: Date | null | undefined,
): string | null {
  const from = formatTime(publishTime);
  const to = formatTime(closeTime);
  if (from && to) return `${from}–${to}`;
  if (to) return `до ${to}`;
  if (from) return `с ${from}`;
  return null;
}

export function labelForReflectionKind(kind: string): string {
  if (kind in KIND_TO_LABEL) return KIND_TO_LABEL[kind as ReflectionKind];
  return kind;
}
