import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, levelsConfig, participantDayState, participants, pointsLog, questions, taskSubmissions, tasks,
} from '../db/schema.js';
import {
  isTouchpointQuestionForForumDay,
  touchpointCompletionRatio,
} from './touchpointProgress.js';
import { awardPoints, getLevel, type PointTrack } from './pointsService.js';
import { sendPushNotification } from './pushService.js';
import { getForumSettings } from './helpers.js';
import {
  bonusParamInt,
  bonusPointsActionType,
  bonusRuleEnabled,
  getBonusRuleByCode,
  loadBonusRulesByCode,
  type BonusRuleRow,
} from './ratingBonusRulesConfig.js';

const PATH_ACTIVITY_ACTIONS = new Set([
  'question_answer',
  'evening_complete',
  'state_check_morning',
  'state_check_day',
  'state_check_evening',
  'point_a_complete',
  'point_b_complete',
  'exchange_question',
  'exchange_answer',
  'day_complete_bonus',
]);

const TARGET_DAY_COMPLETE_POINTS = 25;
const TARGET_REGULARITY_POINTS = 60;

async function forumDayCap(): Promise<number> {
  const settings = await getForumSettings();
  const total = Number(settings?.totalDays) || 8;
  return Math.min(Math.max(1, total), 14);
}

type QRow = typeof questions.$inferSelect;

async function loadPublishedQuestions(): Promise<QRow[]> {
  return db.select().from(questions).where(eq(questions.status, 'published'));
}

async function touchpointsDoneForDay(
  participantId: number,
  dayNumber: number,
  published?: QRow[],
  answeredIds?: Set<number>,
  eveningDoneDays?: Set<number>,
): Promise<boolean> {
  const allQs = published ?? await loadPublishedQuestions();
  const dayQs = allQs.filter(q => isTouchpointQuestionForForumDay(q, dayNumber));
  if (dayQs.length === 0) return false;

  let answered = answeredIds;
  if (!answered) {
    const ans = await db.select({ questionId: answers.questionId }).from(answers)
      .where(eq(answers.participantId, participantId));
    answered = new Set(ans.map(a => a.questionId));
  }

  let eveningDone = eveningDoneDays?.has(dayNumber) === true;
  if (eveningDoneDays == null) {
    const [dayState] = await db.select({
      eveningRatings: participantDayState.eveningRatings,
    }).from(participantDayState).where(and(
      eq(participantDayState.participantId, participantId),
      eq(participantDayState.dayNumber, dayNumber),
    )).limit(1);
    eveningDone = !!(
      dayState?.eveningRatings
      && typeof dayState.eveningRatings === 'object'
    );
  }

  const { completed, expected } = touchpointCompletionRatio(dayQs, answered, dayNumber, {
    eveningDone,
  });
  return expected > 0 && completed >= expected;
}

async function hasBonusForDay(
  participantId: number,
  actionType: string,
  forumDay: number,
): Promise<boolean> {
  const [row] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      eq(pointsLog.forumDay, forumDay),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  return !!row;
}

export async function tryDayCompleteBonus(
  participantId: number,
  dayNumber: number,
  rules?: Map<string, BonusRuleRow>,
  ctx?: {
    published?: QRow[];
    answeredIds?: Set<number>;
    eveningDoneDays?: Set<number>;
    maxDay?: number;
  },
): Promise<boolean> {
  const rule = rules?.get('day_complete_bonus') ?? await getBonusRuleByCode('day_complete_bonus');
  if (!bonusRuleEnabled(rule)) return false;
  const maxDay = ctx?.maxDay ?? await forumDayCap();
  if (dayNumber < 1 || dayNumber > maxDay) return false;
  if (!(await touchpointsDoneForDay(
    participantId,
    dayNumber,
    ctx?.published,
    ctx?.answeredIds,
    ctx?.eveningDoneDays,
  ))) return false;
  const actionType = bonusPointsActionType(rule, 'day_complete_bonus');
  if (await hasBonusForDay(participantId, actionType, dayNumber)) return false;
  const awarded = await awardPoints(participantId, actionType, undefined, dayNumber);
  return !!awarded && awarded.awarded > 0;
}

