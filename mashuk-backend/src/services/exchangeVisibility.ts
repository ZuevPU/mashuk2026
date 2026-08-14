/** Вопросы обмена опытом живут у автора и не копируются между сменами. */

export function sameExchangeShift(
  me: { shiftId?: number | null },
  authorShiftId?: number | null,
): boolean {
  return me.shiftId != null && authorShiftId != null && me.shiftId === authorShiftId;
}

export function exchangeQuestionAnswerable(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === 'approved';
}

export function participantCanViewExchangeQuestion(
  q: { participantId: number; audience?: string | null; moderationStatus?: string | null },
  me: { id: number; direction?: string | null; shiftId?: number | null },
  author?: { direction?: string | null; shiftId?: number | null } | null,
): boolean {
  if (q.participantId === me.id) return true;
  if (!sameExchangeShift(me, author?.shiftId ?? null)) return false;
  if (!exchangeQuestionAnswerable(q.moderationStatus)) return false;
  const aud = (q.audience || 'all').toLowerCase();
  if (aud === 'direction' || aud === 'my_direction' || aud === 'своему направлению') {
    return !!me.direction && author?.direction === me.direction;
  }
  return true;
}

export function participantCanAnswerExchangeQuestion(
  question: { participantId: number; audience?: string | null; moderationStatus?: string | null },
  me: { id: number; direction?: string | null; shiftId?: number | null },
  author?: { direction?: string | null; shiftId?: number | null } | null,
): string | null {
  if (question.participantId !== me.id && !sameExchangeShift(me, author?.shiftId ?? null)) {
    return 'Этот вопрос из другой смены';
  }
  if (!exchangeQuestionAnswerable(question.moderationStatus)) {
    return 'Вопрос ещё не одобрен модератором или снят с публикации';
  }
  const aud = (question.audience || 'all').toLowerCase();
  if (aud === 'direction' || aud === 'my_direction' || aud === 'своему направлению') {
    if (!me.direction || author?.direction !== me.direction) {
      return 'Этот вопрос только для участников вашего направления';
    }
  }
  return null;
}
