import { and, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants, pointsLog, userMedals, tasks, taskSubmissions } from '../db/schema.js';
import { pointsTrackForAction, totalRatingScore, isUnifiedRatingEnabled, participantRatingScore } from './pointsService.js';
import { resolveActiveShift } from './shiftService.js';
import { FORUM_RATING_MAX_DAY } from './leaderboardQuery.js';
import { forumDayWindowMsk } from './timePhase.js';

export type LeaderboardScope = 'total' | 'day' | 'shift';
export type LeaderboardMode = 'points' | 'medals' | 'nomination';
export type MedalMode = 'count' | 'holders';
export type LeaderboardSort = 'score' | 'name';

export type LeaderboardPeriodOpts = { scope?: LeaderboardScope; day?: number };

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
  p: { pathPoints: number | null; experiencePoints: number | null; bonusPoints: number | null; forumPoints?: number | null },
  track: string,
): number {
  const path = p.pathPoints ?? 0;
  const exp = p.experiencePoints ?? 0;
  const bonus = p.bonusPoints ?? 0;
  if (track === 'path') return path;
  if (track === 'experience') return exp;
  if (track === 'bonus') return bonus;
  if (isUnifiedRatingEnabled()) {
    return participantRatingScore(p);
  }
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
      forumPoints: participants.forumPoints,
    }).from(participants).where(inArray(participants.id, participantIds));
    for (const p of rows) {
      map.set(p.id, scoreForTrack(p, opts.track));
    }
    return map;
  }

  const conditions = [
    inArray(pointsLog.participantId, participantIds),
    isNull(pointsLog.revokedAt),
    sql`${pointsLog.actionType} NOT LIKE '%\\_revoke' ESCAPE '\\'`,
  ];
  if (opts.scope === 'day' && opts.day) {
    const shift = await resolveActiveShift();
    if (shift?.startDate) {
      const dayWindow = forumDayWindowMsk(new Date(shift.startDate), opts.day);
      conditions.push(or(
        eq(pointsLog.forumDay, opts.day),
        and(
          isNull(pointsLog.forumDay),
          gte(pointsLog.createdAt, dayWindow.start),
          lt(pointsLog.createdAt, dayWindow.end),
        ),
      )!);
    } else {
      conditions.push(eq(pointsLog.forumDay, opts.day));
    }
  } else if (opts.scope === 'shift') {
    // Include undated legacy awards (forum_day NULL) — many accruals historically omitted the day.
    conditions.push(sql`(
      ${pointsLog.forumDay} IS NULL
      OR (${pointsLog.forumDay} BETWEEN 1 AND ${FORUM_RATING_MAX_DAY})
    )`);
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

function taskMatchesForumDay(
  task: { dayNumber: number | null; dayNumbers: number[] | null },
  day: number,
): boolean {
  if (task.dayNumber === day) return true;
  const dns = Array.isArray(task.dayNumbers) ? task.dayNumbers : [];
  return dns.includes(day);
}

async function forumDayTimeBounds(day: number): Promise<{ start: Date; end: Date } | null> {
  const shift = await resolveActiveShift();
  if (!shift?.startDate) return null;
  return forumDayWindowMsk(new Date(shift.startDate), day);
}

export async function computeNominationLeaderboard(
  nominationKey: string,
  participantIds: number[],
  opts?: LeaderboardPeriodOpts,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!nominationKey || participantIds.length === 0) return map;
  const allTasks = await db.select({
    id: tasks.id,
    points: tasks.points,
    dayNumber: tasks.dayNumber,
    dayNumbers: tasks.dayNumbers,
  }).from(tasks).where(eq(tasks.nomination, nominationKey));

  const scope = opts?.scope ?? 'shift';
  let filteredTasks = allTasks;
  if (scope === 'day' && opts?.day) {
    filteredTasks = allTasks.filter(t => taskMatchesForumDay(t, opts.day!));
  }
  const taskIds = new Set(filteredTasks.map(t => t.id));
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
    const task = filteredTasks.find(t => t.id === s.taskId);
    const add = s.pointsAwarded ?? task?.points ?? 0;
    map.set(s.participantId, (map.get(s.participantId) ?? 0) + add);
  }
  for (const id of participantIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

export async function computeMedalCountLeaderboard(
  participantIds: number[],
  opts: LeaderboardPeriodOpts,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (participantIds.length === 0) return map;
  for (const id of participantIds) map.set(id, 0);

  const scope = opts.scope ?? 'shift';
  const conditions = [inArray(userMedals.participantId, participantIds)];
  if (scope === 'day' && opts.day) {
    const bounds = await forumDayTimeBounds(opts.day);
    if (bounds) {
      conditions.push(gte(userMedals.awardedAt, bounds.start));
      conditions.push(lt(userMedals.awardedAt, bounds.end));
    }
  } else if (scope === 'shift') {
    const shift = await resolveActiveShift();
    if (shift?.startDate) {
      const start = new Date(shift.startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      // Медали считаем по всей длине смены (не только 1–6 рейтинговых дней).
      const spanDays = Math.max(1, Number(shift.totalDays) || FORUM_RATING_MAX_DAY);
      end.setUTCDate(end.getUTCDate() + spanDays);
      conditions.push(gte(userMedals.awardedAt, start));
      conditions.push(lt(userMedals.awardedAt, end));
    }
  }

  const rows = await db.select({
    participantId: userMedals.participantId,
    c: sql<number>`count(*)::int`,
  }).from(userMedals).where(and(...conditions)).groupBy(userMedals.participantId);

  for (const r of rows) {
    map.set(r.participantId, Number(r.c ?? 0));
  }
  return map;
}

export function sortLeaderboardByScore<T extends {
  score: number;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}>(rows: T[], sort: LeaderboardSort = 'score'): T[] {
  const copy = [...rows];
  const fullName = (r: T) => (
    r.name?.trim()
    || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()
  ).toLowerCase();

  if (sort === 'name') {
    copy.sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru'));
    return copy;
  }
  copy.sort((a, b) => b.score - a.score || fullName(a).localeCompare(fullName(b), 'ru'));
  return copy;
}

export async function resolveLeaderboardScoreMap(
  participantIds: number[],
  opts: {
    mode: LeaderboardMode;
    track: string;
    scope: LeaderboardScope;
    day?: number;
    nomination?: string;
    medalMode?: MedalMode;
    medalId?: number;
    /** When true on points mode, score = medal count for period instead of points. */
    medalAsScore?: boolean;
  },
  participantsForTotal?: Array<{
    id: number;
    pathPoints: number | null;
    experiencePoints: number | null;
    bonusPoints: number | null;
    forumPoints?: number | null;
  }>,
): Promise<Map<number, number>> {
  if (opts.mode === 'nomination' && opts.nomination) {
    return computeNominationLeaderboard(opts.nomination, participantIds, {
      scope: opts.scope,
      day: opts.day,
    });
  }

  const useMedalScore = opts.mode === 'medals' || (opts.mode === 'points' && opts.medalAsScore);
  if (useMedalScore) {
    if (opts.medalMode === 'holders' && opts.medalId) {
      const holders = await participantIdsWithMedal(opts.medalId);
      const map = new Map<number, number>();
      for (const id of participantIds) {
        map.set(id, holders.has(id) ? 1 : 0);
      }
      return map;
    }
    return computeMedalCountLeaderboard(participantIds, {
      scope: opts.scope,
      day: opts.day,
    });
  }

  if (opts.scope === 'total' && opts.track === 'total' && participantsForTotal) {
    const map = new Map<number, number>();
    for (const p of participantsForTotal) {
      if (participantIds.includes(p.id)) {
        map.set(p.id, participantRatingScore(p));
      }
    }
    for (const id of participantIds) {
      if (!map.has(id)) map.set(id, 0);
    }
    return map;
  }

  return computeLeaderboardScores(participantIds, {
    scope: opts.scope,
    day: opts.scope === 'day' ? opts.day : undefined,
    track: opts.track,
  });
}

export const NOMINATION_LEADERBOARD_KEYS = [
  'sport', 'creative', 'media', 'education', 'culture', 'volunteer', 'team',
  'networking', 'leadership', 'general',
] as const;

export const NOMINATION_LABELS: Record<string, string> = {
  sport: 'Спорт',
  creative: 'Креатив',
  media: 'Медиа',
  education: 'Образование',
  culture: 'Культура',
  volunteer: 'Волонтёрство',
  team: 'Командность',
  networking: 'Нетворкинг',
  leadership: 'Лидерство',
  general: 'Общий зачёт',
};

export async function participantIdsWithMedal(medalId: number): Promise<Set<number>> {
  const rows = await db.select({ participantId: userMedals.participantId })
    .from(userMedals)
    .where(eq(userMedals.medalId, medalId));
  return new Set(rows.map(r => r.participantId));
}
