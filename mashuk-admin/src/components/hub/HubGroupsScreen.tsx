import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useInsights } from '../insights/InsightsContext';
import {
  DashCard,
  DashScreenTitle,
  SectionLabel,
  dashVal,
} from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubFilterParams } from './hubQuery';
import type { HubLens } from './HubTab';

type EveningDayCell = {
  day: number;
  submitted: number;
  fillRatePct: number;
};

type TouchpointSlotCell = {
  index: number;
  title: string;
  shortLabel: string;
  completed: number;
  coveragePct: number;
};

type GroupRow = {
  group: string;
  direction: string;
  registered: number;
  eveningByDay: EveningDayCell[];
  selectedDaySubmitted: number;
  selectedDayFillPct: number;
  touchpointSlots: TouchpointSlotCell[];
  avgEngagementPct: number;
};

type SlotMeta = {
  index: number;
  title: string;
  shortLabel: string;
};

type ColDef = {
  id: string;
  label: string;
  title?: string;
  groupLabel?: string;
  kind: 'text' | 'num' | 'heat' | 'heatPct';
  get: (row: GroupRow) => string | number;
  heatValue?: (row: GroupRow) => number;
  heatBase?: (row: GroupRow) => number;
  format?: (v: string | number) => string;
};

type SortState = { id: string; dir: 'asc' | 'desc' } | null;

