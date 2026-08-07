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
  searchHighlight,
  onOpenCard,
}: {
  rows: LeaderboardRow[];
  filters: LeaderboardFiltersState;
  loading?: boolean;
  error?: string | null;
  participantCount?: number;
  maxRows?: number;
  emptyHint?: string;
  searchHighlight?: string;
  onOpenCard?: (participantId: number) => void;
}) {
  const shown = maxRows != null ? rows.slice(0, maxRows) : rows;
  const prefix = scorePrefix(filters);
  const highlight = searchHighlight?.trim().toLowerCase() ?? '';

  const nameMatches = (row: LeaderboardRow) => {
    if (!highlight) return false;
    return leaderboardRowName(row).toLowerCase().includes(highlight) || String(row.id).includes(highlight);
  };

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
          {maxRows != null && shown.length < participantCount
            ? ` · топ-${shown.length} (включите «Показать всех» или скачайте CSV)`
            : ''}
        </p>
      )}
      <div className="lb-table">
        {shown.map(row => {
          const top3 = row.rank <= 3;
          const clickable = !!onOpenCard;
          const className = [
            'lb-row',
            top3 ? `lb-row-top${row.rank}` : '',
            nameMatches(row) ? 'lb-row-highlight' : '',
            clickable ? 'lb-row-clickable' : '',
          ].filter(Boolean).join(' ');
          return (
            <div
              key={row.id}
              className={className}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onOpenCard!(row.id) : undefined}
              onKeyDown={clickable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenCard!(row.id);
                }
              } : undefined}
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
                <div className="lb-direction">
                  {[row.direction, row.groupName].filter(Boolean).join(' · ') || null}
                </div>
              </div>
              <div className="lb-score">{`${prefix} ${row.score}`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
