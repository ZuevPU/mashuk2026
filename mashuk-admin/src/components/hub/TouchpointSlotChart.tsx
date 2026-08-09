import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from '../analytics/chartRu';
import { DashCard } from '../analytics/dashboardUi';

type SlotRow = {
  index: number;
  title: string;
  shortLabel: string;
  openMin: number;
  closeMin: number;
  hasQuestion: boolean;
  completed: number;
  coveragePct: number;
};

type DayCoverage = {
  day: number;
  registered: number;
  slots: SlotRow[];
};

type Props = {
  data: {
    slotsTotal?: number;
    byDay?: DayCoverage[];
  } | null | undefined;
};

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

/**
 * Вертикальные столбцы охвата по 7 слотам дня — «какая точка чаще пропускается».
 * Данные: pulse/hub touchpointSlotCoverage.
 */
export function TouchpointSlotChart({ data }: Props) {
  const { forumDay, meta } = useInsights();
  const byDay = data?.byDay ?? [];
  const dayOptions = useMemo(() => {
    if (byDay.length) return byDay.map(d => d.day);
    const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
    return [Math.min(Math.max(1, cur), 7)];
  }, [byDay, meta?.currentForumDay, forumDay]);

  const defaultDay = dayOptions.includes(Number(forumDay))
    ? Number(forumDay)
    : (dayOptions[dayOptions.length - 1] ?? 1);
  const [day, setDay] = useState(defaultDay);

  const dayRow = byDay.find(d => d.day === day) ?? byDay[0] ?? null;

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
    return `Слот «${worst.title}» (${worst.window}) проседает сильнее остальных — охват ${worst.coveragePct}% (${worst.completed} из ${worst.registered}).`;
  }, [chartData]);

  if (!byDay.length) {
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
          Какая именно точка чаще пропускается
        </p>
        <label className="adm-insights-filter">
          День
          <select className="adm-input" value={day} onChange={e => setDay(Number(e.target.value))}>
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
