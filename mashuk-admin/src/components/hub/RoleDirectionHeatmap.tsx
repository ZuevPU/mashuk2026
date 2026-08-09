import { useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from '../analytics/chartRu';
import { DashCard } from '../analytics/dashboardUi';

type RoleMeta = { roleKey: string; name: string };
type Cell = { direction: string; roleKey: string; count: number; pct: number };
type DayMatrix = {
  day: number;
  registeredByDirection: { direction: string; n: number }[];
  cells: Cell[];
};

type Props = {
  data: {
    roles?: RoleMeta[];
    directions?: string[];
    byDay?: DayMatrix[];
  } | null | undefined;
  onOpenDirection?: (direction: string) => void;
};

type ViewMode = 'day' | 'all' | 'compare';

function cellBg(pct: number, mean: number): string {
  if (pct <= 0) return '#f3f4f6';
  const above = pct >= mean && mean > 0;
  // Teal scale; darker when above role mean across directions
  const t = Math.min(1, pct / 40);
  if (above) {
    const a = 0.35 + t * 0.45;
    return `rgba(15, 118, 110, ${a})`;
  }
  const a = 0.12 + t * 0.28;
  return `rgba(45, 212, 191, ${a})`;
}

function cellTextColor(pct: number, mean: number): string {
  if (pct <= 0) return '#9ca3af';
  if (pct >= mean && mean > 0 && pct >= 18) return '#fff';
  return '#134e4a';
}

/**
 * Heatmap роль × направление.
 * Режимы: один день / среднее по всем дням / сравнение по дням (значения D1…Dn в ячейке).
 */
export function RoleDirectionHeatmap({ data, onOpenDirection }: Props) {
  const { forumDay, meta } = useInsights();
  const roles = data?.roles ?? [];
  const directions = data?.directions ?? [];
  const byDay = data?.byDay ?? [];
  const dayOptions = byDay.map(d => d.day);

  const current = meta?.currentForumDay ?? (Number(forumDay) || 1);
  const [mode, setMode] = useState<ViewMode>('day');
  const [day, setDay] = useState(
    dayOptions.includes(current) ? current : (dayOptions[dayOptions.length - 1] ?? 1),
  );

  const avgMatrix = useMemo(() => {
    if (!byDay.length || !roles.length || !directions.length) return null;
    const sums = new Map<string, { pct: number; n: number; count: number }>();
    for (const d of byDay) {
      for (const c of d.cells) {
        const key = `${c.direction}::${c.roleKey}`;
        const cur = sums.get(key) ?? { pct: 0, n: 0, count: 0 };
        cur.pct += c.pct;
        cur.count += c.count;
        cur.n += 1;
        sums.set(key, cur);
      }
    }
    const cells: Cell[] = directions.flatMap(direction =>
      roles.map(role => {
        const cur = sums.get(`${direction}::${role.roleKey}`);
        return {
          direction,
          roleKey: role.roleKey,
          count: cur ? Math.round(cur.count / Math.max(1, cur.n)) : 0,
          pct: cur && cur.n ? Math.round((cur.pct / cur.n) * 10) / 10 : 0,
        };
      }),
    );
    return { day: 0, cells, registeredByDirection: [] as { direction: string; n: number }[] };
  }, [byDay, roles, directions]);

  const activeDay = mode === 'all' ? avgMatrix : byDay.find(d => d.day === day) ?? byDay[0] ?? null;

  const meansByRole = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeDay) return map;
    for (const role of roles) {
      const vals = activeDay.cells.filter(c => c.roleKey === role.roleKey).map(c => c.pct);
      const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      map.set(role.roleKey, mean);
    }
    return map;
  }, [activeDay, roles]);

  const prevDay = byDay.find(d => d.day === day - 1) ?? null;

  const compareSeries = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const d of byDay) {
      for (const c of d.cells) {
        const key = `${c.direction}::${c.roleKey}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c.pct);
      }
    }
    return map;
  }, [byDay]);

  /** Среднее по направлениям для последнего дня среза — заливка в режиме сравнения. */
  const compareMeansByRole = useMemo(() => {
    const map = new Map<string, number>();
    const last = byDay[byDay.length - 1];
    if (!last) return map;
    for (const role of roles) {
      const vals = last.cells.filter(c => c.roleKey === role.roleKey).map(c => c.pct);
      map.set(role.roleKey, vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
    }
    return map;
  }, [byDay, roles]);

  if (!roles.length || !directions.length) {
    return (
      <DashCard title="Роль × направление кросс-срез">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по ролям и направлениям в срезе.
        </p>
      </DashCard>
    );
  }

  return (
    <DashCard title="Роль × направление кросс-срез">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 10,
      }}>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          Доля участников направления с каждой ролью, %
        </p>
        <div className="adm-forum-toolbar" style={{ gap: 8, margin: 0, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={mode === 'day' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
            onClick={() => setMode('day')}
          >
            Один день
          </button>
          <button
            type="button"
            className={mode === 'all' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
            onClick={() => setMode('all')}
          >
            Все дни · среднее
          </button>
          <button
            type="button"
            className={mode === 'compare' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
            onClick={() => setMode('compare')}
          >
            Сравнение по дням
          </button>
          {mode === 'day' && (
            <label className="adm-insights-filter">
              День
              <select className="adm-input" value={day} onChange={e => setDay(Number(e.target.value))}>
                {dayOptions.map(d => (
                  <option key={d} value={d}>{formatForumDay(d)}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="adm-table" style={{ fontSize: 12, minWidth: mode === 'compare' ? 920 : 720 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 110 }}>Направление</th>
              {roles.map(r => (
                <th
                  key={r.roleKey}
                  style={{
                    textAlign: 'center',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.02,
                    lineHeight: 1.25,
                    maxWidth: mode === 'compare' ? 140 : 110,
                  }}
                >
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {directions.map(direction => (
              <tr key={direction}>
                <td>
                  {onOpenDirection ? (
                    <button type="button" className="adm-link" style={{ fontWeight: 600 }} onClick={() => onOpenDirection(direction)}>
                      {direction}
                    </button>
                  ) : (
                    <strong>{direction}</strong>
                  )}
                </td>
                {roles.map(role => {
                  if (mode === 'compare') {
                    const series = compareSeries.get(`${direction}::${role.roleKey}`) ?? [];
                    const label = series.map(v => (v > 0 ? `${Math.round(v)}` : '·')).join(' → ');
                    const last = series[series.length - 1] ?? 0;
                    const first = series[0] ?? 0;
                    const mean = compareMeansByRole.get(role.roleKey) ?? 0;
                    return (
                      <td key={role.roleKey} style={{ textAlign: 'center', padding: 4 }}>
                        <div
                          title={`${role.name}: ${series.map((v, i) => `${formatForumDay(dayOptions[i] ?? i + 1)} ${v}%`).join(', ')}`}
                          style={{
                            borderRadius: 8,
                            padding: '6px 4px',
                            background: cellBg(last, mean),
                            color: cellTextColor(last, mean),
                            fontWeight: 600,
                            fontSize: 11,
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: 1.3,
                          }}
                        >
                          <div>{label || '—'}</div>
                          {series.length > 1 && (
                            <div style={{ fontWeight: 500, opacity: 0.85, fontSize: 10 }}>
                              Δ {last - first > 0 ? '+' : ''}{Math.round((last - first) * 10) / 10}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  }

                  const cell = activeDay?.cells.find(
                    c => c.direction === direction && c.roleKey === role.roleKey,
                  );
                  const pct = cell?.pct ?? 0;
                  const mean = meansByRole.get(role.roleKey) ?? 0;
                  let deltaLabel = '';
                  if (mode === 'day' && prevDay) {
                    const prev = prevDay.cells.find(
                      c => c.direction === direction && c.roleKey === role.roleKey,
                    )?.pct ?? 0;
                    const d = Math.round((pct - prev) * 10) / 10;
                    if (d !== 0) deltaLabel = ` ${d > 0 ? '↑' : '↓'}${Math.abs(d)}`;
                  }
                  return (
                    <td key={role.roleKey} style={{ textAlign: 'center', padding: 4 }}>
                      <div
                        title={`${role.name}: ${pct}% (${cell?.count ?? 0} чел.)`}
                        style={{
                          borderRadius: 8,
                          padding: '10px 6px',
                          background: cellBg(pct, mean),
                          color: cellTextColor(pct, mean),
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pct > 0 ? `${Math.round(pct)}%` : '—'}
                        {deltaLabel && (
                          <span style={{ fontWeight: 500, fontSize: 10, marginLeft: 2 }}>{deltaLabel}</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
        {mode === 'compare'
          ? `В ячейке — % по дням ${dayOptions.map(d => formatForumDay(d)).join(' → ')}; заливка по последнему дню. Δ — к первому дню среза.`
          : 'Тёмная заливка — роль встречается в направлении чаще среднего по колонке.'}
        {mode === 'day' && prevDay ? ' Стрелки — изменение к предыдущему дню.' : ''}
      </p>
    </DashCard>
  );
}
