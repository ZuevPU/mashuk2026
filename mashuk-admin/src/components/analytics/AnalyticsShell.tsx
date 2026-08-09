import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadCsv, adminDownloadBinary } from '../../admin/client';
import { useInsights, type DashboardId } from '../insights/InsightsContext';
import type { AnalyticsTabProps } from './AnalyticsTab';
import {
  ActivityView,
  AfterBlocksView,
  ClubsView,
  DepartureView,
  DirectionView,
  EveningView,
  OverviewView,
  PiggybankView,
  PortraitView,
  ProgramView,
  PulseView,
  SemanticView,
} from './analyticsDashboardViews';
import { ParticipantProfileView } from './ParticipantProfileView';
import { CHART_HELP_RU, formatForumDay } from './chartRu';
import { DashCard, DashScreenTitle, RoleMatrixGrid } from './dashboardUi';
import { roleName } from '../onboarding/roleOptions';

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
  if (dash === 'portrait' || dash === 'semantic') return '/exports/reflections';
  if (dash === 'clubs') return '/exports/piggybank';
  if (dash === 'roles') return '/exports/roles-experiments';
  if (dash === 'overview') return '/exports/participants';
  if (dash === 'evening') return '/exports/evening-summary';
  if (dash === 'after-blocks') return '/exports/after-blocks';
  if (dash === 'direction') return '/exports/direction-pack';
  if (dash === 'participant-profile') return '/exports/participants';
  // pulse / activity / program / departure use slice CTAs only
  return null;
}

function csvExportPath(dash: DashboardId): string | null {
  if (dash === 'piggybank') return '/exports/piggybank?format=csv';
  if (dash === 'departure') return '/exports/point-a-b-summary';
  if (dash === 'activity') return '/exports/rating/shift';
  if (dash === 'roles' || dash === 'evening' || dash === 'after-blocks' || dash === 'direction') return null;
  if (dash === 'clubs') return '/exports/piggybank?format=csv';
  return '/exports/reflections?format=csv';
}

function sliceExportCtas(
  dash: DashboardId,
  day: string,
  direction?: string,
  group?: string,
): { label: string; path: string; file: string }[] {
  const cohort = qs({
    mode: 'day',
    day,
    direction: direction || undefined,
    group: group || undefined,
  });
  if (dash === 'pulse') {
    return [
      {
        label: 'Выгрузить этот срез (участники×активности)',
        path: `/exports/participant-activity-wide${cohort}`,
        file: `participant_activity_d${day}.xlsx`,
      },
      {
        label: 'Скачать проверку состояния',
        path: `/exports/state-checks${cohort}`,
        file: `state_checks_d${day}.xlsx`,
      },
      {
        label: 'Выгрузка дня (листы)',
        path: `/exports/day${qs({ mode: 'day', day })}`,
        file: `day_${day}.xlsx`,
      },
    ];
  }
  if (dash === 'evening') {
    return [
      {
        label: 'Скачать полностью данные по Итоговой анкете вечера',
        path: `/exports/evening-summary${qs({ mode: 'day', day })}`,
        file: `evening_summary_d${day}.xlsx`,
      },
    ];
  }
  if (dash === 'after-blocks') {
    return [
      {
        label: 'Скачать полностью данные «После блоков»',
        path: `/exports/after-blocks${cohort}`,
        file: `after_blocks_d${day}.xlsx`,
      },
    ];
  }
  if (dash === 'direction') {
    if (!direction) return [];
    return [
      {
        label: 'Скачать полный пакет направления',
        path: `/exports/direction-pack${qs({ mode: 'day', day, direction, group: group || undefined })}`,
        file: `direction_d${day}.xlsx`,
      },
    ];
  }
  if (dash === 'participant-profile') {
    return [
      {
        label: 'Полный портрет · участники',
        path: `/exports/participants${cohort}`,
        file: `participant_profile_d${day}.xlsx`,
      },
      {
        label: 'Проверка состояния',
        path: `/exports/state-checks${cohort}`,
        file: `state_checks_d${day}.xlsx`,
      },
      {
        label: 'Итоговая анкета вечера',
        path: `/exports/evening-summary${qs({ mode: 'day', day })}`,
        file: `evening_summary_d${day}.xlsx`,
      },
      {
        label: 'Рефлексии',
        path: `/exports/reflections${cohort}`,
        file: `reflections_d${day}.xlsx`,
      },
    ];
  }
  if (dash === 'portrait') {
    return [
      {
        label: 'Точка А → Б',
        path: '/exports/point-a-b-summary',
        file: 'point_a_b_summary.csv',
      },
    ];
  }
  if (dash === 'activity') {
    return [
      {
        label: 'Выгрузить рейтинг дня',
        path: `/exports/rating/day${qs({ day })}`,
        file: `rating_day_${day}.xlsx`,
      },
      {
        label: 'Выгрузить заявки',
        path: '/exports/task-submissions',
        file: 'task_submissions.xlsx',
      },
      {
        label: 'Рейтинг смены',
        path: '/exports/rating/shift',
        file: 'leaderboard_shift.csv',
      },
    ];
  }
  if (dash === 'program') {
    return [
      {
        label: 'Выгрузить ответы дня',
        path: `/exports/day${qs({ day, type: 'all' })}`,
        file: `day_${day}_program.xlsx`,
      },
      {
        label: 'Выгрузить по типу «направление»',
        path: `/exports/day${qs({ day, type: 'direction' })}`,
        file: `day_${day}_direction.xlsx`,
      },
    ];
  }
  if (dash === 'departure') {
    return [
      {
        label: 'Точка А → Б',
        path: '/exports/point-a-b-summary',
        file: 'point_a_b_summary.csv',
      },
      {
        label: 'Рефлексии',
        path: '/exports/reflections?format=xlsx',
        file: 'reflections.xlsx',
      },
    ];
  }
  if (dash === 'overview') {
    return [
      {
        label: 'Активность',
        path: '/exports/activity',
        file: 'activity.csv',
      },
      {
        label: 'Статистика дня',
        path: `/exports/day/stats${qs({ day })}`,
        file: `day_stats_d${day}.json`,
      },
    ];
  }
  if (dash === 'roles') {
    return [
      {
        label: 'Роли и эксперименты',
        path: '/exports/roles-experiments?format=xlsx',
        file: 'roles_experiments.xlsx',
      },
    ];
  }
  return [];
}

