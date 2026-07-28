import { questionMatchesDay, normalizeDayNumbers } from './questionAdminHelpers.js';

type ParticipantLike = {
  directionId?: number | null;
  direction?: string | null;
  groupId?: number | null;
  pedagogicalRole?: string | null;
  strongRole?: string | null;
};

type QuestionLike = {
  block?: string | null;
  dayNumber?: number | null;
  dayNumbers?: number[] | null;
  isHidden?: boolean | null;
  audienceType?: string | null;
  audienceDirectionId?: number | null;
  audienceGroupId?: number | null;
  audienceRole?: string | null;
  direction?: string | null;
};

export function questionVisibleToParticipant(
  q: QuestionLike,
  participant: ParticipantLike,
  currentDay: number,
): boolean {
  if (q.isHidden) return false;
  const block = q.block;
  const dayNum = q.dayNumber ?? 8;
  if (block === 'Точка Б' && currentDay >= dayNum) {
    const aud = q.audienceType || 'all';
    if (aud === 'all') return true;
  }
  if (!questionMatchesDay(q, currentDay)) return false;
  const aud = q.audienceType || 'all';
  if (aud === 'all') return true;
  if (aud === 'direction') {
    if (q.audienceDirectionId != null) {
      return participant.directionId === q.audienceDirectionId;
    }
    if (q.direction && participant.direction) {
      return q.direction === participant.direction;
    }
    return false;
  }
  if (aud === 'group') {
    if (q.audienceGroupId != null) {
      return participant.groupId === q.audienceGroupId;
    }
    return false;
  }
  if (aud === 'role') {
    const roleKey = q.audienceRole?.trim();
    if (!roleKey) return true;
    const pRole = participant.pedagogicalRole || participant.strongRole || '';
    return pRole === roleKey;
  }
  return true;
}

export function resolveQuestionDayForAccess(q: QuestionLike, currentDay: number): number {
  const days = normalizeDayNumbers(q.dayNumbers ?? undefined, q.dayNumber ?? undefined);
  if (days.includes(currentDay)) return currentDay;
  return q.dayNumber ?? days[0] ?? currentDay;
}
