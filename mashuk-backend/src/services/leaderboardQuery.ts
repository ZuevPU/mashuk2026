import type { LeaderboardMode, LeaderboardScope, MedalMode } from './leaderboardService.js';

/** Forum rating covers days 1–6 per TZ (day 7+ is wrap-up, not in shift leaderboard). */
export const FORUM_RATING_DAYS = [1, 2, 3, 4, 5, 6] as const;
export const FORUM_RATING_MAX_DAY = 6;

export type LeaderboardParticipantRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  direction: string | null;
  groupId: number | null;
  groupName: string | null;
  pathPoints: number | null;
  experiencePoints: number | null;
  bonusPoints: number | null;
  forumPoints?: number | null;
  hideFromLeaderboard: boolean | null;
  selfDeletedAt: Date | null;
  avatarUrl?: string | null;
  vkId?: number | null;
};

export type ParsedLeaderboardQuery = {
  mode: LeaderboardMode;
  scope: LeaderboardScope;
  track: string;
  day?: number;
  nomination: string;
  /** Explicit medal filter only; omit/null = ordinary points leaderboard. */
  medalMode: MedalMode | null;
  medalId?: number;
  direction: string;
  groupId?: number;
  search: string;
  sort: 'score' | 'name';
  limit: number;
};

export function clampForumDay(day: number | undefined, fallback = 1): number {
  if (!Number.isFinite(day)) return fallback;
  const d = Math.floor(day!);
  if (d < 1) return 1;
  if (d > FORUM_RATING_MAX_DAY) return FORUM_RATING_MAX_DAY;
  return d;
}

export function parseLeaderboardQuery(q: Record<string, unknown>): ParsedLeaderboardQuery {
  const modeRaw = String(q.mode || 'points');
  const mode: LeaderboardMode = modeRaw === 'medals' || modeRaw === 'nomination' ? modeRaw : 'points';
  const scopeRaw = String(q.scope || 'shift');
  const scope: LeaderboardScope = scopeRaw === 'day' || scopeRaw === 'total' ? scopeRaw : 'shift';
  const track = String(q.track || 'total');
  const dayNum = q.day != null ? Number(q.day) : undefined;
  const nomination = String(q.nomination || '');
  const medalModeRaw = q.medalMode != null && String(q.medalMode).trim() !== ''
    ? String(q.medalMode).trim()
    : '';
  const medalMode: MedalMode | null =
    medalModeRaw === 'holders' ? 'holders'
      : medalModeRaw === 'count' ? 'count'
        : null;
  const medalId = q.medalId != null ? Number(q.medalId) : undefined;
  const direction = String(q.direction || '');
  const groupId = q.groupId != null ? Number(q.groupId) : undefined;
  const search = String(q.search || q.q || '').trim().toLowerCase();
  const sortRaw = String(q.sort || 'score');
  const sort = sortRaw === 'name' ? 'name' : 'score';
  const limitRaw = q.limit != null ? Number(q.limit) : (q.showAll === 'true' || q.showAll === '1' ? 0 : 50);
  const limit = Number.isFinite(limitRaw) && limitRaw <= 0 ? 0 : (Number.isFinite(limitRaw) ? Math.min(5000, limitRaw) : 50);

  return {
    mode,
    scope,
    track,
    day: scope === 'day' ? clampForumDay(dayNum) : undefined,
    nomination,
    medalMode,
    medalId: medalId && !Number.isNaN(medalId) ? medalId : undefined,
    direction,
    groupId: groupId && !Number.isNaN(groupId) ? groupId : undefined,
    search,
    sort,
    limit,
  };
}

export function participantDisplayName(p: Pick<LeaderboardParticipantRow, 'firstName' | 'lastName'>): string {
  return `${p.lastName ?? ''} ${p.firstName ?? ''}`.trim() || '—';
}

export function filterLeaderboardParticipants(
  list: LeaderboardParticipantRow[],
  opts: {
    direction?: string;
    groupId?: number;
    search?: string;
    hideDeleted?: boolean;
    hideFromLeaderboard?: boolean;
    keepParticipantId?: number;
    medalHolderIds?: Set<number> | null;
  },
): LeaderboardParticipantRow[] {
  const search = opts.search?.trim().toLowerCase() ?? '';
  return list
    .filter(p => opts.hideDeleted !== false ? !p.selfDeletedAt : true)
    .filter(p => {
      if (!opts.hideFromLeaderboard) return true;
      if (opts.keepParticipantId && p.id === opts.keepParticipantId) return true;
      if (p.hideFromLeaderboard) return false;
      const d = (p.direction || '').toLowerCase();
      if (d === 'организатор форума' || d === 'организатор') return false;
      return true;
    })
    .filter(p => !opts.direction || p.direction === opts.direction)
    .filter(p => !opts.groupId || p.groupId === opts.groupId)
    .filter(p => {
      if (!search) return true;
      const name = participantDisplayName(p).toLowerCase();
      return name.includes(search) || String(p.id).includes(search);
    })
    .filter(p => !opts.medalHolderIds || opts.medalHolderIds.has(p.id));
}

export function collectLeaderboardGroups(list: LeaderboardParticipantRow[]): { id: number; name: string }[] {
  const map = new Map<number, string>();
  for (const p of list) {
    if (p.groupId != null && p.groupName) map.set(p.groupId, p.groupName);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function collectLeaderboardDirections(list: LeaderboardParticipantRow[]): string[] {
  return [...new Set(list.map(p => p.direction).filter(Boolean))] as string[];
}
