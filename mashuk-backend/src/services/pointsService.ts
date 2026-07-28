import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pointsLog, levelsConfig, participants } from '../db/schema.js';
import { env } from '../config/env.js';

export type PointTrack = 'path' | 'experience';

const PATH_ACTIONS = new Set([
  'question_answer',
  'evening_complete',
  'piggybank_idea',
  'piggybank_thought',
  'piggybank_question',
  'attendance',
  'point_a_complete',
  'point_b_complete',
  'exchange_question',
  'exchange_answer',
  'state_check_morning',
  'state_check_day',
  'state_check_evening',
  'day_complete_bonus',
  'reflection_streak_7',
]);

const BONUS_ACTIONS = new Set(['bonus_regularity', 'bonus_diversity']);

const EXP_ACTIONS = new Set(['task_complete', 'piggybank_entry', 'admin_manual_experience', 'admin_manual_task']);

export function pointsTrackForAction(actionType: string): PointTrack | 'bonus' {
  if (actionType === 'admin_manual_path') return 'path';
  if (actionType === 'admin_manual_experience') return 'experience';
  if (actionType === 'admin_manual_deduct_path') return 'path';
  if (actionType === 'admin_manual_deduct_experience') return 'experience';
  if (BONUS_ACTIONS.has(actionType)) return 'bonus';
  return PATH_ACTIONS.has(actionType) ? 'path' : 'experience';
}

const DEFAULT_THRESHOLDS = [0, 100, 250, 500, 1000];

export async function awardPoints(
  participantId: number,
  actionType: string,
  overridePoints?: number,
  forumDay?: number,
): Promise<{ awarded: number; track: PointTrack | 'bonus' } | null> {
  const [config] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType)).limit(1);
  const points = overridePoints ?? config?.pointsPerUnit ?? 0;
  if (points <= 0) return null;

  if (config?.maxAccruals) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pointsLog)
      .where(and(eq(pointsLog.participantId, participantId), eq(pointsLog.actionType, actionType)));
    if (count >= config.maxAccruals) return null;
  }

  const [beforeRow] = await db.select({
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  const pointsBefore = {
    path: beforeRow?.pathPoints ?? 0,
    experience: beforeRow?.experiencePoints ?? 0,
  };

  await db.insert(pointsLog).values({
    participantId,
    actionType,
    points,
    forumDay: forumDay ?? null,
  });

  const track = pointsTrackForAction(actionType);

  if (track === 'path') {
    await db.update(participants)
      .set({ pathPoints: sql`${participants.pathPoints} + ${points}` })
      .where(eq(participants.id, participantId));
  } else if (track === 'bonus') {
    await db.update(participants)
      .set({ bonusPoints: sql`${participants.bonusPoints} + ${points}` })
      .where(eq(participants.id, participantId));
  } else {
    await db.update(participants)
      .set({ experiencePoints: sql`${participants.experiencePoints} + ${points}` })
      .where(eq(participants.id, participantId));
  }

  const { afterPointsAwarded } = await import('./ratingBonusesService.js');
  await afterPointsAwarded(participantId, track, points, pointsBefore, {
    forumDay,
    actionType,
  });

  await syncForumPoints(participantId);

  return { awarded: points, track };
}

export function totalRatingScore(path: number, experience: number, bonus: number): number {
  return path + experience + bonus;
}

export function isUnifiedRatingEnabled(): boolean {
  return env.UNIFIED_RATING;
}

export function participantRatingScore(p: {
  pathPoints?: number | null;
  experiencePoints?: number | null;
  bonusPoints?: number | null;
  forumPoints?: number | null;
}): number {
  if (isUnifiedRatingEnabled()) {
    if (p.forumPoints != null) return p.forumPoints;
    return totalRatingScore(p.pathPoints ?? 0, p.experiencePoints ?? 0, p.bonusPoints ?? 0);
  }
  return totalRatingScore(p.pathPoints ?? 0, p.experiencePoints ?? 0, p.bonusPoints ?? 0);
}

export async function syncForumPoints(participantId: number): Promise<void> {
  if (!isUnifiedRatingEnabled()) return;
  const [row] = await db.select({
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!row) return;
  const total = totalRatingScore(row.pathPoints ?? 0, row.experiencePoints ?? 0, row.bonusPoints ?? 0);
  await db.update(participants)
    .set({ forumPoints: total })
    .where(eq(participants.id, participantId));
}

export async function getLevelThresholds(track: PointTrack): Promise<number[]> {
  const actionType = track === 'path' ? 'path_level' : 'exp_level';
  const [config] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType)).limit(1);
  const { normalizeLevelThresholds } = await import('./ratingRecalcService.js');
  return normalizeLevelThresholds(config?.levelThresholds);
}

