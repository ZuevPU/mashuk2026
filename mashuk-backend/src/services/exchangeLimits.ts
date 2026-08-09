import { eq, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { exchangeAnswers, exchangeQuestions } from '../db/schema.js';
import { isSameMoscowCalendarDay } from './helpers.js';
import { env } from '../config/env.js';

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Lifetime cap on exchange questions per participant. */
export function exchangeMaxQuestionsTotal(): number {
  return positiveInt(env.EXCHANGE_MAX_QUESTIONS_TOTAL, 5);
}

/** Cap on exchange answers (incl. replies) per Moscow calendar day. */
export function exchangeMaxAnswersPerDay(): number {
  return positiveInt(env.EXCHANGE_MAX_ANSWERS_PER_DAY, 5);
}

export type ExchangeLimitsState = {
  questionsMax: number;
  questionsUsed: number;
  questionsLeft: number;
  answersPerDayMax: number;
  answersTodayUsed: number;
  answersTodayLeft: number;
};

export async function getExchangeLimitsForParticipant(
  participantId: number,
  now = new Date(),
): Promise<ExchangeLimitsState> {
  const questionsMax = exchangeMaxQuestionsTotal();
  const answersPerDayMax = exchangeMaxAnswersPerDay();

  const [qRow] = await db.select({ cnt: count() })
    .from(exchangeQuestions)
    .where(eq(exchangeQuestions.participantId, participantId));
  const questionsUsed = Number(qRow?.cnt ?? 0);

  const answerRows = await db.select({
    id: exchangeAnswers.id,
    createdAt: exchangeAnswers.createdAt,
  }).from(exchangeAnswers).where(eq(exchangeAnswers.participantId, participantId));

  const answersTodayUsed = answerRows.filter(r => (
    r.createdAt != null && isSameMoscowCalendarDay(r.createdAt, now)
  )).length;

  return {
    questionsMax,
    questionsUsed,
    questionsLeft: Math.max(0, questionsMax - questionsUsed),
    answersPerDayMax,
    answersTodayUsed,
    answersTodayLeft: Math.max(0, answersPerDayMax - answersTodayUsed),
  };
}