async function fullTouchpointForumDays(
  participantId: number,
  dayCompleteActionType: string,
  ctx?: {
    published?: QRow[];
    answeredIds?: Set<number>;
    eveningDoneDays?: Set<number>;
    maxDay?: number;
  },
): Promise<number[]> {
  // Уже начисленные бонусы «полный день» — быстрый путь
  const rows = await db.select({ forumDay: pointsLog.forumDay })
    .from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, dayCompleteActionType),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.forumDay} IS NOT NULL`,
    ));
  const fromBonus = new Set(
    rows.map(r => r.forumDay).filter((d): d is number => d != null && d >= 1),
  );

  const maxDay = ctx?.maxDay ?? await forumDayCap();
  for (let d = 1; d <= maxDay; d++) {
    if (fromBonus.has(d)) continue;
    if (await touchpointsDoneForDay(
      participantId,
      d,
      ctx?.published,
      ctx?.answeredIds,
      ctx?.eveningDoneDays,
    )) fromBonus.add(d);
  }
  return [...fromBonus].sort((a, b) => a - b);
}

function longestConsecutiveRun(days: number[]): number {
  if (days.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else if (days[i] !== days[i - 1]) {
      cur = 1;
    }
  }
  return best;
}

async function reflectionDays(participantId: number): Promise<number[]> {
  const rows = await db.select({ forumDay: pointsLog.forumDay, actionType: pointsLog.actionType })
    .from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.forumDay} IS NOT NULL`,
    ));
  const days = new Set<number>();
  for (const r of rows) {
    if (r.forumDay != null && r.actionType && PATH_ACTIVITY_ACTIONS.has(r.actionType)) {
      days.add(r.forumDay);
    }
  }
  return [...days].sort((a, b) => a - b);
}

export async function tryReflectionStreakBonus(
  participantId: number,
  rules?: Map<string, BonusRuleRow>,
): Promise<boolean> {
  const rule = rules?.get('reflection_streak_7') ?? await getBonusRuleByCode('reflection_streak_7');
  if (!bonusRuleEnabled(rule)) return false;
  const minDays = bonusParamInt(rule?.params as Record<string, unknown>, 'minDays', 7);
  const streak = longestConsecutiveRun(await reflectionDays(participantId));
  if (streak < minDays) return false;
  const actionType = bonusPointsActionType(rule, 'reflection_streak_7');
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return false;
  const awarded = await awardPoints(participantId, actionType);
  return !!awarded && awarded.awarded > 0;
}

/**
 * Бонус регулярности: N дней подряд с закрытыми всеми точками дня
 * (не любая активность, а полный день).
 */
export async function tryRegularityBonus(
  participantId: number,
  rules?: Map<string, BonusRuleRow>,
  ctx?: {
    published?: QRow[];
    answeredIds?: Set<number>;
    eveningDoneDays?: Set<number>;
    maxDay?: number;
  },
): Promise<boolean> {
  const rule = rules?.get('bonus_regularity') ?? await getBonusRuleByCode('bonus_regularity');
  if (!bonusRuleEnabled(rule)) return false;
  const minStreak = bonusParamInt(rule?.params as Record<string, unknown>, 'minStreak', 6);
  const dayCompleteAction = bonusPointsActionType(
    rules?.get('day_complete_bonus') ?? await getBonusRuleByCode('day_complete_bonus'),
    'day_complete_bonus',
  );
  const streak = longestConsecutiveRun(
    await fullTouchpointForumDays(participantId, dayCompleteAction, ctx),
  );
  if (streak < minStreak) return false;
  const actionType = bonusPointsActionType(rule, 'bonus_regularity');
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return false;
  const awarded = await awardPoints(participantId, actionType);
  return !!awarded && awarded.awarded > 0;
}

const DIVERSITY_BUCKETS = [
  'образован', 'культур', 'спорт', 'знаком', 'общен', 'групп', 'команд',
  'креатив', 'медиа', 'волонт', 'организ', 'выезд', 'инсайт',
];

function categoryBucket(category: string | null | undefined): string | null {
  const c = (category || '').toLowerCase();
  if (!c) return null;
  for (const b of DIVERSITY_BUCKETS) {
    if (c.includes(b)) return b;
  }
  return c.slice(0, 24);
}

export async function tryDiversityBonus(
  participantId: number,
  rules?: Map<string, BonusRuleRow>,
): Promise<boolean> {
  const rule = rules?.get('bonus_diversity') ?? await getBonusRuleByCode('bonus_diversity');
  if (!bonusRuleEnabled(rule)) return false;
  const minCategories = bonusParamInt(rule?.params as Record<string, unknown>, 'minCategories', 4);
  const rows = await db.select({ category: tasks.category })
    .from(taskSubmissions)
    .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
    .where(and(
      eq(taskSubmissions.participantId, participantId),
      eq(taskSubmissions.status, 'approved'),
    ));
  const buckets = new Set<string>();
  for (const r of rows) {
    const b = categoryBucket(r.category);
    if (b) buckets.add(b);
  }
  if (buckets.size < minCategories) return false;
  const actionType = bonusPointsActionType(rule, 'bonus_diversity');
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return false;
  const awarded = await awardPoints(participantId, actionType);
  return !!awarded && awarded.awarded > 0;
}

