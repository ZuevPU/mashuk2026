import { eq, and, sql, isNull, inArray, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pointsLog, levelsConfig, participants, answers, questions } from '../db/schema.js';
import { env } from '../config/env.js';
import { ACTION_CATALOG } from './levelsActionCatalog.js';

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
  // Reversal rows use `${base}_revoke` — keep them on the same track as the original award.
  const base = actionType.replace(/_revoke$/i, '');
  if (base === 'admin_manual_path' || actionType === 'admin_manual_deduct_path') return 'path';
  if (base === 'admin_manual_experience' || actionType === 'admin_manual_deduct_experience') return 'experience';
  if (BONUS_ACTIONS.has(base)) return 'bonus';
  return PATH_ACTIONS.has(base) ? 'path' : 'experience';
}

/** Rebuild participant path/experience/bonus/forum totals from non-revoked points_log rows. */
export async function recalculateParticipantTotals(participantId: number): Promise<void> {
  const rows = await db.select({
    actionType: pointsLog.actionType,
    points: pointsLog.points,
  }).from(pointsLog).where(and(
    eq(pointsLog.participantId, participantId),
    isNull(pointsLog.revokedAt),
  ));

  let path = 0;
  let experience = 0;
  let bonus = 0;
  for (const r of rows) {
    const track = pointsTrackForAction(r.actionType || '');
    // Skip *_revoke rows: originals are already marked revokedAt; counting negatives would double-apply.
    if ((r.actionType || '').endsWith('_revoke')) continue;
    if (track === 'path') path += r.points;
    else if (track === 'bonus') bonus += r.points;
    else experience += r.points;
  }

  await db.update(participants)
    .set({
      pathPoints: Math.max(0, path),
      experiencePoints: Math.max(0, experience),
      bonusPoints: Math.max(0, bonus),
      forumPoints: Math.max(0, path + experience + bonus),
    })
    .where(eq(participants.id, participantId));
}

const DEFAULT_THRESHOLDS = [0, 100, 250, 500, 1000];

/** Map a forum question to a path/experience action type for awards. */
export function pointsActionForQuestion(question: {
  block?: string | null;
  reflectionKind?: string | null;
  questionKind?: string | null;
  type?: string | null;
  timePoint?: string | null;
  title?: string | null;
}): string {
  if (question.block === 'Точка Б' || question.reflectionKind === 'point_b') return 'point_b_complete';
  const isStateCheck = question.type === 'checkin'
    || question.reflectionKind === 'state_check'
    || question.questionKind === 'state_check'
    || (question.block || '').toLowerCase().includes('проверк');
  if (isStateCheck) {
    const tp = `${question.timePoint || ''} ${question.title || ''}`.toLowerCase();
    if (tp.includes('утро')) return 'state_check_morning';
    if (tp.includes('вечер')) return 'state_check_evening';
    if (tp.includes('день') || tp.includes('дневн')) return 'state_check_day';
    return 'state_check_day';
  }
  return 'question_answer';
}

/**
 * Award path points for past answers that never got a points_log row
 * (e.g. levels_config was empty when they submitted).
 */
export async function backfillPathPointsForAnswers(
  participantId: number,
  answered: Array<{ questionId: number; forumDay?: number | null }>,
  questionById: Map<number, {
    id: number;
    block?: string | null;
    reflectionKind?: string | null;
    questionKind?: string | null;
    type?: string | null;
    timePoint?: string | null;
    title?: string | null;
    dayNumber?: number | null;
    points?: number | null;
  }>,
): Promise<number> {
  if (answered.length === 0) return 0;

  const existing = await db.select({
    actionType: pointsLog.actionType,
    forumDay: pointsLog.forumDay,
  }).from(pointsLog).where(eq(pointsLog.participantId, participantId));

  const logKeyCounts = new Map<string, number>();
  for (const row of existing) {
    if (!row.actionType) continue;
    const key = `${row.actionType}:${row.forumDay ?? ''}`;
    logKeyCounts.set(key, (logKeyCounts.get(key) ?? 0) + 1);
  }

  const needed = new Map<string, { actionType: string; forumDay?: number; override?: number; count: number }>();
  for (const a of answered) {
    const q = questionById.get(a.questionId);
    if (!q) continue;
    const actionType = pointsActionForQuestion(q);
    // Only repair state-check / point awards — not generic question_answer (too noisy)
    if (
      actionType !== 'state_check_morning'
      && actionType !== 'state_check_day'
      && actionType !== 'state_check_evening'
      && actionType !== 'point_b_complete'
      && actionType !== 'point_a_complete'
    ) continue;
    const forumDay = a.forumDay ?? q.dayNumber ?? undefined;
    const key = `${actionType}:${forumDay ?? ''}`;
    const cur = needed.get(key);
    if (cur) cur.count += 1;
    else {
      needed.set(key, {
        actionType,
        forumDay,
        override: typeof q.points === 'number' ? q.points : undefined,
        count: 1,
      });
    }
  }

  let awardedTotal = 0;
  for (const [key, need] of needed) {
    const have = logKeyCounts.get(key) ?? 0;
    const missing = need.count - have;
    for (let i = 0; i < missing; i++) {
      const result = await awardPoints(participantId, need.actionType, need.override, need.forumDay);
      if (result) awardedTotal += result.awarded;
    }
  }
  return awardedTotal;
}

