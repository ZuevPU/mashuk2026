import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  answers, participants, pointsLog, questions, taskSubmissions, tasks,
} from '../db/schema.js';
import { TOUCHPOINT_SLOTS } from './touchpointTemplates.js';
import { awardPoints, getLevel, type PointTrack } from './pointsService.js';
import { sendPushNotification } from './pushService.js';

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

const slotTitles = new Set(TOUCHPOINT_SLOTS.map(s => s.title));

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

async function touchpointsDoneForDay(participantId: number, dayNumber: number): Promise<boolean> {
  const dayQs = await db.select().from(questions).where(and(
    eq(questions.status, 'published'),
    eq(questions.dayNumber, dayNumber),
  ));
  const touchQs = dayQs.filter(q => slotTitles.has(q.title));
  if (touchQs.length < TOUCHPOINT_SLOTS.length) return false;

  const ans = await db.select({ questionId: answers.questionId }).from(answers)
    .where(eq(answers.participantId, participantId));
  const answered = new Set(ans.map(a => a.questionId));
  return touchQs.every(q => answered.has(q.id));
}

export async function tryDayCompleteBonus(participantId: number, dayNumber: number): Promise<void> {
  if (dayNumber < 1 || dayNumber > 7) return;
  if (!(await touchpointsDoneForDay(participantId, dayNumber))) return;
  if (await hasBonusForDay(participantId, 'day_complete_bonus', dayNumber)) return;
  await awardPoints(participantId, 'day_complete_bonus', undefined, dayNumber);
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

export async function tryReflectionStreakBonus(participantId: number): Promise<void> {
  const streak = longestConsecutiveRun(await reflectionDays(participantId));
  if (streak < 7) return;
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, 'reflection_streak_7'),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return;
  await awardPoints(participantId, 'reflection_streak_7');
}

export async function tryRegularityBonus(participantId: number): Promise<void> {
  const streak = longestConsecutiveRun(await distinctActiveForumDays(participantId));
  if (streak < 6) return;
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, 'bonus_regularity'),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return;
  await awardPoints(participantId, 'bonus_regularity');
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

export async function tryDiversityBonus(participantId: number): Promise<void> {
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
  if (buckets.size < 4) return;
  const [existing] = await db.select({ id: pointsLog.id }).from(pointsLog)
    .where(and(
      eq(pointsLog.participantId, participantId),
      eq(pointsLog.actionType, 'bonus_diversity'),
      isNull(pointsLog.revokedAt),
    )).limit(1);
  if (existing) return;
  await awardPoints(participantId, 'bonus_diversity');
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

  const day = opts?.forumDay;
  if (day != null && opts?.actionType && PATH_ACTIVITY_ACTIONS.has(opts.actionType)) {
    await tryDayCompleteBonus(participantId, day);
  }
  await tryReflectionStreakBonus(participantId);
  await tryRegularityBonus(participantId);
  await tryDiversityBonus(participantId);
}
