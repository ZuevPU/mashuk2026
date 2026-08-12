import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from '../analytics/chartRu';
import { DashCard } from '../analytics/dashboardUi';

export type SlotRow = {
  index: number;
  title: string;
  shortLabel: string;
  openMin: number;
  closeMin: number;
  hasQuestion: boolean;
  completed: number;
  coveragePct: number;
};

export type DayCoverage = {
  day: number;
  registered: number;
  slots: SlotRow[];
};

export type DirectionCoverage = {
  direction: string;
  registered: number;
  slots: SlotRow[];
};

export type TouchpointSlotCoverageData = {
  slotsTotal?: number;
  byDay?: DayCoverage[];
  forum?: DayCoverage | null;
  byDirectionDay?: Array<{ day: number; directions: DirectionCoverage[] }>;
  byDirectionForum?: DirectionCoverage[];
};

type Props = {
  data: TouchpointSlotCoverageData | null | undefined;
};

const FORUM_DAY = 0;

function formatMin(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function barColor(pct: number, hasQuestion: boolean): string {
  if (!hasQuestion && pct <= 0) return '#d1d5db';
  if (pct >= 85) return '#276749';
  if (pct >= 75) return '#C4A35A';
  return '#C53030';
}

function SlotAxisTick({ x, y, payload }: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const raw = String(payload?.value ?? '');
  const parts = raw.split(' · ');
  const line1 = parts[0] || raw;
  const line2 = parts[1] || '';
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" fill="#6b7280" fontSize={10}>
        <tspan x={0} dy={12}>{line1}</tspan>
        {line2 ? <tspan x={0} dy={12}>{line2}</tspan> : null}
      </text>
    </g>
  );
}

function SlotTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: {
    shortLabel: string;
    title: string;
    coveragePct: number;
    completed: number;
    registered: number;
    window: string;
  } }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e5ea',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,.08)',
    }}>
      <div style={{ fontWeight: 600 }}>{p.shortLabel}</div>
      <div className="adm-muted" style={{ fontSize: 11, marginTop: 2 }}>{p.title}</div>
      <div style={{ marginTop: 6 }}>Охват: <strong>{p.coveragePct}%</strong></div>
      <div>{p.completed} из {p.registered} · окно {p.window}</div>
    </div>
  );
}

function aggregateForumFromDays(byDay: DayCoverage[]): DayCoverage | null {
  if (!byDay.length) return null;
  const registered = byDay[0]?.registered ?? 0;
  const slotCount = byDay[0]?.slots.length ?? 0;
  if (!slotCount) return null;
  const slots: SlotRow[] = [];
  for (let i = 0; i < slotCount; i++) {
    const sample = byDay.map(d => d.slots[i]).filter(Boolean) as SlotRow[];
    if (!sample.length) continue;
    const completed = Math.round(
      sample.reduce((s, r) => s + r.completed, 0) / sample.length,
    );
    const coveragePct = Math.round(
      (sample.reduce((s, r) => s + r.coveragePct, 0) / sample.length) * 10,
    ) / 10;
    const base = sample[0]!;
    slots.push({
      ...base,
      completed,
      coveragePct,
      hasQuestion: sample.some(s => s.hasQuestion),
    });
  }
  return { day: 0, registered, slots };
}

export function useSlotDayFilter(
  byDay: DayCoverage[],
  forum: DayCoverage | null | undefined,
) {
  const { forumDay, meta } = useInsights();
  const dayOptions = useMemo(() => {
    if (byDay.length) return byDay.map(d => d.day);
    const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
    return [Math.min(Math.max(1, cur), 7)];
  }, [byDay, meta?.currentForumDay, forumDay]);

  const forumRow = forum ?? aggregateForumFromDays(byDay);

  const defaultDay = dayOptions.includes(Number(forumDay))
    ? Number(forumDay)
    : (dayOptions[dayOptions.length - 1] ?? 1);
  const [day, setDay] = useState(defaultDay);

  useEffect(() => {
    if (day === FORUM_DAY) return;
    if (!dayOptions.includes(day) && dayOptions.length) {
      setDay(dayOptions.includes(Number(forumDay)) ? Number(forumDay) : dayOptions[dayOptions.length - 1]!);
    }
  }, [day, dayOptions, forumDay]);

  const dayRow = day === FORUM_DAY
    ? forumRow
    : (byDay.find(d => d.day === day) ?? byDay[0] ?? null);

  return { day, setDay, dayOptions, dayRow, FORUM_DAY };
}

/**
 * Вертикальные столбцы охвата по 7 слотам дня — «какая точка чаще пропускается».
 * Данные: pulse/hub touchpointSlotCoverage.
 */