export async function awardPoints(
  participantId: number,
  actionType: string,
  overridePoints?: number,
  forumDay?: number,
  opts?: { submissionId?: number },
): Promise<{ awarded: number; track: PointTrack | 'bonus'; logId: number } | null> {
  const [config] = await db.select().from(levelsConfig).where(eq(levelsConfig.actionType, actionType)).limit(1);
  const catalog = ACTION_CATALOG.find(a => a.actionType === actionType);
  // Explicit override 0 must mean «no award» — `??` would treat 0 as missing and use catalog (e.g. 10).
  const points = overridePoints !== undefined
    ? overridePoints
    : (config?.pointsPerUnit ?? catalog?.pointsPerUnit ?? 0);
  if (points <= 0) return null;

  const maxAccruals = config?.maxAccruals ?? catalog?.maxAccruals ?? null;
  if (maxAccruals) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pointsLog)
      .where(and(eq(pointsLog.participantId, participantId), eq(pointsLog.actionType, actionType)));
    if (count >= maxAccruals) return null;
  }

  const [beforeRow] = await db.select({
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  const pointsBefore = {
    path: beforeRow?.pathPoints ?? 0,
    experience: beforeRow?.experiencePoints ?? 0,
  };

  const [inserted] = await db.insert(pointsLog).values({
    participantId,
    actionType,
    points,
    forumDay: forumDay ?? null,
    submissionId: opts?.submissionId ?? null,
  }).returning({ id: pointsLog.id });

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

  try {
    await syncForumPoints(participantId);
  } catch (err) {
    console.warn('syncForumPoints failed:', err);
  }

  return { awarded: points, track, logId: inserted.id };
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
  const computed = totalRatingScore(p.pathPoints ?? 0, p.experiencePoints ?? 0, p.bonusPoints ?? 0);
  if (!isUnifiedRatingEnabled()) return computed;
  const cached = p.forumPoints;
  // forum_points defaults to 0 in DB — treat stale 0 as unsynced when track totals are non-zero
  if (cached != null && (cached > 0 || computed === 0)) return cached;
  return computed;
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

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Revoke awards tied to answers on a forum question, then rebuild affected totals.
 * Matching: prefer points_log_id on answer; else closest positive log of the question's
 * action type near the answer time (up to 48h), optionally same forum day.
 */
export async function revokePointsForQuestionAnswers(
  questionId: number,
  reason: string,
): Promise<{
  ok: true;
  answersCount: number;
  revokedLogs: number;
  participantsAffected: number;
  pointsRevoked: number;
  unmatchedAnswers: number;
} | { ok: false; error: string }> {
  const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!question) return { ok: false, error: 'Question not found' };

  const actionType = pointsActionForQuestion(question);
  const actionTypes = actionType === 'question_answer'
    ? ['question_answer']
    : [actionType, 'question_answer'];
  const forumDay = question.dayNumber ?? null;

  const answerRows = await db.select({
    id: answers.id,
    participantId: answers.participantId,
    createdAt: answers.createdAt,
    pointsLogId: answers.pointsLogId,
  }).from(answers).where(eq(answers.questionId, questionId));

  let revokedLogs = 0;
  let pointsRevoked = 0;
  let unmatchedAnswers = 0;
  const affected = new Set<number>();
  const usedLogIds = new Set<number>();

  for (const answer of answerRows) {
    const answerAt = asDate(answer.createdAt);
    const toRevoke: Array<{ id: number; points: number }> = [];

    if (answer.pointsLogId && !usedLogIds.has(answer.pointsLogId)) {
      const [linked] = await db.select({
        id: pointsLog.id,
        points: pointsLog.points,
        revokedAt: pointsLog.revokedAt,
      }).from(pointsLog).where(eq(pointsLog.id, answer.pointsLogId)).limit(1);
      if (linked && !linked.revokedAt && linked.points > 0) {
        toRevoke.push({ id: linked.id, points: linked.points });
      }
    }

    if (toRevoke.length === 0) {
      const candidates = await db.select({
        id: pointsLog.id,
        points: pointsLog.points,
        actionType: pointsLog.actionType,
        forumDay: pointsLog.forumDay,
        createdAt: pointsLog.createdAt,
      }).from(pointsLog).where(and(
        eq(pointsLog.participantId, answer.participantId),
        isNull(pointsLog.revokedAt),
        sql`${pointsLog.points} > 0`,
        inArray(pointsLog.actionType, actionTypes),
      ));

      const ranked = candidates
        .filter(l => !usedLogIds.has(l.id))
        .map(l => {
          const logAt = asDate(l.createdAt);
          const deltaMs = answerAt && logAt
            ? Math.abs(logAt.getTime() - answerAt.getTime())
            : Number.POSITIVE_INFINITY;
          const sameDay = forumDay != null && l.forumDay === forumDay ? 0 : 1;
          const primary = l.actionType === actionType ? 0 : 1;
          return { ...l, deltaMs, sameDay, primary };
        })
        // Prefer primary action, same forum day, then closest in time (max 48h)
        .filter(l => Number.isFinite(l.deltaMs) && l.deltaMs <= 48 * 60 * 60 * 1000)
        .sort((a, b) => (
          a.primary - b.primary
          || a.sameDay - b.sameDay
          || a.deltaMs - b.deltaMs
        ));

      const primary = ranked.find(l => l.actionType === actionType) ?? ranked[0];
      if (primary) {
        toRevoke.push({ id: primary.id, points: primary.points });
        // Depth bonus (3) often awarded in the same submit
        const bonus = ranked.find(l => (
          l.id !== primary.id
          && l.actionType === 'question_answer'
          && l.points === 3
          && Math.abs(l.deltaMs - primary.deltaMs) <= 60_000
        ));
        if (bonus) toRevoke.push({ id: bonus.id, points: bonus.points });
      }
    }

    // Last resort: one unused primary-action log for this participant on the question's forum day
    if (toRevoke.length === 0 && forumDay != null) {
      const [fallback] = await db.select({
        id: pointsLog.id,
        points: pointsLog.points,
      }).from(pointsLog).where(and(
        eq(pointsLog.participantId, answer.participantId),
        isNull(pointsLog.revokedAt),
        sql`${pointsLog.points} > 0`,
        eq(pointsLog.actionType, actionType),
        eq(pointsLog.forumDay, forumDay),
      )).orderBy(asc(pointsLog.createdAt)).limit(1);
      if (fallback && !usedLogIds.has(fallback.id)) {
        toRevoke.push(fallback);
      }
    }

    if (toRevoke.length === 0) {
      unmatchedAnswers += 1;
      await db.update(answers)
        .set({ pointsAwarded: 0, pointsLogId: null })
        .where(eq(answers.id, answer.id));
      continue;
    }

    for (const log of toRevoke) {
      if (usedLogIds.has(log.id)) continue;
      const result = await revokePointsLogEntry(log.id, answer.participantId, reason);
      if (result.ok) {
        usedLogIds.add(log.id);
        revokedLogs += 1;
        pointsRevoked += log.points;
        affected.add(answer.participantId);
      }
    }

    await db.update(answers)
      .set({ pointsAwarded: 0, pointsLogId: null })
      .where(eq(answers.id, answer.id));
  }

  // Rebuild counters from logs so rating / profile cannot stay stale.
  for (const participantId of affected) {
    await recalculateParticipantTotals(participantId);
  }

  return {
    ok: true,
    answersCount: answerRows.length,
    revokedLogs,
    participantsAffected: affected.size,
    pointsRevoked,
    unmatchedAnswers,
  };
}
