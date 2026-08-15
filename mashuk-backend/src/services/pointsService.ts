import { eq, and, sql, isNull, asc, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pointsLog, levelsConfig, participants, answers, questions } from '../db/schema.js';
import { env } from '../config/env.js';
import { ACTION_CATALOG } from './levelsActionCatalog.js';
import { getForumSettings, resolveEffectiveCurrentDay } from './helpers.js';
import { loadLevelsConfig } from './shiftContext.js';

export type PointTrack = 'path' | 'experience';

export function isActivePointsLogAction(actionType: string | null | undefined): boolean {
  return !(actionType || '').endsWith('_revoke');
}

export async function resolveAwardForumDay(
  explicit?: number | null,
  shiftId?: number | null,
): Promise<number> {
  if (explicit != null && Number.isFinite(explicit) && explicit >= 1) {
    return Math.floor(explicit);
  }
  const settings = await getForumSettings(shiftId);
  return resolveEffectiveCurrentDay(settings);
}

const PATH_ACTIONS = new Set([
  'question_answer',
  'evening_complete',
  'forum_wrap_complete',
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
    const slot = (question.timePoint || '').trim().toLowerCase();
    if (slot === 'утро' || slot === 'morning' || slot.startsWith('утр')) return 'state_check_morning';
    if (slot === 'вечер' || slot === 'evening' || slot.startsWith('веч')) return 'state_check_evening';
    if (slot === 'день' || slot === 'day' || slot.includes('дневн')) return 'state_check_day';
    const title = (question.title || '').toLowerCase();
    if (title.includes('утр')) return 'state_check_morning';
    if (title.includes('веч')) return 'state_check_evening';
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

async function updateAnswerAward(
  answerId: number,
  patch: { pointsAwarded: number; pointsLogId?: number | null },
): Promise<void> {
  try {
    await db.update(answers).set(patch).where(eq(answers.id, answerId));
  } catch (err) {
    // Schema lag without answers.points_log_id — still store the awarded total.
    console.warn('updateAnswerAward fallback without pointsLogId:', err);
    await db.update(answers)
      .set({ pointsAwarded: patch.pointsAwarded })
      .where(eq(answers.id, answerId));
  }
}

function isPracticesVoteQuestion(q: {
  questionKind?: string | null;
  answerType?: string | null;
  type?: string | null;
}): boolean {
  return q.questionKind === 'practices_vote'
    || q.answerType === 'practices_vote'
    || q.type === 'practices_vote';
}

/**
 * Admin tool: for every saved answer, keep existing awards; award only where
 * the participant answered but points were never credited (points_awarded = 0).
 */
export async function backfillMissingAnswerPoints(): Promise<{
  scanned: number;
  alreadyOk: number;
  linkedExisting: number;
  newlyAwarded: number;
  skippedZeroPoints: number;
  participantsAffected: number;
  pointsTotal: number;
}> {
  const rows = await db.select({
    answerId: answers.id,
    participantId: answers.participantId,
    pointsAwarded: answers.pointsAwarded,
    pointsLogId: answers.pointsLogId,
    createdAt: answers.createdAt,
    questionId: questions.id,
    block: questions.block,
    reflectionKind: questions.reflectionKind,
    questionKind: questions.questionKind,
    answerType: questions.answerType,
    type: questions.type,
    timePoint: questions.timePoint,
    title: questions.title,
    dayNumber: questions.dayNumber,
    points: questions.points,
  }).from(answers).innerJoin(questions, eq(answers.questionId, questions.id));

  const usedLogIds = new Set<number>();
  for (const row of rows) {
    if (row.pointsLogId) usedLogIds.add(row.pointsLogId);
  }

  const levelByAction = new Map<string, number | null>();
  for (const cfg of await db.select().from(levelsConfig)) {
    if (cfg.actionType) levelByAction.set(cfg.actionType, cfg.pointsPerUnit ?? null);
  }

  let scanned = 0;
  let alreadyOk = 0;
  let linkedExisting = 0;
  let newlyAwarded = 0;
  let skippedZeroPoints = 0;
  let pointsTotal = 0;
  const affected = new Set<number>();

  for (const row of rows) {
    scanned += 1;
    if (isPracticesVoteQuestion(row)) {
      alreadyOk += 1;
      continue;
    }

    const question = {
      block: row.block,
      reflectionKind: row.reflectionKind,
      questionKind: row.questionKind,
      type: row.type,
      timePoint: row.timePoint,
      title: row.title,
    };
    const actionType = pointsActionForQuestion(question);
    const forumDay = row.dayNumber ?? undefined;
    const isPointB = actionType === 'point_b_complete';
    const override = isPointB
      ? undefined
      : (typeof row.points === 'number' ? row.points : undefined);

    const catalog = ACTION_CATALOG.find(a => a.actionType === actionType);
    const levelPts = levelByAction.get(actionType);
    const expectedPts = isPointB
      ? (levelPts ?? catalog?.pointsPerUnit ?? 0)
      : (override !== undefined ? override : (levelPts ?? catalog?.pointsPerUnit ?? 0));

    if (expectedPts <= 0) {
      skippedZeroPoints += 1;
      continue;
    }

    if (row.pointsLogId) {
      const [log] = await db.select({
        id: pointsLog.id,
        points: pointsLog.points,
        revokedAt: pointsLog.revokedAt,
      }).from(pointsLog).where(eq(pointsLog.id, row.pointsLogId)).limit(1);
      if (log && !log.revokedAt && log.points > 0) {
        if ((row.pointsAwarded ?? 0) !== log.points) {
          await updateAnswerAward(row.answerId, { pointsAwarded: log.points, pointsLogId: log.id });
        }
        alreadyOk += 1;
        continue;
      }
    }

    if ((row.pointsAwarded ?? 0) > 0) {
      alreadyOk += 1;
      continue;
    }

    // Points may already be in the log while answer.points_awarded stayed 0 (failed update).
    const created = row.createdAt ?? new Date();
    const orphanConds = [
      eq(pointsLog.participantId, row.participantId),
      eq(pointsLog.actionType, actionType),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.points} > 0`,
      gte(pointsLog.createdAt, new Date(created.getTime() - 15 * 60_000)),
      lte(pointsLog.createdAt, new Date(created.getTime() + 15 * 60_000)),
    ];
    if (forumDay != null) {
      orphanConds.push(sql`(
        ${pointsLog.forumDay} = ${forumDay}
        OR ${pointsLog.forumDay} IS NULL
      )`);
    }
    let orphans = await db.select({
      id: pointsLog.id,
      points: pointsLog.points,
    }).from(pointsLog).where(and(...orphanConds)).orderBy(asc(pointsLog.createdAt));
    orphans = orphans.filter(o => !usedLogIds.has(o.id));
    if (orphans.some(o => o.points === expectedPts)) {
      orphans = orphans.filter(o => o.points === expectedPts);
    }

    if (orphans[0]) {
      const log = orphans[0];
      usedLogIds.add(log.id);
      await updateAnswerAward(row.answerId, { pointsAwarded: log.points, pointsLogId: log.id });
      linkedExisting += 1;
      affected.add(row.participantId);
      continue;
    }

    const result = await awardPoints(row.participantId, actionType, override, forumDay);
    if (!result) {
      skippedZeroPoints += 1;
      continue;
    }
    usedLogIds.add(result.logId);
    await updateAnswerAward(row.answerId, {
      pointsAwarded: result.awarded,
      pointsLogId: result.logId,
    });
    newlyAwarded += 1;
    pointsTotal += result.awarded;
    affected.add(row.participantId);
  }

  for (const participantId of affected) {
    await recalculateParticipantTotals(participantId);
  }

  return {
    scanned,
    alreadyOk,
    linkedExisting,
    newlyAwarded,
    skippedZeroPoints,
    participantsAffected: affected.size,
    pointsTotal,
  };
}

export async function awardPoints(
  participantId: number,
  actionType: string,
  overridePoints?: number,
  forumDay?: number,
  opts?: { submissionId?: number; ignoreMaxAccruals?: boolean; relatedLogId?: number },
): Promise<{ awarded: number; track: PointTrack | 'bonus'; logId: number } | null> {
  const [beforeRow] = await db.select({
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    shiftId: participants.shiftId,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  const config = await loadLevelsConfig(actionType, beforeRow?.shiftId);
  const catalog = ACTION_CATALOG.find(a => a.actionType === actionType);
  // Explicit override 0 must mean «no award» — `??` would treat 0 as missing and use catalog (e.g. 10).
  const points = overridePoints !== undefined
    ? overridePoints
    : (config?.pointsPerUnit ?? catalog?.pointsPerUnit ?? 0);
  const pointsBefore = {
    path: beforeRow?.pathPoints ?? 0,
    experience: beforeRow?.experiencePoints ?? 0,
  };
  const trackEarly = pointsTrackForAction(actionType);
  const stampedDay = await resolveAwardForumDay(forumDay, beforeRow?.shiftId);

  /** Даже при 0 XP / капе — проверить бонус «полный день» и серии. */
  const runBonusHooks = async () => {
    const { afterPointsAwarded } = await import('./ratingBonusesService.js');
    await afterPointsAwarded(participantId, trackEarly, 0, pointsBefore, {
      forumDay: stampedDay,
      actionType,
    });
  };

  if (points <= 0) {
    await runBonusHooks();
    return null;
  }

  const maxAccruals = config?.maxAccruals ?? catalog?.maxAccruals ?? null;
  if (maxAccruals && !opts?.ignoreMaxAccruals) {
    // Count only active awards — revoked rows used to silently block further touchpoint XP.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pointsLog)
      .where(and(
        eq(pointsLog.participantId, participantId),
        eq(pointsLog.actionType, actionType),
        isNull(pointsLog.revokedAt),
        sql`${pointsLog.points} > 0`,
      ));
    if (count >= maxAccruals) {
      console.warn(
        `awardPoints capped: participant=${participantId} action=${actionType} count=${count} max=${maxAccruals}`,
      );
      await runBonusHooks();
      return null;
    }
  }

  const [inserted] = await db.insert(pointsLog).values({
    participantId,
    actionType,
    points,
    forumDay: stampedDay,
    submissionId: opts?.submissionId ?? null,
    relatedLogId: opts?.relatedLogId ?? null,
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
    forumDay: stampedDay,
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

export async function getLevelThresholds(track: PointTrack, shiftId?: number | null): Promise<number[]> {
  const actionType = track === 'path' ? 'path_level' : 'exp_level';
  const config = await loadLevelsConfig(actionType, shiftId);
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

/**
 * Revoke ALL awards tied to a forum question for every participant who answered it.
 *
 * Retry/farm abuse creates many points_log rows while answers may stay a single row —
 * so we revoke every matching positive log for that participant (action type + forum day),
 * not just one closest entry.
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
  const forumDay = question.dayNumber ?? null;
  // Catalog fallback used when question.points was 0 (the farm bug).
  const catalog = ACTION_CATALOG.find(a => a.actionType === actionType);
  const levelRow = await loadLevelsConfig(actionType, question.shiftId);
  const typicalAward = (typeof question.points === 'number' && question.points > 0)
    ? question.points
    : (levelRow?.pointsPerUnit ?? catalog?.pointsPerUnit ?? null);

  const answerRows = await db.select({
    id: answers.id,
    participantId: answers.participantId,
    pointsLogId: answers.pointsLogId,
  }).from(answers).where(eq(answers.questionId, questionId));

  const participantIds = [...new Set(answerRows.map(a => a.participantId))];

  let revokedLogs = 0;
  let pointsRevoked = 0;
  let unmatchedAnswers = 0;
  const affected = new Set<number>();
  const usedLogIds = new Set<number>();

  for (const participantId of participantIds) {
    const conditions = [
      eq(pointsLog.participantId, participantId),
      isNull(pointsLog.revokedAt),
      sql`${pointsLog.points} > 0`,
      eq(pointsLog.actionType, actionType),
    ];
    if (forumDay != null) {
      // Include undated legacy awards from the farm window.
      conditions.push(sql`(
        ${pointsLog.forumDay} = ${forumDay}
        OR ${pointsLog.forumDay} IS NULL
      )`);
    }

    let logs = await db.select({
      id: pointsLog.id,
      points: pointsLog.points,
      forumDay: pointsLog.forumDay,
      createdAt: pointsLog.createdAt,
    }).from(pointsLog).where(and(...conditions)).orderBy(asc(pointsLog.createdAt));

    // Prefer awards that look like this question's payout (e.g. 10 from catalog when points=0).
    if (typicalAward != null && logs.some(l => l.points === typicalAward)) {
      logs = logs.filter(l => l.points === typicalAward);
    }

    // Also revoke linked log ids from answer rows (in case action type / day differs).
    for (const answer of answerRows.filter(a => a.participantId === participantId)) {
      if (!answer.pointsLogId || usedLogIds.has(answer.pointsLogId)) continue;
      if (logs.some(l => l.id === answer.pointsLogId)) continue;
      const [linked] = await db.select({
        id: pointsLog.id,
        points: pointsLog.points,
        revokedAt: pointsLog.revokedAt,
      }).from(pointsLog).where(eq(pointsLog.id, answer.pointsLogId)).limit(1);
      if (linked && !linked.revokedAt && linked.points > 0) {
        logs.push({
          id: linked.id,
          points: linked.points,
          forumDay: null,
          createdAt: null,
        });
      }
    }

    // Depth bonus (+3 question_answer) only when primary action is not already question_answer
    if (actionType !== 'question_answer') {
      const bonusConds = [
        eq(pointsLog.participantId, participantId),
        isNull(pointsLog.revokedAt),
        eq(pointsLog.actionType, 'question_answer'),
        eq(pointsLog.points, 3),
      ];
      if (forumDay != null) {
        bonusConds.push(sql`(
          ${pointsLog.forumDay} = ${forumDay}
          OR ${pointsLog.forumDay} IS NULL
        )`);
      }
      const bonuses = await db.select({
        id: pointsLog.id,
        points: pointsLog.points,
        forumDay: pointsLog.forumDay,
        createdAt: pointsLog.createdAt,
      }).from(pointsLog).where(and(...bonusConds));
      logs.push(...bonuses);
    }

    const uniqueLogs = logs.filter(l => !usedLogIds.has(l.id));

    if (uniqueLogs.length === 0) {
      unmatchedAnswers += answerRows.filter(a => a.participantId === participantId).length;
    }

    for (const log of uniqueLogs) {
      const result = await revokePointsLogEntry(log.id, participantId, reason);
      if (result.ok) {
        usedLogIds.add(log.id);
        revokedLogs += 1;
        pointsRevoked += log.points;
        affected.add(participantId);
      }
    }

    await db.update(answers)
      .set({ pointsAwarded: 0, pointsLogId: null })
      .where(and(
        eq(answers.questionId, questionId),
        eq(answers.participantId, participantId),
      ));
  }

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
