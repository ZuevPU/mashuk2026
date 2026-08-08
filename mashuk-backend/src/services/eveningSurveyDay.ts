import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participantDayState } from '../db/schema.js';
import {
  isEveningOpenForConfig,
  resolveEveningConfigForDay,
  type EveningQuestionnaireConfig,
} from './eveningQuestionnaireConfig.js';
import { getMoscowParts, resolveEffectiveCurrentDay } from './timePhase.js';

type EveningSettings = {
  currentDay?: number | null;
  totalDays?: number | null;
  startDate?: Date | null;
  eveningQuestionnaireByDay?: unknown;
  eveningQuestionnaireConfig?: EveningQuestionnaireConfig | null;
};

/**
 * Pure day picker for итоговая анкета.
 * While previous day's evening window is still open and not completed,
 * keep attributing answers to that forum day (even after clock rolled to D+1).
 */
export function pickEveningSurveyDay(
  effectiveDay: number,
  opts: {
    previousDayOpen: boolean;
    previousDayCompleted: boolean;
    now?: Date;
  },
): number {
  if (effectiveDay <= 1) return 1;
  const prev = effectiveDay - 1;
  if (opts.previousDayOpen && !opts.previousDayCompleted) return prev;

  // Overnight wrap 00:00–01:00 MSK without completion flag: still previous day
  const now = opts.now ?? new Date();
  const { totalMinutes } = getMoscowParts(now);
  if (totalMinutes < 60 && opts.previousDayOpen) return prev;

  return effectiveDay;
}

/** Forum day that evening questionnaire answers belong to for this participant. */
export async function resolveEveningSurveyDayForParticipant(
  participantId: number,
  settings: EveningSettings,
  now = new Date(),
): Promise<number> {
  const effective = resolveEffectiveCurrentDay(settings, now);
  if (effective <= 1) return 1;

  const prev = effective - 1;
  const prevConfig = resolveEveningConfigForDay(settings as never, prev);
  const previousDayOpen = isEveningOpenForConfig(prevConfig, now);

  let previousDayCompleted = false;
  if (previousDayOpen) {
    const [prevState] = await db.select({
      eveningRatings: participantDayState.eveningRatings,
    })
      .from(participantDayState)
      .where(and(
        eq(participantDayState.participantId, participantId),
        eq(participantDayState.dayNumber, prev),
      ))
      .limit(1);
    previousDayCompleted = !!(
      prevState?.eveningRatings
      && typeof prevState.eveningRatings === 'object'
    );
  }

  return pickEveningSurveyDay(effective, {
    previousDayOpen,
    previousDayCompleted,
    now,
  });
}
