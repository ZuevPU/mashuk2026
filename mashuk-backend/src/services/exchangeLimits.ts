import { eq, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { exchangeAnswers, exchangeQuestions, levelsConfig } from '../db/schema.js';
import { getForumSettings } from './helpers.js';
import { env } from '../config/env.js';

function positiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export type ExchangeLimitsConfig = {
  /** Сколько вопросов участник может задать за всю смену (жёсткий лимит) */
  maxQuestionsTotal: number;
  /** Баллы за один одобренный вопрос */
  pointsPerQuestion: number;
  /**
   * Сколько ответов на вопросы других дают баллы (за смену).
   * После этого отвечать можно без ограничений, но без баллов.
   */
  maxAnswersForPoints: number;
  /** Баллы за один ответ в пределах лимита */
  pointsPerAnswer: number;
};

function envFallbackQuestions(): number {
  return positiveInt(env.EXCHANGE_MAX_QUESTIONS_TOTAL, 3);
}

function envFallbackAnswers(): number {
  return positiveInt(env.EXCHANGE_MAX_ANSWERS_PER_DAY, 5);
}

const DEFAULT_POINTS_QUESTION = 3;
const DEFAULT_POINTS_ANSWER = 5;

export function resolveExchangeLimitsConfig(raw: unknown): ExchangeLimitsConfig {
  const fallbackQ = envFallbackQuestions();
  const fallbackA = envFallbackAnswers();
  if (!raw || typeof raw !== 'object') {
    return {
      maxQuestionsTotal: fallbackQ,
      pointsPerQuestion: DEFAULT_POINTS_QUESTION,
      maxAnswersForPoints: fallbackA,
      pointsPerAnswer: DEFAULT_POINTS_ANSWER,
    };
  }
  const o = raw as Record<string, unknown>;
  // Backward compat: old maxAnswersPerDay → maxAnswersForPoints
  const answersRaw = o.maxAnswersForPoints ?? o.maxAnswersPerDay;
  return {
    maxQuestionsTotal: positiveInt(o.maxQuestionsTotal, fallbackQ),
    pointsPerQuestion: positiveInt(o.pointsPerQuestion, DEFAULT_POINTS_QUESTION),
    maxAnswersForPoints: positiveInt(answersRaw, fallbackA),
    pointsPerAnswer: positiveInt(o.pointsPerAnswer, DEFAULT_POINTS_ANSWER),
  };
}

/** Normalize admin PATCH body; returns null if invalid. */
export function normalizeExchangeLimitsInput(raw: unknown): ExchangeLimitsConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const answersRaw = o.maxAnswersForPoints ?? o.maxAnswersPerDay;
  if (
    o.maxQuestionsTotal === undefined
    || answersRaw === undefined
    || o.pointsPerQuestion === undefined
    || o.pointsPerAnswer === undefined
  ) {
    return null;
  }
  const maxQuestionsTotal = Number(o.maxQuestionsTotal);
  const maxAnswersForPoints = Number(answersRaw);
  const pointsPerQuestion = Number(o.pointsPerQuestion);
  const pointsPerAnswer = Number(o.pointsPerAnswer);
  const nums = [maxQuestionsTotal, maxAnswersForPoints, pointsPerQuestion, pointsPerAnswer];
  if (nums.some(n => !Number.isFinite(n))) return null;
  if (nums.some(n => n < 0 || n > 10_000)) return null;
  return {
    maxQuestionsTotal: Math.floor(maxQuestionsTotal),
    pointsPerQuestion: Math.floor(pointsPerQuestion),
    maxAnswersForPoints: Math.floor(maxAnswersForPoints),
    pointsPerAnswer: Math.floor(pointsPerAnswer),
  };
}

/** Sync levels_config so awardPoints / Levels tab match exchange settings. */
export async function syncExchangePointsToLevelsConfig(cfg: ExchangeLimitsConfig): Promise<void> {
  const pairs: { actionType: string; pointsPerUnit: number; maxAccruals: number }[] = [
    {
      actionType: 'exchange_question',
      pointsPerUnit: cfg.pointsPerQuestion,
      maxAccruals: Math.max(cfg.maxQuestionsTotal, 1),
    },
    {
      actionType: 'exchange_answer',
      pointsPerUnit: cfg.pointsPerAnswer,
      maxAccruals: Math.max(cfg.maxAnswersForPoints, 1),
    },
  ];
  for (const item of pairs) {
    const [existing] = await db.select().from(levelsConfig)
      .where(eq(levelsConfig.actionType, item.actionType)).limit(1);
    if (existing) {
      await db.update(levelsConfig)
        .set({
          pointsPerUnit: item.pointsPerUnit,
          maxAccruals: item.maxAccruals,
        })
        .where(eq(levelsConfig.id, existing.id));
    } else {
      await db.insert(levelsConfig).values({
        actionType: item.actionType,
        pointsPerUnit: item.pointsPerUnit,
        maxAccruals: item.maxAccruals,
        track: 'path',
        displayName: item.actionType === 'exchange_question'
          ? 'Вопрос в «Общении»'
          : 'Ответ участнику в «Общении»',
      });
    }
  }
}

export type ExchangeLimitsState = {
  questionsMax: number;
  questionsUsed: number;
  questionsLeft: number;
  pointsPerQuestion: number;
  /** Сколько ответов ещё дадут баллы */
  answersForPointsMax: number;
  answersForPointsUsed: number;
  answersForPointsLeft: number;
  pointsPerAnswer: number;
  /** @deprecated aliases for older clients */
  answersPerDayMax: number;
  answersTodayUsed: number;
  answersTodayLeft: number;
};

export async function getExchangeLimitsConfig(): Promise<ExchangeLimitsConfig> {
  const settings = await getForumSettings();
  return resolveExchangeLimitsConfig(
    (settings as { exchangeLimits?: unknown } | null)?.exchangeLimits,
  );
}

export async function getExchangeLimitsForParticipant(
  participantId: number,
): Promise<ExchangeLimitsState> {
  const cfg = await getExchangeLimitsConfig();
  const questionsMax = cfg.maxQuestionsTotal;
  const answersForPointsMax = cfg.maxAnswersForPoints;

  const [qRow] = await db.select({ cnt: count() })
    .from(exchangeQuestions)
    .where(eq(exchangeQuestions.participantId, participantId));
  const questionsUsed = Number(qRow?.cnt ?? 0);

  const [aRow] = await db.select({ cnt: count() })
    .from(exchangeAnswers)
    .where(eq(exchangeAnswers.participantId, participantId));
  const answersForPointsUsed = Number(aRow?.cnt ?? 0);
  const answersForPointsLeft = Math.max(0, answersForPointsMax - answersForPointsUsed);

  return {
    questionsMax,
    questionsUsed,
    questionsLeft: Math.max(0, questionsMax - questionsUsed),
    pointsPerQuestion: cfg.pointsPerQuestion,
    answersForPointsMax,
    answersForPointsUsed,
    answersForPointsLeft,
    pointsPerAnswer: cfg.pointsPerAnswer,
    // Aliases: answers are no longer hard-capped per day
    answersPerDayMax: answersForPointsMax,
    answersTodayUsed: answersForPointsUsed,
    answersTodayLeft: answersForPointsLeft,
  };
}
