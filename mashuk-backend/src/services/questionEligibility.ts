import { questionMatchesDay, normalizeDayNumbers } from './questionAdminHelpers.js';
import {
  getTouchpointAccess,
  lateAnswerPolicyForQuestion,
  type LateAnswerPolicy,
} from './timePhase.js';

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
  type?: string | null;
  title?: string | null;
  reflectionKind?: string | null;
  questionKind?: string | null;
  closeTime?: Date | null;
  publishTime?: Date | null;
  linkedEventIds?: number[] | null;
};

/** Audience rules without day filter (for viewing own past answers). */
export function questionAudienceAllowsParticipant(
  q: QuestionLike,
  participant: ParticipantLike,
): boolean {
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

export function questionVisibleToParticipant(
  q: QuestionLike,
  participant: ParticipantLike,
  currentDay: number,
  _options?: { attendedEventIds?: Set<number> },
): boolean {
  if (q.isHidden) return false;

  // Убрали жесткий фильтр по attendance для видимости вопроса, 
  // так как он мешает пользователю открыть форму и выбрать урок.
  // Посещаемость теперь используется только для фильтрации вариантов в самом опросе.

  const block = q.block;
  const dayNum = q.dayNumber ?? 8;
  if (block === 'Точка Б' && currentDay >= dayNum) {
    return questionAudienceAllowsParticipant(q, participant);
  }
  if (!questionMatchesDay(q, currentDay)) return false;
  return questionAudienceAllowsParticipant(q, participant);
}

export function resolveQuestionDayForAccess(q: QuestionLike, currentDay: number): number {
  const days = normalizeDayNumbers(q.dayNumbers ?? undefined, q.dayNumber ?? undefined);
  if (days.includes(currentDay)) return currentDay;
  return q.dayNumber ?? days[0] ?? currentDay;
}

export function getQuestionAccess(
  q: QuestionLike,
  currentDay: number,
  now = new Date(),
  policy?: LateAnswerPolicy,
) {
  const accessDay = resolveQuestionDayForAccess(q, currentDay);
  return getTouchpointAccess(
    accessDay,
    currentDay,
    q.closeTime,
    now,
    q.publishTime,
    policy ?? lateAnswerPolicyForQuestion(q),
  );
}
