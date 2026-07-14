import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pointsLog, levelsConfig, participants } from '../db/schema.js';

type PointTrack = 'path' | 'experience';

const PATH_ACTIONS = new Set([
  'question_answer',
  'evening_complete',
  'piggybank_idea',
  'piggybank_thought',
  'piggybank_question',
]);
const EXP_ACTIONS = new Set(['task_complete', 'exchange_question', 'exchange_answer', 'piggybank_entry']);

const DEFAULT_THRESHOLDS = [0, 100, 250, 500, 1000];

export async function awardPoints(
  participantId: number,
  actionType: string,
  overridePoints?: number
): Promise<{ awarded: number; track: PointTrack } | null> {
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

  await db.insert(pointsLog).values({ participantId, actionType, points });

  const track: PointTrack = PATH_ACTIONS.has(actionType) ? 'path' : 'experience';

  if (track === 'path') {
    await db.update(participants)
      .set({ pathPoints: sql`${participants.pathPoints} + ${points}` })
      .where(eq(participants.id, participantId));
  } else {
    await db.update(participants)
      .set({ experiencePoints: sql`${participants.experiencePoints} + ${points}` })
      .where(eq(participants.id, participantId));
  }

  return { awarded: points, track };
}

export async function getLevelThresholds(track: PointTrack): Promise<number[]> {
  const actionType = track === 'path' ? 'path_level' : 'exp_level';
  const [config] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType)).limit(1);
  const thresholds = config?.levelThresholds as number[] | null;
  return thresholds?.length ? thresholds : DEFAULT_THRESHOLDS;
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
