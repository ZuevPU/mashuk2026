import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadCsv, adminDownloadBinary } from '../../admin/client';
import { useInsights, type DashboardId } from '../insights/InsightsContext';
import type { AnalyticsTabProps } from './AnalyticsTab';
import {
  ActivityView,
  ClubsView,
  DepartureView,
  OverviewView,
  PiggybankView,
  PortraitView,
  ProgramView,
  PulseView,
  SemanticView,
} from './analyticsDashboardViews';

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

function xlsxExportPath(dash: DashboardId): string | null {
  if (dash === 'piggybank') return '/exports/piggybank';
  if (dash === 'pulse' || dash === 'portrait' || dash === 'semantic') return '/exports/reflections';
  if (dash === 'activity') return '/exports/task-submissions';
  return '/exports/participants';
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
  const [piggyTag, setPiggyTag] = useState('');
  const [piggySource, setPiggySource] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [clubEditDraft, setClubEditDraft] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const effectiveDay = mode === 'today' ? String(meta?.currentForumDay ?? forumDay) : forumDay;

  const apiMode = dash === 'overview' ? mode : mode;

  const filterQuery = useMemo(() => qs({
    mode: apiMode,
    day: effectiveDay,
    days: mode === 'compare' ? compareDays : undefined,
    direction: direction || undefined,
    group: group || undefined,
    roleKey: roleKey || undefined,
    tag: dash === 'piggybank' && piggyTag ? piggyTag : undefined,
    source: dash === 'piggybank' && piggySource ? piggySource : undefined,
    clubId: dash === 'clubs' && clubFilter ? clubFilter : undefined,
  }), [apiMode, effectiveDay, compareDays, direction, group, roleKey, dash, piggyTag, piggySource, clubFilter]);

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

  useEffect(() => {
    if (dash === 'clubs' && data?.clubs) {
      const draft: Record<string, string> = {};
      for (const c of data.clubs as { id: string; description?: string }[]) {
        draft[c.id] = c.description ?? '';
      }
      setClubEditDraft(prev => ({ ...draft, ...prev }));
    }
  }, [dash, data?.clubs]);

  const exportPng = async () => {
    if (!chartRef.current) return;
    const { toPng } = await import('html-to-image');
    const url = await toPng(chartRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${dash}.png`;
    a.click();
  };

  const saveClub = async (id: string, description: string) => {
    act(async () => {
      await adminFetch(`/analytics/forum-clubs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      await loadDash();
    }, 'Описание клуба сохранено');
  };

  const matrix = meta?.roleTaxonomy?.matrix;
  const catalog = meta?.roleTaxonomy?.catalog ?? [];
  const xlsxPath = xlsxExportPath(dash);

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
          {xlsxPath && (
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => adminDownloadBinary(`${xlsxPath}${filterQuery}`, `export_${dash}.xlsx`)}
            >
              Скачать XLSX
            </button>
          )}
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
            {meta?.semanticV2 === false && (dash === 'semantic' || dash === 'clubs') && (
              <span className="adm-insights-warn" style={{ marginLeft: 8 }}>SEMANTIC_ANALYTICS_V2=false на сервере</span>
            )}
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
          {dash === 'piggybank' && (
            <PiggybankView
              data={data}
              tagFilter={piggyTag}
              sourceFilter={piggySource}
              onTagFilter={setPiggyTag}
              onSourceFilter={setPiggySource}
            />
          )}
          {dash === 'semantic' && <SemanticView data={data} />}
          {dash === 'clubs' && (
            <ClubsView
              data={data}
              clubFilter={clubFilter}
              onClubFilter={setClubFilter}
              onSaveClub={saveClub}
              editDraft={clubEditDraft}
              onEditDraft={(id, text) => setClubEditDraft(d => ({ ...d, [id]: text }))}
            />
          )}
          {dash === 'departure' && <DepartureView data={data} onOpenCard={onOpenCard} />}
          {dash === 'overview' && <OverviewView data={data} />}
        </div>
      )}
    </div>
  );
}