/** 0% → мягкий красный, 100% → приятный зелёный. */
function heatBg(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(254 + (134 - 254) * t);
  const g = Math.round(202 + (239 - 202) * t);
  const b = Math.round(202 + (172 - 202) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function heatStyle(value: number, registered: number): CSSProperties | undefined {
  if (registered <= 0) return undefined;
  return {
    background: heatBg(value / registered),
    textAlign: 'center' as const,
  };
}

function sortMark(sort: SortState, id: string): string {
  if (!sort || sort.id !== id) return ' ↕';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}

/**
 * Линза «Группы» — итоговая анкета по дням и 7 точек активности за выбранный день.
 */
export function HubGroupsScreen({
  onLensChange,
}: {
  onLensChange: (lens: HubLens) => void;
}) {
  const {
    adminFetch, forumDay, setDirection, setGroup, meta, ageCategory, activity, direction,
  } = useInsights();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<SortState>({ id: 'avg', dir: 'desc' });
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [hiddenRows, setHiddenRows] = useState<Set<string>>(new Set());
  const [showColPanel, setShowColPanel] = useState(false);
  const [showRowPanel, setShowRowPanel] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction,
      ageCategory,
      activity,
    });
    adminFetch(`/analytics/hub/groups?${params.toString()}`)
      .then(res => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, ageCategory, activity]);

  const days = (data?.days ?? []) as number[];
  const byGroupRaw = (data?.byGroup ?? []) as GroupRow[];
  const slotsMeta = (data?.touchpointSlotsMeta ?? []) as SlotMeta[];
  const kpi = data?.kpi ?? {};
  const selectedDay = Number(data?.selectedDay ?? forumDay) || meta?.currentForumDay || 1;
  const touchpointDay = Number(data?.touchpointDay ?? selectedDay) || selectedDay;

  const columns = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        id: 'group',
        label: 'Группа',
        kind: 'text',
        get: r => r.group,
      },
      {
        id: 'direction',
        label: 'Направление',
        kind: 'text',
        get: r => r.direction || '—',
      },
      {
        id: 'registered',
        label: 'Зарег.',
        kind: 'num',
        get: r => r.registered,
      },
    ];
    for (const d of days) {
      cols.push({
        id: `e${d}`,
        label: `Д${d}`,
        title: `Итоговая анкета · день ${d}`,
        kind: 'heat',
        get: r => r.eveningByDay?.find(c => c.day === d)?.submitted ?? 0,
        heatValue: r => Number(r.eveningByDay?.find(c => c.day === d)?.submitted ?? 0),
        heatBase: r => r.registered,
      });
    }
    cols.push({
      id: 'selPct',
      label: `Д${selectedDay} %`,
      title: `Охват итоговой анкеты · день ${selectedDay}`,
      kind: 'heatPct',
      get: r => r.selectedDayFillPct,
      heatValue: r => r.selectedDayFillPct,
      heatBase: () => 100,
      format: v => `${v}%`,
    });
    for (const s of slotsMeta) {
      cols.push({
        id: `tp${s.index}n`,
        label: `Т${s.index}`,
        title: `${s.shortLabel} · кол-во`,
        groupLabel: `Т${s.index} · ${s.shortLabel}`,
        kind: 'heat',
        get: r => r.touchpointSlots?.find(c => c.index === s.index)?.completed ?? 0,
        heatValue: r => Number(r.touchpointSlots?.find(c => c.index === s.index)?.completed ?? 0),
        heatBase: r => r.registered,
      });
      cols.push({
        id: `tp${s.index}p`,
        label: `Т${s.index} %`,
        title: `${s.title} · %`,
        groupLabel: `Т${s.index} · ${s.shortLabel} %`,
        kind: 'heatPct',
        get: r => r.touchpointSlots?.find(c => c.index === s.index)?.coveragePct ?? 0,
        heatValue: r => Number(r.touchpointSlots?.find(c => c.index === s.index)?.coveragePct ?? 0),
        heatBase: () => 100,
        format: v => `${v}%`,
      });
    }
    cols.push({
      id: 'avg',
      label: 'Ср. вовлеч. %',
      title: 'Среднее охвата: дни итоговой анкеты + 7 точек активности',
      kind: 'heatPct',
      get: r => r.avgEngagementPct ?? 0,
      heatValue: r => r.avgEngagementPct ?? 0,
      heatBase: () => 100,
      format: v => `${v}%`,
    });
    return cols;
  }, [days, slotsMeta, selectedDay]);

  const visibleCols = useMemo(
    () => columns.filter(c => !hiddenCols.has(c.id)),
    [columns, hiddenCols],
  );

  const sortedRows = useMemo(() => {
    const rows = byGroupRaw.filter(r => !hiddenRows.has(r.group));
    if (!sort) return rows;
    const col = columns.find(c => c.id === sort.id);
    if (!col) return rows;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv), 'ru') * mul;
    });
  }, [byGroupRaw, hiddenRows, sort, columns]);

  const totalsRow = useMemo(() => {
    if (!sortedRows.length) return null;
    const registered = sortedRows.reduce((s, r) => s + (r.registered ?? 0), 0);
    const selectedSubmitted = sortedRows.reduce((s, r) => s + r.selectedDaySubmitted, 0);
    const selectedPct = registered
      ? Math.round((selectedSubmitted / registered) * 1000) / 10
      : 0;
    const avgEngagementPct = sortedRows.length
      ? Math.round((sortedRows.reduce((s, r) => s + (r.avgEngagementPct ?? 0), 0) / sortedRows.length) * 10) / 10
      : 0;
    const eveningByDay = days.map(day => {
      const submitted = sortedRows.reduce((s, r) => {
        const cell = r.eveningByDay?.find(c => c.day === day);
        return s + (cell?.submitted ?? 0);
      }, 0);
      return {
        day,
        submitted,
        fillRatePct: registered ? Math.round((submitted / registered) * 1000) / 10 : 0,
      };
    });
    const touchpointSlots = slotsMeta.map(s => {
      const completed = sortedRows.reduce((sum, r) => {
        return sum + (r.touchpointSlots?.find(c => c.index === s.index)?.completed ?? 0);
      }, 0);
      return {
        index: s.index,
        completed,
        coveragePct: registered ? Math.round((completed / registered) * 1000) / 10 : 0,
      };
    });
    return {
      group: 'Итого',
      direction: '',
      registered,
      eveningByDay,
      selectedDaySubmitted: selectedSubmitted,
      selectedDayFillPct: selectedPct,
      touchpointSlots: touchpointSlots.map(t => ({
        ...t,
        title: '',
        shortLabel: '',
      })),
      avgEngagementPct,
    } satisfies GroupRow;
  }, [sortedRows, days, slotsMeta]);

  function toggleSort(id: string) {
    setSort(prev => {
      if (!prev || prev.id !== id) return { id, dir: 'desc' };
      if (prev.dir === 'desc') return { id, dir: 'asc' };
      return null;
    });
  }

  function toggleCol(id: string) {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRow(group: string) {
    setHiddenRows(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function openDirection(dir: string) {
    if (!dir || dir === '—' || dir === 'несколько') return;
    setDirection(dir);
    setGroup('');
    onLensChange('direction');
  }

  async function downloadExcel() {
    setExporting(true);
    try {
      const params = hubFilterParams({
        mode: 'day',
        forumDay,
        direction,
        ageCategory,
        activity,
      });
      await downloadHubExport({
        id: 'hub-groups',
        label: 'Группы',
        path: `/exports/hub-groups?${params.toString()}`,
        filename: `hub_groups_d${selectedDay}.xlsx`,
      });
    } finally {
      setExporting(false);
    }
  }

  function renderCell(col: ColDef, row: GroupRow, isTotal = false): ReactNode {
    const raw = col.get(row);
    const text = col.format ? col.format(raw) : String(raw);
    if (col.id === 'group' && !isTotal) {
      return (
        <td key={col.id}>
          <span>{row.group}</span>
          <button
            type="button"
            className="adm-link"
            style={{ marginLeft: 6, fontSize: 11 }}
            title="Скрыть строку"
            onClick={() => toggleRow(row.group)}
          >
            скрыть
          </button>
        </td>
      );
    }
    if (col.id === 'direction' && !isTotal) {
      return (
        <td key={col.id}>
          {row.direction && row.direction !== '—' && row.direction !== 'несколько' ? (
            <button
              type="button"
              className="adm-link"
              onClick={() => openDirection(row.direction)}
            >
              {row.direction}
            </button>
          ) : (
            row.direction || '—'
          )}
        </td>
      );
    }
    if (col.kind === 'heat' || col.kind === 'heatPct') {
      const hv = col.heatValue?.(row) ?? (Number(raw) || 0);
      const hb = col.heatBase?.(row) ?? 0;
      return (
        <td
          key={col.id}
          style={{
            ...heatStyle(hv, hb),
            fontWeight: col.id === 'avg' || isTotal ? 600 : undefined,
          }}
          title={col.title}
        >
          {text}
        </td>
      );
    }
    return (
      <td
        key={col.id}
        style={col.kind === 'num' ? { textAlign: 'center', fontWeight: 600 } : undefined}
      >
        {text}
      </td>
    );
  }

  if (loading && !data) {
    return <p className="adm-muted">Загрузка групп…</p>;
  }
  if (!data) {
    return <p className="adm-muted">Не удалось загрузить сводку по группам.</p>;
  }

  return (
    <div className="adm-dash-stack">
      <DashScreenTitle
        title="Группы"
        hint="Итоговая анкета по дням · 7 точек активности · средняя вовлечённость"
      />

      <HubKpiRow
        cols={3}
        items={[
          {
            value: `${selectedDay} / 8`,
            label: 'день форума',
            sub: meta?.currentForumDay != null ? `сейчас идёт ${meta.currentForumDay}` : undefined,
            accent: 'var(--m-accent)',
          },
          {
            value: dashVal(kpi.groupsCount),
            label: 'групп в срезе',
            sub: kpi.groupsWithPeople != null ? `с людьми · ${kpi.groupsWithPeople}` : undefined,
          },
          {
            value: dashVal(kpi.registered),
            label: 'зарегистрировано',
            sub: kpi.cohortSize != null ? `в когорте · ${kpi.cohortSize}` : undefined,
          },
          {
            value: dashVal(kpi.eveningSubmitted),
            label: `итоговая анкета · день ${selectedDay}`,
            sub: kpi.eveningFillPct != null ? `охват ${kpi.eveningFillPct}%` : undefined,
            accent: '#22c55e',
          },
          {
            value: kpi.avgEngagementPct != null ? `${kpi.avgEngagementPct}%` : '—',
            label: 'средняя вовлечённость',
            sub: 'по группам таблицы',
            accent: '#22c55e',
          },
          {
            value: dashVal(kpi.groupsFullToday),
            label: 'групп со 100% сдачи',
            sub: `за день ${selectedDay}`,
            accent: '#22c55e',
          },
        ]}
      />

      <SectionLabel>Группы · итоговая анкета и точки активности</SectionLabel>
      <DashCard title="Сводка по группам">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <p className="adm-muted" style={{ fontSize: 12, margin: 0, flex: '1 1 240px' }}>
            Подсветка от зарег.: красный — 0%, зелёный — 100%.
            Ср. вовлеч. — среднее охвата по дням итоговой и Т1…Т7 (день {touchpointDay}).
            Организаторы и 0А скрыты.
          </p>
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            onClick={() => { setShowColPanel(v => !v); setShowRowPanel(false); }}
          >
            Столбцы
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            onClick={() => { setShowRowPanel(v => !v); setShowColPanel(false); }}
          >
            Строки
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary adm-btn-sm"
            disabled={exporting || byGroupRaw.length === 0}
            onClick={() => { void downloadExcel(); }}
          >
            {exporting ? 'Выгрузка…' : 'Скачать Excel'}
          </button>
        </div>

        {showColPanel && (
          <div className="card" style={{ padding: 10, marginBottom: 8, justifyContent: 'flex-start' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Показать столбцы</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
              {columns.map(c => (
                <label key={c.id} style={{ fontSize: 12, alignItems: 'center', gap: 4, display: 'inline-flex' }}>
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(c.id)}
                    onChange={() => toggleCol(c.id)}
                  />
                  {c.groupLabel || c.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="adm-link"
              style={{ marginTop: 6, fontSize: 12 }}
              onClick={() => setHiddenCols(new Set())}
            >
              Показать все столбцы
            </button>
          </div>
        )}

        {showRowPanel && (
          <div className="card" style={{ padding: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Показать строки</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', maxHeight: 160, overflow: 'auto' }}>
              {byGroupRaw.map(r => (
                <label key={r.group} style={{ fontSize: 12, alignItems: 'center', gap: 4, display: 'inline-flex' }}>
                  <input
                    type="checkbox"
                    checked={!hiddenRows.has(r.group)}
                    onChange={() => toggleRow(r.group)}
                  />
                  {r.group}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="adm-link"
              style={{ marginTop: 6, fontSize: 12 }}
              onClick={() => setHiddenRows(new Set())}
            >
              Показать все строки
            </button>
          </div>
        )}

        {sortedRows.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
            {byGroupRaw.length === 0 ? 'Нет групп в срезе.' : 'Все строки скрыты — откройте «Строки».'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  {visibleCols.map(col => (
                    <th
                      key={col.id}
                      title={col.title || col.label}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        background: col.id === 'avg' ? 'rgba(34, 197, 94, 0.08)' : undefined,
                      }}
                      onClick={() => toggleSort(col.id)}
                    >
                      {col.label}{sortMark(sort, col.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(row => (
                  <tr key={row.group}>
                    {visibleCols.map(col => renderCell(col, row))}
                  </tr>
                ))}
                {totalsRow && (
                  <tr style={{ fontWeight: 600 }}>
                    {visibleCols.map(col => renderCell(col, totalsRow, true))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {slotsMeta.length > 0 && (
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>
            Точки: {slotsMeta.map(s => `Т${s.index} — ${s.shortLabel}`).join(' · ')}
            {' · '}Клик по заголовку — сортировка
          </p>
        )}
      </DashCard>
    </div>
  );
}
