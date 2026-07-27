import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { label } from '../../labels/ru';
import { AdminPageHero } from '../admin/AdminPageHero';
import type { AdminTabProps } from '../admin/types';

type ParticipantCardTab = 'profile' | 'answers' | 'tasks' | 'medals' | 'points' | 'piggybank';

export type AnalyticsTabProps = AdminTabProps & {
  onOpenCard: (id: number, tab?: ParticipantCardTab) => void;
};

export function AnalyticsTab({ adminFetch, act, reloadKey, onOpenCard }: AnalyticsTabProps) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [dashboards, setDashboards] = useState<any>(null);
  const [departurePortrait, setDeparturePortrait] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAnalytics(await adminFetch('/analytics/summary'));
      setCharts(await adminFetch('/analytics/charts'));
      setDashboards(await adminFetch('/analytics/dashboards?mode=today'));
      setDeparturePortrait(await adminFetch('/analytics/departure-portrait'));
      setLeaderboard((await adminFetch('/leaderboard?track=total')).leaders || []);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, reloadKey]);

  const emotionChartData = useMemo(
    () => (charts?.emotions
      ? Object.entries(charts.emotions as Record<string, number>).map(([name, value]) => ({ name: label(name), value }))
      : []),
    [charts],
  );

  const recalculate = () => adminFetch('/analytics/recalculate', { method: 'POST' }).then(load);

  if (loading || !analytics) {
    return <p className="adm-muted">Загрузка аналитики…</p>;
  }

  return (
    <div className="adm-forum adm-analytics">
      <AdminPageHero title="Аналитика" hint="Сводка, дашборды, графики и портрет заезда." />

      {dashboards && (
        <div className="card">
          <h3>Дашборды v1</h3>
          <p>Зарегистрировано: {dashboards.pulse?.registered} · Ответов: {dashboards.pulse?.totalAnswers}</p>
          <p style={{ fontSize: 12 }}>GigaChat: {dashboards.gigachat?.configured ? 'настроен' : 'не настроен (.env)'}</p>
          <p style={{ fontSize: 12 }}>Программа: событий {dashboards.program?.eventsCount ?? 0} · материалов {dashboards.program?.materialsCount ?? 0}</p>
          <p style={{ fontSize: 12 }}>Заданий подтверждено: {dashboards.activity?.tasksApproved ?? 0} · Копилка: {dashboards.piggybank?.total ?? 0}</p>
          <p style={{ fontSize: 12 }}>
            Задания: на модерации {dashboards.activity?.tasksPendingModeration ?? 0}
            {' · '}командные {dashboards.activity?.teamPendingConfirm ?? 0}
          </p>
          <p style={{ fontSize: 12 }}>
            Итоговая анкета: черновиков {dashboards.activity?.eveningDrafts ?? 0}
            {' · '}сдано за день {dashboards.activity?.eveningCompletedForDay ?? 0}
          </p>
          {dashboards.activity?.emotionZones && (
            <p style={{ fontSize: 12 }}>
              5 зон эмоций:{' '}
              {Object.entries(dashboards.activity.emotionZones).map(([z, n]) => `${z}: ${n}`).join(' · ')}
            </p>
          )}
          {analytics.emotionZonesDistribution && (
            <p style={{ fontSize: 12 }}>
              Зоны (summary): {JSON.stringify(analytics.emotionZonesDistribution)}
            </p>
          )}
          {dashboards.semantic && (
            <div style={{ marginTop: 8, fontSize: 12, background: '#F7F7F7', padding: 8, borderRadius: 8 }}>
              <strong>Смысловая аналитика</strong> ({dashboards.semantic.source})
              <div style={{ marginTop: 4 }}>{dashboards.semantic.summary}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(dashboards.semantic.layers || []).map((l: any) => (
                  <span key={l.id} className="tag-chip">{l.title}: {l.count}</span>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="adm-btn" style={{ marginTop: 8 }} onClick={() => act(() => adminFetch('/integrations/club-match', { method: 'POST' }), 'Club-match выполнен')}>
            Запустить club-match
          </button>
        </div>
      )}

      {dashboards?.pulse?.energySeries?.length > 0 && (
        <div className="card chart-card">
          <h3>Пульс · энергия по дням</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dashboards.pulse.energySeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Line type="monotone" dataKey="avg" stroke="#FF5500" name="Средняя энергия" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {dashboards?.portrait?.roleDistribution && (
        <div className="card chart-card">
          <h3>Портрет · роли</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={Object.entries(dashboards.portrait.roleDistribution).map(([name, value]) => ({ name, value }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#805AD5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {dashboards?.activity?.reflectionDepth && (
        <div className="card chart-card">
          <h3>Активность · глубина рефлексии</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={Object.entries(dashboards.activity.reflectionDepth).map(([name, value]) => ({ name, value }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3182CE" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {dashboards?.piggybank?.series?.length > 0 && (
        <div className="card chart-card">
          <h3>Копилка · по тегам</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashboards.piggybank.series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tag" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#38A169" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="card">
          <h3>Рейтинг (общий)</h3>
          <table className="adm-table">
            <thead><tr><th>#</th><th>ФИО</th><th>Баллы</th></tr></thead>
            <tbody>
              {leaderboard.slice(0, 15).map((l: any) => (
                <tr key={l.id}><td>{l.rank}</td><td>{l.firstName} {l.lastName}</td><td>{l.score}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {departurePortrait && (
        <div className="card">
          <h3>Портрет заезда → выезд (Точка А / Б)</h3>
          <p style={{ fontSize: 12 }}>Заполнили А и Б: {departurePortrait.completedBoth ?? 0}</p>
          <table className="adm-table">
            <thead><tr><th>Участник</th><th>А</th><th>Б</th><th>Роль сильная</th><th>Рост</th></tr></thead>
            <tbody>
              {(departurePortrait.participants || []).slice(0, 40).map((r: any) => (
                <tr key={r.id}>
                  <td><button type="button" className="adm-link" onClick={() => onOpenCard(r.id)}>{r.name}</button></td>
                  <td>{r.hasPointA ? '✓' : '—'}</td>
                  <td>{r.hasPointB ? '✓' : '—'}</td>
                  <td>{r.strongRole || '—'}</td>
                  <td>{r.growthRole || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <p>Участников: {analytics.participantCount} · Ответов: {analytics.answerCount} · Заполненность: {analytics.completionPercent}%</p>
        <p>Средняя энергия: {analytics.avgEnergy} · Медиана слов: {charts?.medianWordCount ?? '—'}</p>
        {analytics.redFlag && <p style={{ color: '#C53030', fontWeight: 700 }}>⚠ Тревога: низкая энергия участников</p>}
        {analytics.completionPercent === 0 && (
          <p style={{ color: '#888', fontSize: 12 }}>Нажмите «Пересчитать», если графики пустые</p>
        )}
        <button type="button" className="adm-btn" onClick={() => recalculate()}>Пересчитать</button>
      </div>

      {emotionChartData.length > 0 && (
        <div className="card chart-card">
          <h3>Эмоции участников</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={emotionChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#FF5500" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {charts?.energyTrend?.length > 0 && (
        <div className="card chart-card">
          <h3>Энергия по дням</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={charts.energyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Line type="monotone" dataKey="avg" stroke="#FF5500" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {charts?.completionByDirection?.length > 0 && (
        <div className="card chart-card">
          <h3>Заполненность по направлениям</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.completionByDirection}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="direction" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="percent" fill="#3182CE" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {charts?.piggybankTags?.length > 0 && (
        <div className="card chart-card">
          <h3>Топ тегов копилки</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.piggybankTags.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tag" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#38A169" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
