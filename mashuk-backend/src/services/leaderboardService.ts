import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pointsLog, userMedals, tasks, taskSubmissions } from '../db/schema.js';
import { pointsTrackForAction, totalRatingScore } from './pointsService.js';

export type LeaderboardScope = 'total' | 'day' | 'shift';

export type LeaderboardScopesConfig = {
  total?: boolean;
  path?: boolean;
  experience?: boolean;
  day?: boolean;
  shift?: boolean;
};

export const DEFAULT_LEADERBOARD_SCOPES: Required<LeaderboardScopesConfig> = {
  total: true,
  path: true,
  experience: true,
  day: true,
  shift: true,
};

export function normalizeLeaderboardScopes(raw: unknown): Required<LeaderboardScopesConfig> {
  const o = (raw && typeof raw === 'object') ? raw as LeaderboardScopesConfig : {};
  return {
    total: o.total !== false,
    path: o.path !== false,
    experience: o.experience !== false,
    day: o.day !== false,
    shift: o.shift !== false,
  };
}

export function isLeaderboardScopeEnabled(
  scopes: Required<LeaderboardScopesConfig>,
  scope: LeaderboardScope,
  track: string,
): boolean {
  if (scope === 'day' && !scopes.day) return false;
  if (scope === 'shift' && !scopes.shift) return false;
  if (scope === 'total') {
    if (track === 'path' && !scopes.path) return false;
    if (track === 'experience' && !scopes.experience) return false;
    if (track === 'total' && !scopes.total) return false;
    if (track === 'bonus') return scopes.total;
  }
  return true;
}

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

export async function computeNominationLeaderboard(
  nominationKey: string,
  participantIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!nominationKey || participantIds.length === 0) return map;
  const allTasks = await db.select({ id: tasks.id, points: tasks.points })
    .from(tasks)
    .where(eq(tasks.nomination, nominationKey));
  const taskIds = new Set(allTasks.map(t => t.id));
  if (taskIds.size === 0) {
    for (const id of participantIds) map.set(id, 0);
    return map;
  }
  const subs = await db.select({
    participantId: taskSubmissions.participantId,
    pointsAwarded: taskSubmissions.pointsAwarded,
    taskId: taskSubmissions.taskId,
    status: taskSubmissions.status,
  }).from(taskSubmissions)
    .where(and(
      inArray(taskSubmissions.participantId, participantIds),
      eq(taskSubmissions.status, 'approved'),
    ));
  for (const s of subs) {
    if (!s.taskId || !taskIds.has(s.taskId)) continue;
    const task = allTasks.find(t => t.id === s.taskId);
    const add = s.pointsAwarded ?? task?.points ?? 0;
    map.set(s.participantId, (map.get(s.participantId) ?? 0) + add);
  }
  for (const id of participantIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

export const NOMINATION_LEADERBOARD_KEYS = [
  'sport', 'creative', 'media', 'education', 'culture', 'volunteer', 'team', 'general',
] as const;

export const NOMINATION_LABELS: Record<string, string> = {
  sport: 'Спорт',
  creative: 'Креатив',
  media: 'Медиа',
  education: 'Образование',
  culture: 'Культура',
  volunteer: 'Волонтёрство',
  team: 'Командность',
  general: 'Общий зачёт',
};

export async function participantIdsWithMedal(medalId: number): Promise<Set<number>> {
  const rows = await db.select({ participantId: userMedals.participantId })
    .from(userMedals)
    .where(eq(userMedals.medalId, medalId));
  return new Set(rows.map(r => r.participantId));
}
