import { useCallback, useEffect, useState } from 'react';
import type { AdminTabProps } from '../admin/types';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { Tab } from '../../tabs';

type LeaderboardRow = {
  rank: number;
  firstName?: string;
  lastName?: string;
  direction?: string;
  score: number;
};

export function LeaderboardScreen({
  adminFetch,
}: {
  adminFetch: AdminTabProps['adminFetch'];
}) {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const scope = params.get('scope') || 'shift';
  const track = params.get('track') || 'total';
  const day = params.get('day') || '1';

  const [data, setData] = useState<{
    leaders: LeaderboardRow[];
    participantCount?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ scope, track });
    if (scope === 'day') q.set('day', day);
    adminFetch(`/leaderboard?${q}`)
      .then(r => setData(r as typeof data))
      .catch(e => setError(String(e)));
  }, [adminFetch, scope, track, day]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="leaderboard-screen">
      <header className="leaderboard-screen-header">
        <h1>Таблица лидеров</h1>
        <p className="adm-muted">
          {scope === 'day' ? `День ${day}` : scope === 'shift' ? 'Смена' : 'Общий'} · {track === 'total' ? 'рейтинг' : track}
          {data?.participantCount != null ? ` · ${data.participantCount} участников` : ''}
        </p>
      </header>
      {error && <p className="admin-login-error">{error}</p>}
      <table className="adm-table leaderboard-screen-table">
        <thead>
          <tr><th>#</th><th>Участник</th><th>Направление</th><th>Баллы</th></tr>
        </thead>
        <tbody>
          {(data?.leaders ?? []).slice(0, 50).map(row => (
            <tr key={row.rank}>
              <td>{row.rank}</td>
              <td>{[row.lastName, row.firstName].filter(Boolean).join(' ') || '—'}</td>
              <td>{row.direction || '—'}</td>
              <td><strong>{row.score}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RatingTab({ adminFetch, setTab }: AdminTabProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    adminFetch('/leaderboard?scope=shift&track=total')
      .then((r: { participantCount?: number }) => setCount(r.participantCount ?? null))
      .catch(() => undefined);
  }, [adminFetch]);

  const openScreen = (scope: string, day?: string) => {
    const q = new URLSearchParams({ scope, track: 'total' });
    if (day) q.set('day', day);
    window.open(`${window.location.pathname}${window.location.search}#/leaderboard-screen?${q}`, '_blank', 'noopener');
  };

  const jump = (t: Tab) => { if (setTab) setTab(t); };

  return (
    <div>
      <AdminPageHero
        title="Система рейтинга"
        hint="Задания, модерация, медали, лидеры и выгрузки для игропатиков."
      />
      {count != null && (
        <p className="adm-muted" style={{ marginBottom: 16 }}>
          Участников в публичном рейтинге смены: <strong>{count}</strong>
        </p>
      )}
      <div className="adm-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
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
        <button type="button" className="card adm-btn adm-btn-primary" onClick={() => openScreen('shift')}>
          Экран лидеров (смена)
        </button>
        <button type="button" className="card adm-btn adm-btn-secondary" onClick={() => openScreen('day', '1')}>
          Экран лидеров (день)
        </button>
      </div>
    </div>
  );
}