async function notifyLevelUpIfNeeded(
  participantId: number,
  track: PointTrack,
  pointsBefore: number,
  pointsAfter: number,
): Promise<void> {
  const levelBefore = await getLevel(pointsBefore, track);
  const levelAfter = await getLevel(pointsAfter, track);
  if (levelAfter <= levelBefore) return;
  const label = track === 'path' ? 'Пути' : 'Опыта';
  const { pushCopy } = await import('./pushCopy.js');
  await sendPushNotification(
    [participantId],
    pushCopy.levelUp(label, levelAfter),
    'transactional_level_up',
  ).catch(() => undefined);
}

export async function afterPointsAwarded(
  participantId: number,
  track: PointTrack | 'bonus',
  awarded: number,
  pointsBefore: { path: number; experience: number },
  opts?: { forumDay?: number; actionType?: string },
): Promise<void> {
  if (awarded > 0) {
    const [p] = await db.select({
      pathPoints: participants.pathPoints,
      experiencePoints: participants.experiencePoints,
    }).from(participants).where(eq(participants.id, participantId)).limit(1);
    if (p) {
      if (track === 'path') {
        await notifyLevelUpIfNeeded(participantId, 'path', pointsBefore.path, p.pathPoints ?? 0);
      } else if (track === 'experience') {
        await notifyLevelUpIfNeeded(
          participantId,
          'experience',
          pointsBefore.experience,
          p.experiencePoints ?? 0,
        );
      }
    }
  }

  const action = opts?.actionType || '';
  // Не перезапускать начисление того же бонуса; после «полного дня» — проверить серии.
  if (
    action === 'bonus_regularity'
    || action === 'bonus_diversity'
    || action === 'reflection_streak_7'
  ) {
    return;
  }

  const rulesMap = await loadBonusRulesByCode();
  if (action === 'day_complete_bonus') {
    await tryReflectionStreakBonus(participantId, rulesMap);
    await tryRegularityBonus(participantId, rulesMap);
    return;
  }

  const day = opts?.forumDay;
  if (day != null && action && PATH_ACTIVITY_ACTIONS.has(action)) {
    await tryDayCompleteBonus(participantId, day, rulesMap);
  }
  await tryReflectionStreakBonus(participantId, rulesMap);
  await tryRegularityBonus(participantId, rulesMap);
  await tryDiversityBonus(participantId, rulesMap);
}

/** Синхронизировать тарифы бонусов в levels_config (25 / 60). */
export async function ensureBonusPointsRates(): Promise<void> {
  const pairs: Array<{ actionType: string; points: number; maxAccruals: number; displayName: string; track: string }> = [
    {
      actionType: 'day_complete_bonus',
      points: TARGET_DAY_COMPLETE_POINTS,
      maxAccruals: 8,
      displayName: 'Бонус за полный день (все точки)',
      track: 'path',
    },
    {
      actionType: 'bonus_regularity',
      points: TARGET_REGULARITY_POINTS,
      maxAccruals: 1,
      displayName: 'Бонус регулярности (6+ полных дней)',
      track: 'bonus',
    },
  ];
  for (const item of pairs) {
    const [existing] = await db.select().from(levelsConfig)
      .where(eq(levelsConfig.actionType, item.actionType)).limit(1);
    if (existing) {
      await db.update(levelsConfig).set({
        pointsPerUnit: item.points,
        maxAccruals: item.maxAccruals,
        displayName: item.displayName,
        track: item.track,
      }).where(eq(levelsConfig.id, existing.id));
    } else {
      await db.insert(levelsConfig).values({
        actionType: item.actionType,
        pointsPerUnit: item.points,
        maxAccruals: item.maxAccruals,
        displayName: item.displayName,
        track: item.track,
      });
    }
  }
}

