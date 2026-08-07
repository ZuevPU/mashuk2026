import { useCallback, useEffect, useState } from 'react';
import { adminDownloadBinary } from '../../admin/client';
import type { AdminTabProps } from '../admin/types';
import { LeaderboardFilters } from './LeaderboardFilters';
import { LeaderboardTable } from './LeaderboardTable';
import {
  buildLeaderboardQuery,
  DEFAULT_LEADERBOARD_FILTERS,
  type LeaderboardFiltersState,
  type LeaderboardRow,
} from './leaderboardTypes';

type MedalOption = { id: number; name: string };
type GroupOption = { id: number; name: string };

export function LeaderboardDashboard({
  adminFetch,
  forumDay,
  initialFilters,
  autoRefreshMs,
  maxRows,
  onOpenFullscreen,
  onOpenCard,
  showModeTabs,
  onExport,
}: {
  adminFetch: AdminTabProps['adminFetch'];
  forumDay?: string;
  initialFilters?: Partial<LeaderboardFiltersState>;
  autoRefreshMs?: number;
  maxRows?: number;
  onOpenFullscreen?: (q: URLSearchParams) => void;
  onOpenCard?: (participantId: number) => void;
  showModeTabs?: boolean;
  onExport?: (q: URLSearchParams) => void | Promise<void>;
}) {
  const defaultDay = forumDay && Number(forumDay) <= 6 ? forumDay : '1';
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    ...DEFAULT_LEADERBOARD_FILTERS,
    day: defaultDay,
    ...initialFilters,
  });
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [medals, setMedals] = useState<MedalOption[]>([]);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminFetch('/medals?tab=active').then((r: { medals?: MedalOption[] }) => r.medals ?? []).catch(() => []),
      adminFetch('/participants/groups').then((r: { groups?: GroupOption[] }) => r.groups ?? []).catch(() => []),
    ]).then(([medalList, groupList]) => {
      setMedals(medalList);
      setGroups(groupList);
    });
  }, [adminFetch]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = buildLeaderboardQuery(filters);
    adminFetch(`/leaderboard?${q}`)
      .then((r: {
        leaders?: LeaderboardRow[];
        directions?: string[];
        groups?: GroupOption[];
        participantCount?: number;
      }) => {
        setRows(r.leaders ?? []);
        if (r.directions?.length) setDirections(r.directions);
        if (r.groups?.length) setGroups(r.groups);
        setParticipantCount(r.participantCount ?? (r.leaders?.length ?? null));
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [adminFetch, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs) return undefined;
    const t = window.setInterval(load, autoRefreshMs);
    return () => window.clearInterval(t);
  }, [autoRefreshMs, load]);

  const patchFilters = (patch: Partial<LeaderboardFiltersState>) => {
    setFilters(prev => ({ ...prev, ...patch }));
  };

  const downloadExport = async () => {
    const q = buildLeaderboardQuery({ ...filters, showAll: true });
    q.set('format', 'csv');
    const filename = `leaderboard_${filters.mode}_${filters.scope}.csv`;
    if (onExport) {
      await onExport(q);
      return;
    }
    await adminDownloadBinary(`/exports/rating/leaderboard?${q}`, filename);
  };

  const uiMaxRows = filters.showAll ? undefined : (maxRows ?? 50);

  return (
    <div className="lb-dashboard card">
      {showModeTabs !== false && (
        <div className="lb-mode-tabs">
          {([
            { key: 'points' as const, label: 'Баллы' },
            { key: 'nomination' as const, label: 'Номинации' },
          ]).map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`lb-mode-tab ${filters.mode === tab.key ? 'on' : ''}`}
              onClick={() => patchFilters({ mode: tab.key })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <LeaderboardFilters
        filters={filters}
        onChange={patchFilters}
        directions={directions}
        groups={groups}
        medals={medals}
        forumDay={forumDay}
        compact={showModeTabs === false}
      />

      <div className="lb-toolbar">
        {onOpenFullscreen && (
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => onOpenFullscreen(buildLeaderboardQuery(filters))}
          >
            На весь экран
          </button>
        )}
        <button type="button" className="adm-btn adm-btn-secondary" onClick={() => void downloadExport()}>
          Скачать CSV (полная таблица)
        </button>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={load}>
          Обновить
        </button>
      </div>

      <LeaderboardTable
        rows={rows}
        filters={filters}
        loading={loading}
        error={error}
        participantCount={participantCount ?? undefined}
        maxRows={uiMaxRows}
        searchHighlight={filters.search.trim()}
        onOpenCard={onOpenCard}
      />
    </div>
  );
}
