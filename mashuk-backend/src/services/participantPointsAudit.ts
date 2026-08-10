import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { answers, participants, pointsLog } from '../db/schema.js';
import { pointsTrackForAction, type PointTrack } from './pointsService.js';

export type PointsTrackKey = PointTrack | 'bonus';

export type PointsAuditIssue = {
  code: string;
  severity: 'ok' | 'warn' | 'error';
  message: string;
};

export type PointsAuditResult = {
  ok: boolean;
  stored: { path: number; experience: number; bonus: number; total: number };
  fromLog: { path: number; experience: number; bonus: number; total: number };
  byAction: Array<{ actionType: string; track: PointsTrackKey; points: number; count: number }>;
  issues: PointsAuditIssue[];
  answersWithoutLog: number;
  logRows: number;
  revokedRows: number;
};

function trackOf(actionType: string): PointsTrackKey {
  return pointsTrackForAction(actionType);
}

/**
 * Recompute path/experience/bonus from points_log and compare to stored participant columns.
 * Also flags forum answers that recorded pointsAwarded but have no linked points_log row.
 */
export async function auditParticipantPoints(participantId: number): Promise<PointsAuditResult> {
  const [p] = await db.select({
    pathPoints: participants.pathPoints,
    experiencePoints: participants.experiencePoints,
    bonusPoints: participants.bonusPoints,
    forumPoints: participants.forumPoints,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);

  const stored = {
    path: p?.pathPoints ?? 0,
    experience: p?.experiencePoints ?? 0,
    bonus: p?.bonusPoints ?? 0,
    total: (p?.pathPoints ?? 0) + (p?.experiencePoints ?? 0) + (p?.bonusPoints ?? 0),
  };

  const logs = await db.select({
    actionType: pointsLog.actionType,
    points: pointsLog.points,
    revokedAt: pointsLog.revokedAt,
  }).from(pointsLog).where(eq(pointsLog.participantId, participantId));

  let path = 0;
  let experience = 0;
  let bonus = 0;
  let revokedRows = 0;
  const actionMap = new Map<string, { track: PointsTrackKey; points: number; count: number }>();

  for (const row of logs) {
    if (row.revokedAt) {
      revokedRows += 1;
      continue;
    }
    const actionType = row.actionType || 'unknown';
    if (actionType.endsWith('_revoke')) continue;
    const track = trackOf(actionType);
    const pts = row.points ?? 0;
    if (track === 'path') path += pts;
    else if (track === 'bonus') bonus += pts;
    else experience += pts;

    const prev = actionMap.get(actionType) || { track, points: 0, count: 0 };
    prev.points += pts;
    prev.count += 1;
    actionMap.set(actionType, prev);
  }

  const fromLog = {
    path: Math.max(0, path),
    experience: Math.max(0, experience),
    bonus: Math.max(0, bonus),
    total: Math.max(0, path) + Math.max(0, experience) + Math.max(0, bonus),
  };

  const byAction = [...actionMap.entries()]
    .map(([actionType, v]) => ({ actionType, ...v }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.actionType.localeCompare(b.actionType));

  const orphanAnswers = await db.select({
    id: answers.id,
    pointsAwarded: answers.pointsAwarded,
    pointsLogId: answers.pointsLogId,
  }).from(answers).where(and(
    eq(answers.participantId, participantId),
    isNull(answers.pointsLogId),
  ));
  const answersWithoutLog = orphanAnswers.filter(a => (a.pointsAwarded ?? 0) > 0).length;

  const issues: PointsAuditIssue[] = [];
  const pushDiff = (track: string, storedV: number, logV: number) => {
    if (storedV === logV) return;
    issues.push({
      code: `mismatch_${track}`,
      severity: 'error',
      message: `${track}: в карточке ${storedV}, по журналу ${logV} (разница ${storedV - logV})`,
    });
  };
  pushDiff('Путь', stored.path, fromLog.path);
  pushDiff('Опыт', stored.experience, fromLog.experience);
  pushDiff('Бонус', stored.bonus, fromLog.bonus);

  if (answersWithoutLog > 0) {
    issues.push({
      code: 'answers_without_log',
      severity: 'warn',
      message: `Ответов с баллами без записи в журнале: ${answersWithoutLog}`,
    });
  }

  if ((p?.forumPoints ?? 0) !== fromLog.total && (p?.forumPoints ?? 0) !== stored.total) {
    issues.push({
      code: 'forum_points_stale',
      severity: 'warn',
      message: `forum_points=${p?.forumPoints ?? 0}, сумма линий в карточке=${stored.total}, по журналу=${fromLog.total}`,
    });
  }

  if (issues.length === 0) {
    issues.push({
      code: 'ok',
      severity: 'ok',
      message: 'Расхождений нет: суммы в карточке совпадают с журналом начислений.',
    });
  }

  return {
    ok: !issues.some(i => i.severity === 'error'),
    stored,
    fromLog,
    byAction,
    issues,
    answersWithoutLog,
    logRows: logs.length - revokedRows,
    revokedRows,
  };
}
