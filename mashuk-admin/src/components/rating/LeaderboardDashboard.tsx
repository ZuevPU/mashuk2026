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

export function LeaderboardDashboard({
  adminFetch,
  forumDay,
  initialFilters,
  autoRefreshMs,
  maxRows,
  onOpenFullscreen,
  showModeTabs,
  onExport,
}: {
  adminFetch: AdminTabProps['adminFetch'];
  forumDay?: string;
  initialFilters?: Partial<LeaderboardFiltersState>;
  autoRefreshMs?: number;
  maxRows?: number;
  onOpenFullscreen?: (q: URLSearchParams) => void;
  showModeTabs?: boolean;
  onExport?: (q: URLSearchParams) => void | Promise<void>;
}) {
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    ...DEFAULT_LEADERBOARD_FILTERS,
    day: forumDay || '1',
    ...initialFilters,
  });
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [medals, setMedals] = useState<MedalOption[]>([]);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch('/medals?tab=active')
      .then((r: { medals?: MedalOption[] }) => setMedals(r.medals ?? []))
      .catch(() => undefined);
  }, [adminFetch]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = buildLeaderboardQuery(filters);
    adminFetch(`/leaderboard?${q}`)
      .then((r: {
        leaders?: LeaderboardRow[];
        directions?: string[];
        participantCount?: number;
      }) => {
        setRows(r.leaders ?? []);
        if (r.directions?.length) setDirections(r.directions);
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
    const q = buildLeaderboardQuery(filters);
    q.set('format', 'csv');
    const ext = 'csv';
    const filename = `leaderboard_${filters.mode}_${filters.scope}.${ext}`;
    if (onExport) {
      await onExport(q);
      return;
    }
    await adminDownloadBinary(`/exports/rating/leaderboard?${q}`, filename);
  };

  return (
    <div className="lb-dashboard card">
      {showModeTabs !== false && (
        <div className="lb-mode-tabs">
          {([
            { key: 'points' as const, label: 'Баллы' },
            { key: 'medals' as const, label: 'Медали' },
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
          Скачать CSV
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
        maxRows={maxRows}
      />
    </div>
  );
}
