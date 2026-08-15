import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { levelsConfig, questions } from '../db/schema.js';
import { pointsActionForQuestion } from './pointsService.js';

export const QUESTION_STAKE_ACTIONS = new Set([
  'state_check_morning',
  'state_check_day',
  'state_check_evening',
  'question_answer',
  'point_b_complete',
]);

/** Most common points value; on a tie prefer the higher stake. */
export function pickStakeFromQuestionPoints(values: number[]): number | null {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return null;
  const counts = new Map<number, number>();
  for (const v of nums) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export function overlayCatalogStakes<T extends { actionType: string; pointsPerUnit: number }>(
  catalog: T[],
  fromQuestions: Map<string, number>,
): T[] {
  return catalog.map(row => {
    const qPts = fromQuestions.get(row.actionType);
    if (qPts == null) return row;
    return { ...row, pointsPerUnit: qPts };
  });
}

export async function stakesFromQuestions(shiftId: number): Promise<Map<string, number>> {
  const rows = await db.select({
    points: questions.points,
    block: questions.block,
    reflectionKind: questions.reflectionKind,
    questionKind: questions.questionKind,
    type: questions.type,
    timePoint: questions.timePoint,
    title: questions.title,
    isHidden: questions.isHidden,
    status: questions.status,
  }).from(questions).where(eq(questions.shiftId, shiftId));

  const byAction = new Map<string, number[]>();
  for (const q of rows) {
    if (q.isHidden || q.status === 'archived') continue;
    const action = pointsActionForQuestion(q);
    if (!QUESTION_STAKE_ACTIONS.has(action)) continue;
    if (typeof q.points !== 'number') continue;
    const list = byAction.get(action) ?? [];
    list.push(q.points);
    byAction.set(action, list);
  }

  const out = new Map<string, number>();
  for (const [action, values] of byAction) {
    const picked = pickStakeFromQuestionPoints(values);
    if (picked != null) out.set(action, picked);
  }
  return out;
}

export async function upsertLevelsStake(
  shiftId: number,
  actionType: string,
  pointsPerUnit: number,
): Promise<void> {
  const [existing] = await db.select({ id: levelsConfig.id })
    .from(levelsConfig)
    .where(and(eq(levelsConfig.actionType, actionType), eq(levelsConfig.shiftId, shiftId)))
    .limit(1);
  if (existing) {
    await db.update(levelsConfig)
      .set({ pointsPerUnit })
      .where(eq(levelsConfig.id, existing.id));
    return;
  }
  await db.insert(levelsConfig).values({
    actionType,
    pointsPerUnit,
    shiftId,
  });
}

export async function syncQuestionPointsToLevels(question: {
  shiftId?: number | null;
  points?: number | null;
  block?: string | null;
  reflectionKind?: string | null;
  questionKind?: string | null;
  type?: string | null;
  timePoint?: string | null;
  title?: string | null;
}): Promise<void> {
  const shiftId = question.shiftId;
  if (shiftId == null || typeof question.points !== 'number') return;
  const action = pointsActionForQuestion(question);
  if (!QUESTION_STAKE_ACTIONS.has(action)) return;
  await upsertLevelsStake(shiftId, action, question.points);
}

export async function syncLevelsStakesToQuestions(
  shiftId: number,
  items: Array<{ actionType?: string; pointsPerUnit?: number | null }>,
): Promise<number> {
  const wanted = new Map<string, number>();
  for (const item of items) {
    if (!item.actionType || !QUESTION_STAKE_ACTIONS.has(item.actionType)) continue;
    if (typeof item.pointsPerUnit !== 'number' || !Number.isFinite(item.pointsPerUnit)) continue;
    wanted.set(item.actionType, Math.round(item.pointsPerUnit));
  }
  if (!wanted.size) return 0;

  const rows = await db.select().from(questions).where(eq(questions.shiftId, shiftId));
  const byPoints = new Map<number, number[]>();
  for (const q of rows) {
    if (q.isHidden || q.status === 'archived') continue;
    const action = pointsActionForQuestion(q);
    if (!wanted.has(action)) continue;
    const pts = wanted.get(action)!;
    if (q.points === pts) continue;
    const list = byPoints.get(pts) ?? [];
    list.push(q.id);
    byPoints.set(pts, list);
  }

  let updated = 0;
  for (const [pts, ids] of byPoints) {
    if (!ids.length) continue;
    await db.update(questions).set({ points: pts }).where(inArray(questions.id, ids));
    updated += ids.length;
  }
  return updated;
}