export async function getLevel(points: number, track: PointTrack = 'path'): Promise<number> {
  const thresholds = await getLevelThresholds(track);
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (points >= thresholds[i]) level = i + 1;
  }
  return level;
}

/** Progress 0..1 within current level toward next threshold */
export async function getLevelProgress(points: number, track: PointTrack = 'path'): Promise<{
  level: number;
  progress: number;
  currentFloor: number;
  nextThreshold: number | null;
}> {
  const thresholds = await getLevelThresholds(track);
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (points >= thresholds[i]) level = i + 1;
  }
  const floorIdx = Math.max(0, level - 1);
  const currentFloor = thresholds[floorIdx] ?? 0;
  const nextThreshold = level < thresholds.length ? thresholds[level] : null;
  if (nextThreshold == null || nextThreshold <= currentFloor) {
    return { level, progress: 1, currentFloor, nextThreshold: null };
  }
  const progress = Math.min(1, Math.max(0, (points - currentFloor) / (nextThreshold - currentFloor)));
  return { level, progress, currentFloor, nextThreshold };
}

export function getLevelSync(points: number, thresholds: number[] = DEFAULT_THRESHOLDS): number {
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (points >= thresholds[i]) level = i + 1;
  }
  return level;
}


export async function revokePointsLogEntry(
  logId: number,
  participantId: number,
  reason: string,
): Promise<{ ok: true; reversalId: number } | { ok: false; error: string }> {
  const [row] = await db.select().from(pointsLog).where(eq(pointsLog.id, logId)).limit(1);
  if (!row || row.participantId !== participantId) {
    return { ok: false, error: 'Not found' };
  }
  if (row.revokedAt) {
    return { ok: false, error: 'Already revoked' };
  }
  if (row.points <= 0) {
    return { ok: false, error: 'Cannot revoke non-positive entry' };
  }

  const track = pointsTrackForAction(row.actionType || '');
  const neg = -row.points;

  const [reversal] = await db.insert(pointsLog).values({
    participantId,
    actionType: `${row.actionType}_revoke`,
    points: neg,
    relatedLogId: logId,
    revokeReason: reason,
  }).returning();

  await db.update(pointsLog)
    .set({ revokedAt: new Date(), revokeReason: reason, relatedLogId: reversal.id })
    .where(eq(pointsLog.id, logId));

  if (track === 'path') {
    await db.update(participants)
      .set({ pathPoints: sql`GREATEST(0, ${participants.pathPoints} + ${neg})` })
      .where(eq(participants.id, participantId));
  } else if (track === 'bonus') {
    await db.update(participants)
      .set({ bonusPoints: sql`GREATEST(0, ${participants.bonusPoints} + ${neg})` })
      .where(eq(participants.id, participantId));
  } else {
    await db.update(participants)
      .set({ experiencePoints: sql`GREATEST(0, ${participants.experiencePoints} + ${neg})` })
      .where(eq(participants.id, participantId));
  }

  await syncForumPoints(participantId);

  return { ok: true, reversalId: reversal.id };
}
