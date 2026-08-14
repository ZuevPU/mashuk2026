import { useEffect, useMemo, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { Tab } from '../../tabs';
import { HubLensLayout, type HubNavItem } from '../hub/HubSideNav';
import { LeaderboardDashboard } from './LeaderboardDashboard';
import { LeaderboardFilters } from './LeaderboardFilters';
import { LeaderboardTable } from './LeaderboardTable';
import {
  buildLeaderboardQuery,
  DEFAULT_LEADERBOARD_FILTERS,
  scopeLabel,
  type LeaderboardFiltersState,
  type LeaderboardRow,
} from './leaderboardTypes';

const RATING_NAV: HubNavItem[] = [
  { id: 'rating-hero', label: 'Обзор' },
  { id: 'rating-board', label: 'Лидеры' },
  { id: 'rating-links', label: 'Переходы' },
];

function parseHashFilters(): Partial<LeaderboardFiltersState> {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const patch: Partial<LeaderboardFiltersState> = {};
  const mode = params.get('mode');
  if (mode === 'points' || mode === 'nomination') patch.mode = mode;
  else if (mode === 'medals') patch.mode = 'points';
  const scope = params.get('scope');
  if (scope === 'total' || scope === 'day') patch.scope = scope;
  else if (scope === 'shift') patch.scope = 'total';
  const track = params.get('track');
  if (track === 'total' || track === 'path' || track === 'experience') patch.track = track;
  if (params.get('day')) patch.day = params.get('day')!;
  if (params.get('nomination')) patch.nomination = params.get('nomination')!;
  const medalMode = params.get('medalMode');
  if (medalMode === 'count') patch.medalFilter = 'count';
  if (medalMode === 'holders') patch.medalFilter = 'holders';
  if (params.get('medalId')) patch.medalId = params.get('medalId')!;
  if (params.get('direction')) patch.direction = params.get('direction')!;
  if (params.get('groupId')) patch.groupId = params.get('groupId')!;
  if (params.get('search')) patch.search = params.get('search')!;
  if (params.get('showAll') === 'true') patch.showAll = true;
  const sort = params.get('sort');
  if (sort === 'name' || sort === 'score') patch.sort = sort;
  return patch;
}

export function LeaderboardScreen({
  adminFetch,
  onOpenCard,
}: {
  adminFetch: AdminTabProps['adminFetch'];
  onOpenCard?: (participantId: number) => void;
}) {
  const initial = useMemo(() => parseHashFilters(), []);
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    ...DEFAULT_LEADERBOARD_FILTERS,
    ...initial,
  });
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [medals, setMedals] = useState<{ id: number; name: string }[]>([]);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminFetch('/medals?tab=active').then((r: { medals?: { id: number; name: string }[] }) => r.medals ?? []).catch(() => []),
      adminFetch('/participants/groups').then((r: { groups?: { id: number; name: string }[] }) => r.groups ?? []).catch(() => []),
    ]).then(([medalList, groupList]) => {
      setMedals(medalList);
      setGroups(groupList);
    });
  }, [adminFetch]);

  const load = () => {
    setLoading(true);
    setError(null);
    adminFetch(`/leaderboard?${buildLeaderboardQuery(filters)}`)
      .then((r: { leaders?: LeaderboardRow[]; directions?: string[]; groups?: { id: number; name: string }[]; participantCount?: number }) => {
        setRows(r.leaders ?? []);
        if (r.directions?.length) setDirections(r.directions);
        if (r.groups?.length) setGroups(r.groups);
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

  const scopeLabelText = filters.scope === 'day'
    ? `День ${filters.day}`
    : scopeLabel(filters.scope);

  return (
    <div className="leaderboard-screen adm-kb">
      <header className="leaderboard-screen-header">
        <h1>Таблица лидеров</h1>
        <p className="adm-muted">
          {scopeLabelText}
          {participantCount != null ? ` · ${participantCount} участников` : ''}
        </p>
      </header>

      <div className="card adm-forum-block adm-kb-panel lb-screen-filters">
        <div className="adm-kb-panel-head">
          <h3>Фильтры</h3>
          <p className="adm-kb-panel-sub">Срез, день, направление и поиск по таблице.</p>
        </div>
        <LeaderboardFilters
          filters={filters}
          onChange={patch => setFilters(prev => ({ ...prev, ...patch }))}
          directions={directions}
          groups={groups}
          medals={medals}
        />
      </div>

      <div className="card adm-forum-block adm-kb-panel">
        <div className="adm-kb-panel-head">
          <h3>Рейтинг</h3>
          <p className="adm-kb-panel-sub">Актуальное положение участников по выбранному срезу.</p>
        </div>
        <LeaderboardTable
          rows={rows}
          filters={filters}
          loading={loading}
          error={error}
          participantCount={participantCount ?? undefined}
          maxRows={filters.showAll ? undefined : 50}
          searchHighlight={filters.search}
          onOpenCard={onOpenCard}
        />
      </div>
    </div>
  );
}

export function RatingTab({
  adminFetch,
  setTab,
  onOpenCard,
}: AdminTabProps & { onOpenCard?: (participantId: number) => void }) {
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
    <HubLensLayout className="adm-forum adm-kb" items={RATING_NAV} navLabel="Разделы рейтинга">
      <section id="rating-hero" className="adm-forum-anchor">
        <AdminPageHero
          title="Рейтинг"
          hint="Таблицы лидеров, номинации и быстрые переходы к заданиям, модерации и выгрузкам."
        />
      </section>

      <section id="rating-board" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Таблица лидеров</h3>
            <p className="adm-kb-panel-sub">Баллы и номинации с фильтрами и выгрузкой CSV.</p>
          </div>
          <LeaderboardDashboard
            adminFetch={adminFetch}
            forumDay={forumDay}
            autoRefreshMs={60_000}
            onOpenFullscreen={openScreen}
            onOpenCard={onOpenCard}
          />
        </div>
      </section>

      <section id="rating-links" className="adm-forum-anchor">
        <div className="card adm-forum-block adm-kb-panel">
          <div className="adm-kb-panel-head">
            <h3>Смежные разделы</h3>
            <p className="adm-kb-panel-sub">Быстрый переход к связанным вкладкам админки.</p>
          </div>
          <div className="adm-mod-item-actions" style={{ marginTop: 0 }}>
            {[
              { id: 'tasks' as Tab, label: 'Задания' },
              { id: 'moderation' as Tab, label: 'Модерация' },
              { id: 'medals' as Tab, label: 'Медали' },
              { id: 'levels' as Tab, label: 'Система баллов' },
              { id: 'participants' as Tab, label: 'Участники' },
              { id: 'exports' as Tab, label: 'Выгрузки' },
              { id: 'analytics' as Tab, label: 'Аналитика' },
            ].map(item => (
              <button key={item.id} type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => jump(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </HubLensLayout>
  );
}
