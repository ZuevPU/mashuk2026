import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { downloadCsv, adminDownloadBinary } from '../../admin/client';
import { useInsights, type DashboardId } from '../insights/InsightsContext';
import type { AnalyticsTabProps } from './AnalyticsTab';

type ViewMode = 'today' | 'day' | 'shift' | 'compare';

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

function dashboardApiPath(id: DashboardId): string | null {
  if (id === 'roles') return null;
  if (id === 'departure') return '/analytics/departure-portrait';
  if (id === 'overview') return '/analytics/dashboards';
  return `/analytics/dashboards/${id}`;
}

export function AnalyticsShell({ adminFetch, act, reloadKey, onOpenCard }: AnalyticsTabProps) {
  const {
    forumDay,
    direction,
    group,
    activeDashboardId,
    meta,
  } = useInsights();

  const dash = activeDashboardId;
  const [mode, setMode] = useState<ViewMode>('day');
  const [compareDays, setCompareDays] = useState('2,5');
  const [roleKey, setRoleKey] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const effectiveDay = mode === 'today' ? String(meta?.currentForumDay ?? forumDay) : forumDay;

  const filterQuery = useMemo(() => qs({
    mode: dash === 'overview' ? mode : (mode === 'today' ? 'today' : 'day'),
    day: effectiveDay,
    days: mode === 'compare' ? compareDays : undefined,
    direction: direction || undefined,
    group: group || undefined,
    roleKey: roleKey || undefined,
  }), [mode, effectiveDay, compareDays, direction, group, roleKey, dash]);

  const catalogEntry = meta?.dashboardCatalog?.find(c => c.id === dash);
  const showEarlyWarning = catalogEntry && (meta?.currentForumDay ?? 1) < catalogEntry.minForumDay;

  const loadDash = useCallback(async () => {
    if (dash === 'roles') {
      setData(null);
      setLoading(false);
      return;
    }
    const path = dashboardApiPath(dash);
    if (!path) return;
    setLoading(true);
    try {
      setData(await adminFetch(`${path}${filterQuery}`));
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, [adminFetch, dash, filterQuery]);

  useEffect(() => {
    loadDash().catch(() => setLoading(false));
  }, [loadDash, reloadKey]);

  useEffect(() => {
    if (!meta?.refreshMs || dash === 'roles') return;
    const t = setInterval(() => loadDash().catch(() => undefined), meta.refreshMs);
    return () => clearInterval(t);
  }, [meta?.refreshMs, loadDash, dash]);

  const exportPng = async () => {
    if (!chartRef.current) return;
    const { toPng } = await import('html-to-image');
    const url = await toPng(chartRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${dash}.png`;
    a.click();
  };

  const matrix = meta?.roleTaxonomy?.matrix;
  const catalog = meta?.roleTaxonomy?.catalog ?? [];

  return (
    <div className="adm-forum adm-analytics">
      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => loadDash()}>Обновить</button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => exportPng()} disabled={dash === 'roles'}>
            Скачать PNG
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => downloadCsv(`/exports/reflections${filterQuery}`, 'reflections.csv')}
          >
            Скачать CSV
          </button>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setAdvancedOpen(v => !v)}>
            {advancedOpen ? 'Скрыть расширенные' : 'Расширенные фильтры'}
          </button>
        </div>
        {advancedOpen && (
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <select className="adm-input" value={mode} onChange={e => setMode(e.target.value as ViewMode)}>
              <option value="today">Сегодня</option>
              <option value="day">День форума</option>
              <option value="shift">Динамика смены</option>
              <option value="compare">Сравнение дней</option>
            </select>
            {mode === 'compare' && (
              <input className="adm-input" value={compareDays} onChange={e => setCompareDays(e.target.value)} placeholder="2,5,7" />
            )}
            <select className="adm-input" value={roleKey} onChange={e => setRoleKey(e.target.value)}>
              <option value="">Все роли</option>
              {(meta?.filters?.roles ?? []).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}
        {catalogEntry && (
          <p className="adm-insights-availability">
            <span className="adm-insights-badge">Доступен с {catalogEntry.availabilityTier}</span>
            {updatedAt && (
              <span className="adm-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                Обновлено: {updatedAt.toLocaleTimeString('ru-RU')}
              </span>
            )}
          </p>
        )}
        {showEarlyWarning && (
          <p className="adm-insights-warn-banner">
            Данные по этому дашборду полнее с {catalogEntry?.availabilityTier}. Сейчас день форума D{meta?.currentForumDay}.
          </p>
        )}
      </div>

      {dash === 'roles' && (
        <div className="card adm-forum-block">
          <h3>6-ролевая модель (2×3)</h3>
          <p className="adm-muted" style={{ fontSize: 12 }}>
            Единственная типология: Мышление · Действия · Люди × лидерский / организационный вектор.
          </p>
          {matrix != null ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
              <div />
              <div><strong>Мышление</strong></div>
              <div><strong>Действия</strong></div>
              <div><strong>Люди</strong></div>
              <div>{catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).leader?.thinking)?.name}</div>
              <div>{catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).leader?.actions)?.name}</div>
              <div>{catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).leader?.people)?.name}</div>
              <div><em>Орг.</em></div>
              <div>{catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).org?.thinking)?.name}</div>
              <div>{catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).org?.actions)?.name}</div>
              <div>{catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).org?.people)?.name}</div>
            </div>
          ) : null}
        </div>
      )}

      {loading && dash !== 'roles' && <p className="adm-muted">Загрузка…</p>}

      {!loading && data && dash !== 'roles' && (
        <div ref={chartRef} className={showEarlyWarning ? 'adm-insights-dimmed' : undefined}>
          {dash === 'pulse' && <PulseView data={data} />}
          {dash === 'portrait' && <PortraitView data={data} onOpenCard={onOpenCard} />}
          {dash === 'program' && <ProgramView data={data} />}
          {dash === 'activity' && <ActivityView data={data} />}
          {dash === 'piggybank' && <PiggybankView data={data} />}
          {dash === 'semantic' && <SemanticView data={data} />}
          {dash === 'clubs' && <ClubsView data={data} />}
          {dash === 'departure' && <DepartureView data={data} onOpenCard={onOpenCard} />}
          {dash === 'overview' && <OverviewView data={data} />}
        </div>
      )}
    </div>
  );
}

function OverviewView({ data }: { data: any }) {
  return (
    <>
      <div className="card">
        <h3>Обзор форума</h3>
        <p>Зарегистрировано: {data.pulse?.registered} · Ответов (серия): {data.pulse?.totalAnswers}</p>
        <p>Событий в программе: {data.program?.eventsCount}</p>
        <p>Записей копилки: {data.piggybank?.total}</p>
      </div>
      <div className="card">
        <h3>Топ событий</h3>
        <ul>{(data.program?.topEvents ?? []).slice(0, 8).map((e: { id?: number; title?: string }) => (
          <li key={e.id ?? e.title}>{e.title}</li>
        ))}</ul>
      </div>
    </>
  );
}

function DepartureView({ data, onOpenCard }: { data: any; onOpenCard: AnalyticsTabProps['onOpenCard'] }) {
  return (
    <div className="card">
      <h3>Заезд → выезд</h3>
      <p>Заполнили обе точки: {data.completedBoth ?? data.departure?.completedBoth}</p>
      <table className="adm-table">
        <thead><tr><th>Участник</th><th>А</th><th>Б</th></tr></thead>
        <tbody>
          {(data.participants ?? data.departure?.participants ?? []).slice(0, 50).map((r: { id: number; name: string; hasPointA?: boolean; hasPointB?: boolean }) => (
            <tr key={r.id}>
              <td><button type="button" className="adm-link" onClick={() => onOpenCard(r.id)}>{r.name}</button></td>
              <td>{r.hasPointA ? '✓' : '—'}</td>
              <td>{r.hasPointB ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PulseView({ data }: { data: any }) {
  const zones = data.emotionalPulse?.zonesPercent ?? {};
  const zoneChart = Object.entries(zones).map(([name, value]) => ({ name, value }));
  const series = data.activity?.activitySeries ?? [];
  return (
    <>
      <div className="card">
        <h3>Активность</h3>
        <p>Зарегистрировано: {data.activity?.registered} · Активны сегодня: {data.activity?.activeToday}</p>
        <p style={{ fontSize: 12 }}>Итоги дня: {data.activity?.eveningCompleted} · Check-in: {JSON.stringify(data.activity?.stateChecks)}</p>
      </div>
      {zoneChart.length > 0 && (
        <div className="card chart-card">
          <h3>5 зон (%, не среднее)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={zoneChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="value" fill="#805AD5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {series.length > 0 && (
        <div className="card chart-card">
          <h3>Динамика активности</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="answers" stroke="#3182CE" name="Ответы" />
              <Line type="monotone" dataKey="touchpoints" stroke="#38A169" name="Touchpoints" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.stateReasons?.topTokens?.length > 0 && (
        <div className="card">
          <h3>Причины состояния (топ слов)</h3>
          <ul>{data.stateReasons.topTokens.map((t: { token: string; count: number }) => <li key={t.token}>{t.token}: {t.count}</li>)}</ul>
          {data.stateReasons.v2Placeholder && <p className="adm-muted">{data.stateReasons.v2Placeholder}</p>}
        </div>
      )}
    </>
  );
}

function PortraitView({ data, onOpenCard }: { data: any; onOpenCard: AnalyticsTabProps['onOpenCard'] }) {
  const roles = data.preStart?.roleDistribution ?? [];
  return (
    <>
      <div className="card chart-card">
        <h3>Роли на входе</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={roles}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="key" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#805AD5" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h3>Регионы</h3>
        <ul>{(data.preStart?.byRegion ?? []).map((r: { key: string; count: number }) => <li key={r.key}>{r.key}: {r.count}</li>)}</ul>
      </div>
      <div className="card">
        <h3>Точка А → Б</h3>
        <p>Заполнили обе: {data.departure?.completedBoth}</p>
        <table className="adm-table">
          <thead><tr><th>Участник</th><th>А</th><th>Б</th></tr></thead>
          <tbody>
            {(data.departure?.participants ?? []).slice(0, 30).map((r: { id: number; name: string; hasPointA?: boolean; hasPointB?: boolean }) => (
              <tr key={r.id}>
                <td><button type="button" className="adm-link" onClick={() => onOpenCard(r.id)}>{r.name}</button></td>
                <td>{r.hasPointA ? '✓' : '—'}</td>
                <td>{r.hasPointB ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProgramView({ data }: { data: any }) {
  const scales = data.blocks?.workshops ?? [];
  return (
    <div className="card">
      <h3>Практики / программа</h3>
      <table className="adm-table">
        <thead><tr><th>Блок</th><th>Средняя</th><th>Ответов</th></tr></thead>
        <tbody>
          {scales.map((s: { key: string; label: string; avg: number; responses: number }) => (
            <tr key={s.key}><td>{s.label}</td><td>{s.avg}</td><td>{s.responses}</td></tr>
          ))}
        </tbody>
      </table>
      <h4 style={{ marginTop: 16 }}>Расхождения (мало посещений + высокая оценка)</h4>
      <ul>{(data.divergence ?? []).map((d: { eventId: number; title: string; attendance: number }) => <li key={d.eventId}>{d.title} · {d.attendance}</li>)}</ul>
    </div>
  );
}

function ActivityView({ data }: { data: any }) {
  return (
    <div className="card">
      <h3>Рейтинг (смена)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {(['path', 'experience', 'total'] as const).map(track => (
          <div key={track}>
            <h4>{track}</h4>
            <ol>{(data.ratings?.[track] ?? []).slice(0, 10).map((r: { id: number; rank: number; name: string; points: number }) => (
              <li key={r.id}>{r.rank}. {r.name} — {r.points}</li>
            ))}</ol>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 12 }}>На модерации: {data.tasks?.pendingModeration}</p>
    </div>
  );
}

function PiggybankView({ data }: { data: any }) {
  return (
    <div className="card">
      <h3>Копилка · записей: {data.navigation?.total}</h3>
      <h4>По тегам</h4>
      <ul>{Object.entries(data.byTag ?? {}).map(([tag, v]) => (
        <li key={tag}>{tag}: {(v as { count: number }).count}</li>
      ))}</ul>
      <h4>«В работу»</h4>
      <p>Всего: {data.vRabota?.total}</p>
    </div>
  );
}

function SemanticView({ data }: { data: any }) {
  if (!data.enabled) return <div className="card"><p>{data.message}</p></div>;
  return (
    <div className="card">
      <h3>Смысловая аналитика</h3>
      <p>{data.professionalShift?.summary}</p>
      <ul>{(data.languageTracker?.topTerms ?? []).map((t: { token: string }) => <li key={t.token}>{t.token}</li>)}</ul>
    </div>
  );
}

function ClubsView({ data }: { data: any }) {
  if (!data.enabled) return <div className="card"><p>Клубы v2 — включите SEMANTIC_ANALYTICS_V2</p></div>;
  return (
    <div className="card">
      <h3>Клубы</h3>
      <ul>{(data.clubs ?? []).map((c: { id: string; name: string }) => <li key={c.id}><strong>{c.name}</strong></li>)}</ul>
      <p>Matches: {(data.matches ?? []).length}</p>
    </div>
  );
}
