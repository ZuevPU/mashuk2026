export type LeaderboardMode = 'points' | 'medals' | 'nomination';
export type LeaderboardScope = 'total' | 'day' | 'shift';
export type LeaderboardTrack = 'total' | 'path' | 'experience';
export type MedalMode = 'count' | 'holders';
export type LeaderboardSort = 'score' | 'name';

export type LeaderboardRow = {
  rank: number;
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  direction?: string | null;
  avatarUrl?: string | null;
  score: number;
};

export type LeaderboardFiltersState = {
  mode: LeaderboardMode;
  scope: LeaderboardScope;
  track: LeaderboardTrack;
  day: string;
  nomination: string;
  medalMode: MedalMode;
  medalId: string;
  direction: string;
  sort: LeaderboardSort;
};

export const NOMINATION_OPTIONS: { key: string; label: string }[] = [
  { key: 'sport', label: 'Спорт' },
  { key: 'creative', label: 'Креатив' },
  { key: 'media', label: 'Медиа' },
  { key: 'education', label: 'Образование' },
  { key: 'culture', label: 'Культура' },
  { key: 'volunteer', label: 'Волонтёрство' },
  { key: 'team', label: 'Командность' },
  { key: 'general', label: 'Общий зачёт' },
];

export const DEFAULT_LEADERBOARD_FILTERS: LeaderboardFiltersState = {
  mode: 'points',
  scope: 'shift',
  track: 'total',
  day: '1',
  nomination: 'sport',
  medalMode: 'count',
  medalId: '',
  direction: '',
  sort: 'score',
};

export function buildLeaderboardQuery(f: LeaderboardFiltersState): URLSearchParams {
  const q = new URLSearchParams({ mode: f.mode, scope: f.scope, sort: f.sort });
  if (f.mode === 'points') q.set('track', f.track);
  if (f.scope === 'day') q.set('day', f.day);
  if (f.direction) q.set('direction', f.direction);
  if (f.mode === 'nomination') q.set('nomination', f.nomination);
  if (f.mode === 'medals') {
    q.set('medalMode', f.medalMode);
    if (f.medalMode === 'holders' && f.medalId) q.set('medalId', f.medalId);
  }
  return q;
}

export function leaderboardRowName(row: LeaderboardRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || '—';
}

export function scoreLabel(f: LeaderboardFiltersState): string {
  if (f.mode === 'medals') return f.medalMode === 'holders' ? 'Медаль' : 'Медалей';
  if (f.mode === 'nomination') return 'Баллы';
  if (f.track === 'path') return 'Путь';
  if (f.track === 'experience') return 'Опыт';
  return 'Баллы';
}

export function scorePrefix(f: LeaderboardFiltersState): string {
  if (f.mode === 'medals') return '🏅';
  if (f.track === 'path') return '📍';
  if (f.track === 'experience') return '⚡';
  return '✦';
}
