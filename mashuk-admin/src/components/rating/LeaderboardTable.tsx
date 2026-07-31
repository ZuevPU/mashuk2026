import { ParticipantAvatar } from '../participants/ParticipantAvatar';
import type { LeaderboardFiltersState, LeaderboardRow } from './leaderboardTypes';
import { leaderboardRowName, scorePrefix } from './leaderboardTypes';

export function LeaderboardTable({
  rows,
  filters,
  loading,
  error,
  participantCount,
  maxRows,
  emptyHint,
}: {
  rows: LeaderboardRow[];
  filters: LeaderboardFiltersState;
  loading?: boolean;
  error?: string | null;
  participantCount?: number;
  maxRows?: number;
  emptyHint?: string;
}) {
  const shown = maxRows != null ? rows.slice(0, maxRows) : rows;
  const prefix = scorePrefix(filters);

  if (loading) {
    return <p className="adm-muted lb-status">Загрузка рейтинга…</p>;
  }
  if (error) {
    return <p className="admin-login-error lb-status">{error}</p>;
  }
  if (!shown.length) {
    return (
      <div className="lb-empty card">
        <div className="lb-empty-icon">🏆</div>
        <div className="lb-empty-title">Рейтинг пуст</div>
        <p className="adm-muted">{emptyHint ?? 'Нет данных для выбранных фильтров'}</p>
      </div>
    );
  }

  return (
    <div className="lb-table-wrap">
      {participantCount != null && (
        <p className="adm-muted lb-meta">
          Участников: <strong>{participantCount}</strong>
          {shown.length < rows.length ? ` · показано ${shown.length}` : ''}
        </p>
      )}
      <div className="lb-table">
        {shown.map(row => {
          const top3 = row.rank <= 3;
          return (
            <div
              key={row.id}
              className={`lb-row ${top3 ? `lb-row-top${row.rank}` : ''}`}
            >
              <div className={`lb-rank ${top3 ? 'lb-rank-top' : ''}`}>{row.rank}</div>
              <ParticipantAvatar
                firstName={row.firstName}
                lastName={row.lastName}
                avatarUrl={row.avatarUrl}
                size="sm"
              />
              <div className="lb-name-block">
                <div className="lb-name">{leaderboardRowName(row)}</div>
                {row.direction && <div className="lb-direction">{row.direction}</div>}
              </div>
              <div className="lb-score">
                {filters.mode === 'medals' && filters.medalMode === 'holders'
                  ? '🏅'
                  : `${prefix} ${row.score}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
