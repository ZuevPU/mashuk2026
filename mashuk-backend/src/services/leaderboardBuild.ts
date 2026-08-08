import {
  resolveLeaderboardScoreMap,
  sortLeaderboardByScore,
  participantIdsWithMedal,
  type LeaderboardMode,
} from './leaderboardService.js';
import {
  collectLeaderboardDirections,
  collectLeaderboardGroups,
  filterLeaderboardParticipants,
  type LeaderboardParticipantRow,
  type ParsedLeaderboardQuery,
} from './leaderboardQuery.js';

export type LeaderboardResultRow = {
  rank: number;
  id: number;
  firstName: string | null;
  lastName: string | null;
  direction: string | null;
  groupId: number | null;
  groupName: string | null;
  avatarUrl: string | null;
  score: number;
};

export async function buildLeaderboardResult(
  allParticipants: LeaderboardParticipantRow[],
  query: ParsedLeaderboardQuery,
  opts: {
    keepParticipantId?: number;
    hideFromLeaderboard?: boolean;
    organizerDirectionIds?: Set<number> | null;
  } = {},
): Promise<{
  mode: LeaderboardMode;
  track: string;
  scope: ParsedLeaderboardQuery['scope'];
  day: number | null;
  nomination: string | null;
  medalMode: ParsedLeaderboardQuery['medalMode'] | null;
  medalId: number | null;
  medalFilter: string | null;
  direction: string | null;
  groupId: number | null;
  search: string | null;
  sort: ParsedLeaderboardQuery['sort'];
  directions: string[];
  groups: { id: number; name: string }[];
  participantCount: number;
  leaders: LeaderboardResultRow[];
}> {
  const effectiveMode = query.mode;
  const medalAsScore = effectiveMode === 'points' && query.medalMode === 'count';
  const medalHolderFilter = effectiveMode === 'points'
    && query.medalMode === 'holders'
    && query.medalId;

  let medalSet: Set<number> | null = null;
  if ((effectiveMode === 'medals' || medalHolderFilter) && query.medalMode === 'holders' && query.medalId) {
    medalSet = await participantIdsWithMedal(query.medalId);
  }

  const visible = filterLeaderboardParticipants(allParticipants, {
    direction: query.direction,
    groupId: query.groupId,
    search: query.search,
    hideFromLeaderboard: opts.hideFromLeaderboard ?? true,
    keepParticipantId: opts.keepParticipantId,
    medalHolderIds: medalSet,
    organizerDirectionIds: opts.organizerDirectionIds,
  });

  const ids = visible.map(p => p.id);
  const scoreMap = await resolveLeaderboardScoreMap(
    ids,
    {
      mode: effectiveMode === 'points' && medalAsScore ? 'points' : effectiveMode,
      track: effectiveMode === 'nomination' ? 'total' : query.track,
      scope: query.scope,
      day: query.day,
      nomination: effectiveMode === 'nomination' ? query.nomination : undefined,
      medalMode: query.medalMode ?? undefined,
      medalId: query.medalId,
      medalAsScore,
    },
    visible,
  );

  const ranked = sortLeaderboardByScore(
    visible.map(p => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      direction: p.direction,
      groupId: p.groupId,
      groupName: p.groupName,
      avatarUrl: p.avatarUrl ?? null,
      score: scoreMap.get(p.id) ?? 0,
    })),
    query.sort,
  ).map((p, i) => ({
    rank: i + 1,
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    direction: p.direction,
    groupId: p.groupId ?? null,
    groupName: p.groupName ?? null,
    avatarUrl: p.avatarUrl,
    score: p.score,
  }));

  const holdersOnly = (effectiveMode === 'medals' || medalAsScore)
    && query.medalMode === 'holders'
    && query.medalId;
  const filteredRanked = holdersOnly ? ranked.filter(r => r.score > 0) : ranked;
  const leaders = query.limit > 0 ? filteredRanked.slice(0, query.limit) : filteredRanked;

  const medalFilter = effectiveMode === 'points' && query.medalMode !== 'count'
    ? (query.medalMode === 'holders' && query.medalId ? 'holders' : null)
    : (effectiveMode === 'points' && query.medalMode === 'count' ? 'count' : null);

  return {
    mode: effectiveMode,
    track: effectiveMode === 'nomination' ? 'nomination' : query.track,
    scope: query.scope,
    day: query.scope === 'day' ? (query.day ?? null) : null,
    nomination: effectiveMode === 'nomination' ? (query.nomination || null) : null,
    medalMode: effectiveMode === 'medals' || medalAsScore || medalFilter ? query.medalMode : null,
    medalId: query.medalId ?? null,
    medalFilter,
    direction: query.direction || null,
    groupId: query.groupId ?? null,
    search: query.search || null,
    sort: query.sort,
    directions: collectLeaderboardDirections(allParticipants),
    groups: collectLeaderboardGroups(allParticipants),
    participantCount: filteredRanked.length,
    leaders,
  };
}
