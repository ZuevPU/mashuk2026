export type LeaderboardMode = 'points' | 'nomination';
/** @deprecated use medalFilter on points mode */
export type LegacyLeaderboardMode = 'points' | 'medals' | 'nomination';
export type LeaderboardScope = 'total' | 'day' | 'shift';
export type LeaderboardTrack = 'total' | 'path' | 'experience';
export type MedalMode = 'count' | 'holders';
export type MedalFilter = '' | 'count' | 'holders';
export type LeaderboardSort = 'score' | 'name';

export const FORUM_RATING_DAYS = [1, 2, 3, 4, 5, 6] as const;

export type LeaderboardRow = {
  rank: number;
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  direction?: string | null;
  groupId?: number | null;
  groupName?: string | null;
  avatarUrl?: string | null;
  score: number;
};

export type LeaderboardFiltersState = {
  mode: LeaderboardMode;
  scope: LeaderboardScope;
  track: LeaderboardTrack;
  day: string;
  nomination: string;
  medalFilter: MedalFilter;
  medalId: string;
  direction: string;
  groupId: string;
  search: string;
  sort: LeaderboardSort;
  showAll: boolean;
};

export const NOMINATION_OPTIONS: { key: string; label: string }[] = [
  { key: 'sport', label: 'Спорт' },
  { key: 'creative', label: 'Креатив' },
  { key: 'media', label: 'Медиа' },
  { key: 'education', label: 'Образование' },
  { key: 'culture', label: 'Культура' },
  { key: 'volunteer', label: 'Волонтёрство' },
  { key: 'team', label: 'Командность' },
  { key: 'networking', label: 'Нетворкинг' },
  { key: 'leadership', label: 'Лидерство' },
  { key: 'general', label: 'Общий зачёт' },
];

export const DEFAULT_LEADERBOARD_FILTERS: LeaderboardFiltersState = {
  mode: 'points',
  scope: 'total',
  track: 'total',
  day: '1',
  nomination: 'sport',
  medalFilter: '',
  medalId: '',
  direction: '',
  groupId: '',
  search: '',
  sort: 'score',
  showAll: false,
};

export function buildLeaderboardQuery(f: LeaderboardFiltersState): URLSearchParams {
  const q = new URLSearchParams({ mode: f.mode, scope: f.scope, sort: f.sort });
  if (f.mode === 'points') q.set('track', f.track);
  if (f.scope === 'day') q.set('day', f.day);
  if (f.direction) q.set('direction', f.direction);
  if (f.groupId) q.set('groupId', f.groupId);
  if (f.search.trim()) q.set('search', f.search.trim());
  if (f.showAll) q.set('showAll', 'true');
  if (f.mode === 'nomination') q.set('nomination', f.nomination);
  if (f.mode === 'points' && f.medalFilter === 'count') {
    q.set('medalMode', 'count');
  }
  if (f.mode === 'points' && f.medalFilter === 'holders') {
    q.set('medalMode', 'holders');
    if (f.medalId) q.set('medalId', f.medalId);
  }
  return q;
}

export function leaderboardRowName(row: LeaderboardRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || '—';
}

export function scoreLabel(f: LeaderboardFiltersState): string {
  if (f.mode === 'points' && f.medalFilter === 'count') return 'Медалей';
  if (f.mode === 'points' && f.medalFilter === 'holders') return 'Баллы';
  if (f.mode === 'nomination') return 'Баллы';
  if (f.track === 'path') return 'Путь';
  if (f.track === 'experience') return 'Опыт';
  return 'Баллы';
}

export function scorePrefix(f: LeaderboardFiltersState): string {
  if (f.mode === 'points' && f.medalFilter) return '🏅';
  if (f.track === 'path') return '📍';
  if (f.track === 'experience') return '⚡';
  return '✦';
}

export function scopeLabel(scope: LeaderboardScope): string {
  if (scope === 'total') return 'Итоговый';
  if (scope === 'day') return 'За день';
  return 'За смену';
}

export function trackLabel(track: LeaderboardTrack): string {
  if (track === 'path') return 'Путь';
  if (track === 'experience') return 'Опыт';
  return 'Сумма треков';
}
