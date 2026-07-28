import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, participants, pointsLog, questions, taskSubmissions, tasks,
} from '../db/schema.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import {
  findTouchpointQuestionForSlot,
  isTouchpointQuestionForForumDay,
} from './touchpointProgress.js';
import { awardPoints, getLevel, type PointTrack } from './pointsService.js';
import { sendPushNotification } from './pushService.js';
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

async function touchpointsDoneForDay(participantId: number, dayNumber: number): Promise<boolean> {
  const published = await db.select().from(questions).where(eq(questions.status, 'published'));
  const dayQs = published.filter(q => isTouchpointQuestionForForumDay(q, dayNumber));
  if (dayQs.length === 0) return false;

  const ans = await db.select({ questionId: answers.questionId }).from(answers)
    .where(eq(answers.participantId, participantId));
  const answered = new Set(ans.map(a => a.questionId));
  return TOUCHPOINT_SLOTS.every(slot => {
    const q = findTouchpointQuestionForSlot(dayQs, slot);
    return q != null && answered.has(q.id);
  });
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
): Promise<void> {
  const rule = rules?.get('day_complete_bonus') ?? await getBonusRuleByCode('day_complete_bonus');
  if (!bonusRuleEnabled(rule)) return;
  if (dayNumber < 1 || dayNumber > 7) return;
  if (!(await touchpointsDoneForDay(participantId, dayNumber))) return;
  const actionType = bonusPointsActionType(rule, 'day_complete_bonus');
  if (await hasBonusForDay(participantId, actionType, dayNumber)) return;
  await awardPoints(participantId, actionType, undefined, dayNumber);
}

async function distinctActiveForumDays(participantId: number): Promise<number[]> {
  const rows = await db.select({ forumDay: pointsLog.forumDay })
    .from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.forumDay} IS NOT NULL`,
    ));
  const set = new Set(rows.map(r => r.forumDay).filter((d): d is number => d != null));
  return [...set].sort((a, b) => a - b);
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
): Promise<void> {
  const rule = rules?.get('reflection_streak_7') ?? await getBonusRuleByCode('reflection_streak_7');
  if (!bonusRuleEnabled(rule)) return;
  const minDays = bonusParamInt(rule?.params as Record<string, unknown>, 'minDays', 7);
  const streak = longestConsecutiveRun(await reflectionDays(participantId));
  if (streak < minDays) return;
  const actionType = bonusPointsActionType(rule, 'reflection_streak_7');
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return;
  await awardPoints(participantId, actionType);
}

export async function tryRegularityBonus(
  participantId: number,
  rules?: Map<string, BonusRuleRow>,
): Promise<void> {
  const rule = rules?.get('bonus_regularity') ?? await getBonusRuleByCode('bonus_regularity');
  if (!bonusRuleEnabled(rule)) return;
  const minStreak = bonusParamInt(rule?.params as Record<string, unknown>, 'minStreak', 6);
  const streak = longestConsecutiveRun(await distinctActiveForumDays(participantId));
  if (streak < minStreak) return;
  const actionType = bonusPointsActionType(rule, 'bonus_regularity');
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return;
  await awardPoints(participantId, actionType);
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
): Promise<void> {
  const rule = rules?.get('bonus_diversity') ?? await getBonusRuleByCode('bonus_diversity');
  if (!bonusRuleEnabled(rule)) return;
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
  if (buckets.size < minCategories) return;
  const actionType = bonusPointsActionType(rule, 'bonus_diversity');
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return;
  await awardPoints(participantId, actionType);
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
  await sendPushNotification(
    [participantId],
    `Новый уровень ${label}: ${levelAfter}!`,
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
  if (awarded <= 0) return;

  const [p] = await db.select({
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return;

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

  const rulesMap = await loadBonusRulesByCode();
  const day = opts?.forumDay;
  if (day != null && opts?.actionType && PATH_ACTIVITY_ACTIONS.has(opts.actionType)) {
    await tryDayCompleteBonus(participantId, day, rulesMap);
  }
  await tryReflectionStreakBonus(participantId, rulesMap);
  await tryRegularityBonus(participantId, rulesMap);
  await tryDiversityBonus(participantId, rulesMap);
}
