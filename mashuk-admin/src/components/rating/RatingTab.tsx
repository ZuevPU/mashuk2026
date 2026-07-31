import { useEffect, useMemo, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { Tab } from '../../tabs';
import { LeaderboardDashboard } from './LeaderboardDashboard';
import { LeaderboardFilters } from './LeaderboardFilters';
import { LeaderboardTable } from './LeaderboardTable';
import {
  buildLeaderboardQuery,
  DEFAULT_LEADERBOARD_FILTERS,
  type LeaderboardFiltersState,
  type LeaderboardRow,
} from './leaderboardTypes';

function parseHashFilters(): Partial<LeaderboardFiltersState> {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const patch: Partial<LeaderboardFiltersState> = {};
  const mode = params.get('mode');
  if (mode === 'points' || mode === 'medals' || mode === 'nomination') patch.mode = mode;
  const scope = params.get('scope');
  if (scope === 'total' || scope === 'day' || scope === 'shift') patch.scope = scope;
  const track = params.get('track');
  if (track === 'total' || track === 'path' || track === 'experience') patch.track = track;
  if (params.get('day')) patch.day = params.get('day')!;
  if (params.get('nomination')) patch.nomination = params.get('nomination')!;
  const medalMode = params.get('medalMode');
  if (medalMode === 'count' || medalMode === 'holders') patch.medalMode = medalMode;
  if (params.get('medalId')) patch.medalId = params.get('medalId')!;
  if (params.get('direction')) patch.direction = params.get('direction')!;
  const sort = params.get('sort');
  if (sort === 'name' || sort === 'score') patch.sort = sort;
  return patch;
}

export function LeaderboardScreen({
  adminFetch,
}: {
  adminFetch: AdminTabProps['adminFetch'];
}) {
  const initial = useMemo(() => parseHashFilters(), []);
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    ...DEFAULT_LEADERBOARD_FILTERS,
    ...initial,
  });
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [medals, setMedals] = useState<{ id: number; name: string }[]>([]);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch('/medals?tab=active')
      .then((r: { medals?: { id: number; name: string }[] }) => setMedals(r.medals ?? []))
      .catch(() => undefined);
  }, [adminFetch]);

  const load = () => {
    setLoading(true);
    setError(null);
    adminFetch(`/leaderboard?${buildLeaderboardQuery(filters)}`)
      .then((r: { leaders?: LeaderboardRow[]; directions?: string[]; participantCount?: number }) => {
        setRows(r.leaders ?? []);
        if (r.directions?.length) setDirections(r.directions);
        setParticipantCount(r.participantCount ?? null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const scopeLabel = filters.scope === 'day'
    ? `День ${filters.day}`
    : filters.scope === 'shift'
      ? 'Смена'
      : 'Общий';

  return (
    <div className="leaderboard-screen">
      <header className="leaderboard-screen-header">
        <h1>Таблица лидеров</h1>
        <p className="adm-muted">
          {scopeLabel}
          {participantCount != null ? ` · ${participantCount} участников` : ''}
        </p>
      </header>

      <div className="lb-card lb-screen-filters">
        <LeaderboardFilters
          filters={filters}
          onChange={patch => setFilters(prev => ({ ...prev, ...patch }))}
          directions={directions}
          medals={medals}
        />
      </div>

      <div className="lb-card">
        <LeaderboardTable
          rows={rows}
          filters={filters}
          loading={loading}
          error={error}
          participantCount={participantCount ?? undefined}
        />
      </div>
    </div>
  );
}

export function RatingTab({ adminFetch, setTab }: AdminTabProps) {
  const [forumDay, setForumDay] = useState('1');

  useEffect(() => {
    adminFetch('/analytics/meta')
      .then((s: { currentForumDay?: number }) => setForumDay(String(s.currentForumDay ?? 1)))
      .catch(() => undefined);
  }, [adminFetch]);

  const openScreen = (q: URLSearchParams) => {
    window.open(
      `${window.location.pathname}${window.location.search}#/leaderboard-screen?${q}`,
      '_blank',
      'noopener',
    );
  };

  const jump = (t: Tab) => { if (setTab) setTab(t); };

  return (
    <div>
      <AdminPageHero
        title="Система рейтинга"
        hint="Таблицы лидеров, медали, номинации и выгрузки для игропатиков."
      />

      <LeaderboardDashboard
        adminFetch={adminFetch}
        forumDay={forumDay}
        autoRefreshMs={60_000}
        onOpenFullscreen={openScreen}
      />

      <div className="adm-card-grid lb-quick-grid">
        {[
          { id: 'tasks' as Tab, label: 'Каталог заданий' },
          { id: 'moderation' as Tab, label: 'Модерация заявок' },
          { id: 'medals' as Tab, label: 'Медали' },
          { id: 'levels' as Tab, label: 'Ставки и лидеры' },
          { id: 'participants' as Tab, label: 'Участники' },
          { id: 'exports' as Tab, label: 'Выгрузки рейтинга' },
          { id: 'analytics' as Tab, label: 'Активность' },
        ].map(item => (
          <button key={item.id} type="button" className="card adm-btn adm-btn-secondary" onClick={() => jump(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
