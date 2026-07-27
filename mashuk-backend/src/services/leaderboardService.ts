import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pointsLog, userMedals } from '../db/schema.js';
import { pointsTrackForAction, totalRatingScore } from './pointsService.js';

export type LeaderboardScope = 'total' | 'day' | 'shift';

function scoreForTrack(
  p: { pathPoints: number | null; experiencePoints: number | null; bonusPoints: number | null },
  track: string,
): number {
  const path = p.pathPoints ?? 0;
  const exp = p.experiencePoints ?? 0;
  const bonus = p.bonusPoints ?? 0;
  if (track === 'path') return path;
  if (track === 'experience') return exp;
  if (track === 'bonus') return bonus;
  return totalRatingScore(path, exp, bonus);
}

function logPointsForTrack(actionType: string, points: number, track: string): number | null {
  const t = pointsTrackForAction(actionType);
  if (track === 'path' && t === 'path') return points;
  if (track === 'experience' && t === 'experience') return points;
  if (track === 'bonus' && t === 'bonus') return points;
  if (track === 'total') {
    if (t === 'path' || t === 'experience' || t === 'bonus') return points;
  }
  return null;
}

export async function computeLeaderboardScores(
  participantIds: number[],
  opts: { scope: LeaderboardScope; day?: number; track: string },
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (participantIds.length === 0) return map;

  if (opts.scope === 'total') {
    const rows = await db.select({
      id: participants.id,
      pathPoints: participants.pathPoints,
      experiencePoints: participants.experiencePoints,
      bonusPoints: participants.bonusPoints,
    }).from(participants).where(inArray(participants.id, participantIds));
    for (const p of rows) {
      map.set(p.id, scoreForTrack(p, opts.track));
    }
    return map;
  }

  const conditions = [
    inArray(pointsLog.participantId, participantIds),
    isNull(pointsLog.revokedAt),
    sql`${pointsLog.points} > 0`,
  ];
  if (opts.scope === 'day' && opts.day) {
    conditions.push(eq(pointsLog.forumDay, opts.day));
  } else if (opts.scope === 'shift') {
    conditions.push(sql`${pointsLog.forumDay} IS NOT NULL AND ${pointsLog.forumDay} BETWEEN 1 AND 7`);
  }

  const rows = await db.select({
    participantId: pointsLog.participantId,
    actionType: pointsLog.actionType,
    points: pointsLog.points,
  }).from(pointsLog).where(and(...conditions));

  for (const r of rows) {
    const add = logPointsForTrack(r.actionType || '', r.points, opts.track);
    if (add == null) continue;
    map.set(r.participantId, (map.get(r.participantId) ?? 0) + add);
  }
  for (const id of participantIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

export async function participantIdsWithMedal(medalId: number): Promise<Set<number>> {
  const rows = await db.select({ participantId: userMedals.participantId })
    .from(userMedals)
    .where(eq(userMedals.medalId, medalId));
  return new Set(rows.map(r => r.participantId));
}