export function TouchpointSlotChart({ data }: Props) {
  const byDay = data?.byDay ?? [];
  const { day, setDay, dayOptions, dayRow, FORUM_DAY: forumKey } = useSlotDayFilter(
    byDay,
    data?.forum,
  );

  const chartData = useMemo(() => {
    if (!dayRow) return [];
    return dayRow.slots.map(s => ({
      ...s,
      window: `${formatMin(s.openMin)}–${formatMin(s.closeMin)}`,
      registered: dayRow.registered,
      pct: s.coveragePct,
    }));
  }, [dayRow]);

  const insight = useMemo(() => {
    const ranked = chartData
      .filter(s => s.hasQuestion || s.completed > 0)
      .slice()
      .sort((a, b) => a.coveragePct - b.coveragePct);
    const worst = ranked[0];
    if (!worst || chartData.every(s => s.coveragePct <= 0)) return null;
    const avg = chartData.reduce((s, r) => s + r.coveragePct, 0) / Math.max(1, chartData.length);
    if (worst.coveragePct >= avg - 5 && worst.coveragePct >= 70) return null;
    const scope = day === forumKey ? 'за весь форум' : `за день`;
    return `Слот «${worst.title}» (${worst.window}) проседает сильнее остальных ${scope} — охват ${worst.coveragePct}% (${worst.completed} из ${worst.registered}).`;
  }, [chartData, day, forumKey]);

  if (!byDay.length && !data?.forum) {
    return (
      <DashCard title="Точки активности — по конкретному слоту">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по слотам точек осмысления для текущего среза.
        </p>
      </DashCard>
    );
  }

  return (
    <DashCard title="Точки активности — по конкретному слоту" badge="детализация">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          {day === forumKey
            ? 'Охват слота за весь форум: участник закрыл точку хотя бы в один день'
            : 'Какая именно точка чаще пропускается'}
        </p>
        <label className="adm-insights-filter">
          День
          <select
            className="adm-input"
            value={day}
            onChange={e => setDay(Number(e.target.value))}
          >
            <option value={forumKey}>Весь форум</option>
            {dayOptions.map(d => (
              <option key={d} value={d}>{formatForumDay(d)}</option>
            ))}
          </select>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 4, right: 8, top: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
          <XAxis
            dataKey="shortLabel"
            tick={<SlotAxisTick />}
            interval={0}
            height={56}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: '#86868b' }}
            width={44}
          />
          <Tooltip content={<SlotTooltip />} />
          <Bar dataKey="coveragePct" name="Охват" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map(s => (
              <Cell key={s.index} fill={barColor(s.coveragePct, s.hasQuestion)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {insight && (
        <p style={{
          fontSize: 12,
          fontStyle: 'italic',
          color: '#6b7280',
          margin: '4px 0 0',
          lineHeight: 1.45,
        }}>
          {insight}
        </p>
      )}
    </DashCard>
  );
}

/** Цвета слотов для групповой диаграммы по направлениям. */
export const TOUCHPOINT_SLOT_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#8b5cf6',
  3: '#06b6d4',
  4: '#f59e0b',
  5: '#10b981',
  6: '#6366f1',
  7: '#C4A35A',
};

function DirectionSlotTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }[];
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const registered = Number(row?.registered ?? 0);
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e5ea',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,.08)',
      maxWidth: 280,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{String(label ?? '')}</div>
      <div className="adm-muted" style={{ fontSize: 11, marginBottom: 6 }}>
        {registered} зарегистрированных
      </div>
      {payload.map(p => (
        <div key={String(p.dataKey)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>
            <i style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color,
              marginRight: 6,
            }}
            />
            {p.name}
          </span>
          <strong>{p.value ?? 0}%</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * Охват 7 точек по направлениям: у каждого направления — 7 столбцов слотов.
 */
export function TouchpointDirectionSlotChart({ data }: Props) {
  const byDay = data?.byDay ?? [];
  const { day, setDay, dayOptions, FORUM_DAY: forumKey } = useSlotDayFilter(
    byDay,
    data?.forum,
  );

  const slotsMeta = useMemo(() => {
    const fromDay = byDay[0]?.slots
      ?? data?.forum?.slots
      ?? data?.byDirectionForum?.[0]?.slots
      ?? [];
    return fromDay.map(s => ({
      index: s.index,
      shortLabel: s.shortLabel,
      title: s.title,
      color: TOUCHPOINT_SLOT_COLORS[s.index] ?? '#6b7280',
    }));
  }, [byDay, data?.forum, data?.byDirectionForum]);

  const directions = useMemo(() => {
    if (day === forumKey) return data?.byDirectionForum ?? [];
    return data?.byDirectionDay?.find(d => d.day === day)?.directions ?? [];
  }, [data?.byDirectionDay, data?.byDirectionForum, day, forumKey]);

  const chartData = useMemo(() => {
    return directions.map(d => {
      const row: Record<string, string | number> = {
        direction: d.direction,
        registered: d.registered,
      };
      for (const s of d.slots) {
        row[`s${s.index}`] = s.coveragePct;
        row[`c${s.index}`] = s.completed;
      }
      return row;
    });
  }, [directions]);

  if (!byDay.length && !data?.byDirectionForum?.length) {
    return (
      <DashCard title="Точки активности — по направлениям">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по направлениям для текущего среза.
        </p>
      </DashCard>
    );
  }

  return (
    <DashCard title="Точки активности — по направлениям" badge="детализация">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          У каждого направления — охват всех семи точек
        </p>
        <label className="adm-insights-filter">
          День
          <select
            className="adm-input"
            value={day}
            onChange={e => setDay(Number(e.target.value))}
          >
            <option value={forumKey}>Весь форум</option>
            {dayOptions.map(d => (
              <option key={d} value={d}>{formatForumDay(d)}</option>
            ))}
          </select>
        </label>
      </div>

      {chartData.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет направлений в срезе.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(280, 40 + chartData.length * 8)}>
          <BarChart
            data={chartData}
            margin={{ left: 4, right: 8, top: 12, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
            <XAxis
              dataKey="direction"
              interval={0}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              height={48}
              angle={chartData.length > 5 ? -20 : 0}
              textAnchor={chartData.length > 5 ? 'end' : 'middle'}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#86868b' }}
              width={44}
            />
            <Tooltip content={<DirectionSlotTooltip />} />
            {slotsMeta.map(s => (
              <Bar
                key={s.index}
                dataKey={`s${s.index}`}
                name={s.shortLabel}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      <div
        className="adm-day-results-legend"
        style={{
          marginTop: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 14px',
          fontSize: 12,
          color: '#4b5563',
        }}
      >
        {slotsMeta.map(s => (
          <span key={s.index} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: s.color,
              display: 'inline-block',
            }}
            />
            {s.shortLabel}
          </span>
        ))}
      </div>
    </DashCard>
  );
}