function withFormatXlsx(path: string, filterQuery: string): string {
  const base = filterQuery
    ? `${path}${filterQuery}&format=xlsx`
    : `${path}?format=xlsx`;
  return base;
}

export function AnalyticsShell({ adminFetch, act, reloadKey, onOpenCard }: AnalyticsTabProps) {
  const {
    forumDay,
    setForumDay,
    direction,
    group,
    ageCategory,
    activity,
    activeDashboardId,
    meta,
    setTab,
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
  const [chartHelpOpen, setChartHelpOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Date select is source of truth. «Сегодня» only jumps the select to live day.
  const effectiveDay = forumDay;
  const apiMode: ViewMode = mode === 'today' ? 'day' : mode;

  const filterQuery = useMemo(() => qs({
    mode: apiMode,
    day: mode === 'shift' ? undefined : effectiveDay,
    days: mode === 'compare' ? compareDays : undefined,
    direction: direction || undefined,
    group: group || undefined,
    ageCategory: ageCategory || undefined,
    activity: activity || undefined,
    roleKey: roleKey || undefined,
    tag: dash === 'piggybank' && piggyTag ? piggyTag : undefined,
    source: dash === 'piggybank' && piggySource ? piggySource : undefined,
    clubId: dash === 'clubs' && clubFilter ? clubFilter : undefined,
  }), [apiMode, mode, effectiveDay, compareDays, direction, group, ageCategory, activity, roleKey, dash, piggyTag, piggySource, clubFilter]);

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
  const sliceCtas = sliceExportCtas(dash, effectiveDay, direction, group);

  return (
    <div className="adm-forum adm-analytics">
      <div className="card adm-forum-block">
        <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => loadDash()}>Обновить</button>
          <button type="button" className="adm-btn adm-btn-secondary" onClick={() => exportPng()} disabled={dash === 'roles'}>
            Скачать PNG
          </button>
          {csvExportPath(dash) && (
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                const path = csvExportPath(dash)!;
                if (path.includes('reflections')) {
                  downloadCsv(
                    filterQuery ? `/exports/reflections${filterQuery}&format=csv` : path,
                    'reflections.csv',
                  );
                } else if (path.endsWith('.json') || path.includes('/stats')) {
                  act(async () => {
                    const data = await adminFetch(path);
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `export_${dash}.json`;
                    a.click();
                  }, 'Файл скачан');
                } else {
                  downloadCsv(path, `export_${dash}.csv`);
                }
              }}
            >
              Скачать CSV
            </button>
          )}
          {xlsxPath && (
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => adminDownloadBinary(withFormatXlsx(xlsxPath, filterQuery), `export_${dash}.xlsx`)}
            >
              Скачать XLSX
            </button>
          )}
          {sliceCtas.map(cta => (
            <button
              key={cta.label}
              type="button"
              className="adm-btn adm-btn-primary"
              onClick={() => act(async () => {
                if (cta.file.endsWith('.json') || cta.path.includes('/stats')) {
                  const data = await adminFetch(cta.path);
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = cta.file;
                  a.click();
                  return;
                }
                if (cta.file.endsWith('.csv')) {
                  downloadCsv(cta.path, cta.file);
                  return;
                }
                await adminDownloadBinary(cta.path, cta.file);
              }, 'Файл скачан')}
            >
              {cta.label}
            </button>
          ))}
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setChartHelpOpen(v => !v)}>
            {chartHelpOpen ? 'Скрыть подсказку' : 'Как читать диаграммы'}
          </button>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setAdvancedOpen(v => !v)}>
            {advancedOpen ? 'Скрыть расширенные' : 'Расширенные фильтры'}
          </button>
        </div>
        {chartHelpOpen && dash !== 'roles' && (
          <p className="adm-muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
            {CHART_HELP_RU}
          </p>
        )}
        {advancedOpen && (
          <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <select
              className="adm-input"
              value={mode === 'today' ? 'day' : mode}
              onChange={e => setMode(e.target.value as ViewMode)}
            >
              <option value="day">Выбранный день (фильтр выше)</option>
              <option value="shift">Динамика смены</option>
              <option value="compare">Сравнение дней</option>
            </select>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => {
                const live = meta?.currentForumDay;
                if (live != null) setForumDay(String(live));
                setMode('day');
              }}
            >
              Текущий день форума
            </button>
            {mode === 'compare' && (
              <input className="adm-input" value={compareDays} onChange={e => setCompareDays(e.target.value)} placeholder="2,5,7" />
            )}
            <select className="adm-input" value={roleKey} onChange={e => setRoleKey(e.target.value)}>
              <option value="">Все роли</option>
              {(meta?.filters?.roles ?? []).map(r => (
                <option key={r} value={r}>{roleName(r)}</option>
              ))}
            </select>
          </div>
        )}
        {catalogEntry && (
          <p className="adm-insights-availability">
            <span className="adm-insights-badge">Доступен с {catalogEntry.availabilityTier}</span>
            {meta?.semanticV2 === false && (dash === 'semantic' || dash === 'clubs') && (
              <span className="adm-insights-warn" style={{ marginLeft: 8 }}>Раздел ограничен настройками сервера</span>
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
            Данные по этому дашборду полнее с {catalogEntry?.availabilityTier}. Сейчас {formatForumDay(meta?.currentForumDay ?? 1)}.
          </p>
        )}
      </div>

      {dash === 'roles' && (
        <div className="adm-dash-stack">
          <DashScreenTitle
            title="Роли 2×3"
            hint="Единственная типология: Мышление · Действия · Люди × лидерский / организационный вектор."
          />
          <DashCard title="6-ролевая модель">
            {matrix != null ? (
              <RoleMatrixGrid
                cells={{
                  leader: {
                    thinking: catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).leader?.thinking)?.name,
                    actions: catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).leader?.actions)?.name,
                    people: catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).leader?.people)?.name,
                  },
                  org: {
                    thinking: catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).org?.thinking)?.name,
                    actions: catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).org?.actions)?.name,
                    people: catalog.find((r: { roleKey: string; name: string }) => r.roleKey === (matrix as any).org?.people)?.name,
                  },
                }}
              />
            ) : (
              <p className="adm-muted" style={{ fontSize: 12 }}>Матрица ролей ещё не загружена из meta.</p>
            )}
          </DashCard>
        </div>
      )}

      {loading && dash !== 'roles' && <p className="adm-muted">Загрузка…</p>}

      {!loading && data && dash !== 'roles' && (
        <div ref={chartRef} className={showEarlyWarning ? 'adm-insights-dimmed' : undefined}>
          {dash === 'pulse' && <PulseView data={data} onOpenCard={onOpenCard} />}
          {dash === 'direction' && <DirectionView data={data} onOpenCard={onOpenCard} />}
          {dash === 'evening' && <EveningView data={data} onOpenCard={onOpenCard} />}
          {dash === 'after-blocks' && <AfterBlocksView data={data} onOpenCard={onOpenCard} />}
          {dash === 'participant-profile' && <ParticipantProfileView data={data} />}
          {dash === 'portrait' && <PortraitView data={data} onOpenCard={onOpenCard} />}
          {dash === 'program' && <ProgramView data={data} />}
          {dash === 'activity' && <ActivityView data={data} onOpenRating={() => setTab('rating')} />}
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
