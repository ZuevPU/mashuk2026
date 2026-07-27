/** Admin question kinds (reflective touchpoints). */
export const QUESTION_KINDS = [
  'input',
  'diagnostic',
  'state_check',
  'after_blocks',
  'day_summary',
  'extra',
] as const;

export type QuestionKind = typeof QUESTION_KINDS[number];

export const ANSWER_TYPES = [
  'text',
  'scale_5',
  'scale_10',
  'choice',
  'multi',
  'emotion',
  'dependent',
] as const;

export type AnswerType = typeof ANSWER_TYPES[number];

export const AUDIENCE_TYPES = ['all', 'direction', 'group', 'role'] as const;

export function answerTypeToLegacyType(answerType: string | null | undefined): string {
  switch (answerType) {
    case 'emotion':
      return 'checkin';
    case 'choice':
      return 'choice';
    case 'multi':
      return 'multi';
    case 'dependent':
      return 'dependent';
    case 'scale_5':
    case 'scale_10':
    case 'text':
    default:
      return 'open';
  }
}

export function legacyTypeToAnswerType(type: string | null | undefined): AnswerType {
  switch (type) {
    case 'checkin':
      return 'emotion';
    case 'choice':
      return 'choice';
    case 'multi':
      return 'multi';
    case 'dependent':
      return 'dependent';
    default:
      return 'text';
  }
}

export function inferQuestionKind(q: {
  questionKind?: string | null;
  reflectionKind?: string | null;
  block?: string | null;
  type?: string | null;
  title?: string | null;
  timePoint?: string | null;
}): QuestionKind {
  if (q.questionKind && QUESTION_KINDS.includes(q.questionKind as QuestionKind)) {
    return q.questionKind as QuestionKind;
  }
  const rk = q.reflectionKind;
  const block = (q.block || '').toLowerCase();
  const title = (q.title || '').toLowerCase();
  if (rk === 'point_a' || rk === 'point_b' || block.includes('точка а') || block.includes('точка б')) return 'input';
  if (block.includes('диагност') || title.includes('диагност')) return 'diagnostic';
  if (rk === 'state_check' || q.type === 'checkin' || block.includes('проверк')) return 'state_check';
  if (rk === 'after_event' || title.includes('осмысление урока')) return 'after_blocks';
  if (rk === 'evening_summary' || block.includes('итог') || q.timePoint === 'вечер') return 'day_summary';
  return 'extra';
}

export function normalizeDayNumbers(
  dayNumbers: number[] | null | undefined,
  dayNumber: number | null | undefined,
): number[] {
  const fromJson = Array.isArray(dayNumbers) ? dayNumbers.filter(d => Number.isFinite(d) && d > 0) : [];
  if (fromJson.length) return [...new Set(fromJson)].sort((a, b) => a - b);
  if (dayNumber != null && dayNumber > 0) return [dayNumber];
  return [1];
}

export function enrichQuestionWritePayload(
  raw: Record<string, unknown>,
  before?: { type?: string | null; answerType?: string | null },
): Record<string, unknown> {
  const out = { ...raw };
  if (out.answerType != null) {
    out.type = answerTypeToLegacyType(String(out.answerType));
  } else if (out.type != null && !out.answerType) {
    out.answerType = legacyTypeToAnswerType(String(out.type));
  } else if (before?.answerType) {
    out.answerType = before.answerType;
  } else if (before?.type) {
    out.answerType = legacyTypeToAnswerType(before.type);
  }

  const dn = normalizeDayNumbers(
    out.dayNumbers as number[] | undefined,
    out.dayNumber != null ? Number(out.dayNumber) : undefined,
  );
  out.dayNumbers = dn;
  out.dayNumber = dn[0] ?? 1;

  if (out.questionKind == null && (out.reflectionKind != null || out.block != null || out.type != null)) {
    out.questionKind = inferQuestionKind({
      reflectionKind: out.reflectionKind as string | null,
      block: out.block as string | null,
      type: (out.type as string) ?? before?.type,
      title: out.title as string | null,
      timePoint: out.timePoint as string | null,
    });
  }
  return out;
}

export function questionMatchesDay(q: { dayNumber?: number | null; dayNumbers?: number[] | null }, day: number): boolean {
  const nums = normalizeDayNumbers(q.dayNumbers ?? undefined, q.dayNumber ?? undefined);
  return nums.includes(day);
}

export function shiftQuestionWindows(
  q: { publishTime?: Date | null; closeTime?: Date | null; title?: string | null },
  fromDay: number,
  toDay: number,
  startDate: Date,
  slotFinder: (title: string) => { publishTime: Date; closeTime: Date } | null,
): { publishTime: Date | null; closeTime: Date | null } {
  const slot = q.title ? slotFinder(q.title) : null;
  if (slot) return slot;
  if (q.publishTime && q.closeTime) {
    const delta = (toDay - fromDay) * 86_400_000;
    return {
      publishTime: new Date(q.publishTime.getTime() + delta),
      closeTime: new Date(q.closeTime.getTime() + delta),
    };
  }
  return { publishTime: q.publishTime ?? null, closeTime: q.closeTime ?? null };
}

export function serializeAdminQuestion<T extends {
  questionKind?: string | null;
  answerType?: string | null;
  type: string;
  dayNumber?: number | null;
  dayNumbers?: number[] | null;
}>(q: T, answerCount = 0) {
  return {
    ...q,
    answerCount,
    questionKind: q.questionKind ?? inferQuestionKind(q),
    answerType: q.answerType ?? legacyTypeToAnswerType(q.type),
    dayNumbers: normalizeDayNumbers(q.dayNumbers ?? undefined, q.dayNumber ?? undefined),
  };
}