/** Подтянуть сумму в уже выданных строках журнала под актуальный тариф. */
async function normalizeExistingBonusLogAmounts(): Promise<{ dayCompleteFixed: number; regularityFixed: number }> {
  const dayCompleteFixed = await db.update(pointsLog)
    .set({ points: TARGET_DAY_COMPLETE_POINTS })
    .where(and(
      eq(pointsLog.actionType, 'day_complete_bonus'),
      isNull(pointsLog.revokedAt),
      ne(pointsLog.points, TARGET_DAY_COMPLETE_POINTS),
      sql`${pointsLog.points} > 0`,
    ))
    .returning({ id: pointsLog.id });

  const regularityFixed = await db.update(pointsLog)
    .set({ points: TARGET_REGULARITY_POINTS })
    .where(and(
      eq(pointsLog.actionType, 'bonus_regularity'),
      isNull(pointsLog.revokedAt),
      ne(pointsLog.points, TARGET_REGULARITY_POINTS),
      sql`${pointsLog.points} > 0`,
    ))
    .returning({ id: pointsLog.id });

  return {
    dayCompleteFixed: dayCompleteFixed.length,
    regularityFixed: regularityFixed.length,
  };
}

export type BonusBackfillResult = {
  participantsProcessed: number;
  dayCompleteAwarded: number;
  regularityAwarded: number;
  dayCompleteAmountFixed: number;
  regularityAmountFixed: number;
};

/**
 * Пересчитать бонусы: начислить «полный день» тем, кто закрыл все точки,
 * и «регулярность 6 дней» при серии полных дней. Затем пересобрать суммы.
 */
export async function backfillRatingBonusesForAll(): Promise<BonusBackfillResult> {
  await ensureBonusPointsRates();
  const amountFix = await normalizeExistingBonusLogAmounts();

  const rulesMap = await loadBonusRulesByCode();
  const maxDay = await forumDayCap();
  const published = await loadPublishedQuestions();
  const allParticipants = await db.select({ id: participants.id }).from(participants);

  let dayCompleteAwarded = 0;
  let regularityAwarded = 0;

  for (const { id } of allParticipants) {
    const ans = await db.select({ questionId: answers.questionId }).from(answers)
      .where(eq(answers.participantId, id));
    const answeredIds = new Set(ans.map(a => a.questionId));
    const eveningRows = await db.select({
      dayNumber: participantDayState.dayNumber,
      eveningRatings: participantDayState.eveningRatings,
    }).from(participantDayState).where(eq(participantDayState.participantId, id));
    const eveningDoneDays = new Set(
      eveningRows
        .filter(r => r.eveningRatings && typeof r.eveningRatings === 'object')
        .map(r => r.dayNumber),
    );
    const ctx = { published, answeredIds, eveningDoneDays, maxDay };

    for (let d = 1; d <= maxDay; d++) {
      if (await tryDayCompleteBonus(id, d, rulesMap, ctx)) dayCompleteAwarded += 1;
    }
    if (await tryRegularityBonus(id, rulesMap, ctx)) regularityAwarded += 1;
    await tryReflectionStreakBonus(id, rulesMap);
    await tryDiversityBonus(id, rulesMap);
  }

  return {
    participantsProcessed: allParticipants.length,
    dayCompleteAwarded,
    regularityAwarded,
    dayCompleteAmountFixed: amountFix.dayCompleteFixed,
    regularityAmountFixed: amountFix.regularityFixed,
  };
}

/** Точечный пересчёт бонусов одного участника (карточка / отладка). */
export async function backfillRatingBonusesForParticipant(participantId: number): Promise<{
  dayCompleteAwarded: number;
  regularityAwarded: boolean;
}> {
  await ensureBonusPointsRates();
  const rulesMap = await loadBonusRulesByCode();
  const maxDay = await forumDayCap();
  const published = await loadPublishedQuestions();
  const ans = await db.select({ questionId: answers.questionId }).from(answers)
    .where(eq(answers.participantId, participantId));
  const answeredIds = new Set(ans.map(a => a.questionId));
  const eveningRows = await db.select({
    dayNumber: participantDayState.dayNumber,
    eveningRatings: participantDayState.eveningRatings,
  }).from(participantDayState).where(eq(participantDayState.participantId, participantId));
  const eveningDoneDays = new Set(
    eveningRows
      .filter(r => r.eveningRatings && typeof r.eveningRatings === 'object')
      .map(r => r.dayNumber),
  );
  const ctx = { published, answeredIds, eveningDoneDays, maxDay };
  let dayCompleteAwarded = 0;
  for (let d = 1; d <= maxDay; d++) {
    if (await tryDayCompleteBonus(participantId, d, rulesMap, ctx)) dayCompleteAwarded += 1;
  }
  const regularityAwarded = await tryRegularityBonus(participantId, rulesMap, ctx);
  await tryReflectionStreakBonus(participantId, rulesMap);
  await tryDiversityBonus(participantId, rulesMap);
  const { recalculateParticipantTotals } = await import('./pointsService.js');
  await recalculateParticipantTotals(participantId);
  return { dayCompleteAwarded, regularityAwarded };
}
