import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { ChartTooltipRu, formatForumDay } from './chartRu';
import { DashCard, DashGrid } from './dashboardUi';
import { OrientableBarChart } from './orientableBars';

type ThresholdPoint = {
  day: number;
  registered: number;
  atLeast: Record<string, number>;
};

type DirectionThresholdPoint = ThresholdPoint & {
  direction: string;
};

type Props = {
  data: {
    slotsTotal?: number;
    byDay?: ThresholdPoint[];
    byDirectionDay?: DirectionThresholdPoint[];
  } | null | undefined;
};

const THRESHOLD_KEY = 'mashuk_overview_tp_min_slots';

function readThreshold(slotsTotal: number): number {
  try {
    const v = Number(sessionStorage.getItem(THRESHOLD_KEY));
    if (Number.isFinite(v) && v >= 1 && v <= slotsTotal) return Math.round(v);
  } catch { /* ignore */ }
  return slotsTotal;
}

export function TouchpointCoveragePanel({ data }: Props) {
  const { forumDay, meta } = useInsights();
  const slotsTotal = data?.slotsTotal ?? 7;
  const byDay = data?.byDay ?? [];
  const byDirectionDay = data?.byDirectionDay ?? [];

  const [minSlots, setMinSlots] = useState(() => readThreshold(slotsTotal));
  const dayOptions = useMemo(() => {
    if (byDay.length) return byDay.map(d => d.day);
    const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
    return Array.from({ length: Math.min(Math.max(1, cur), 7) }, (_, i) => i + 1);
  }, [byDay, meta?.currentForumDay, forumDay]);

  const defaultDirDay = dayOptions.includes(Number(forumDay))
    ? Number(forumDay)
    : (dayOptions[dayOptions.length - 1] ?? 1);
  const [dirDay, setDirDay] = useState(defaultDirDay);

  const dayChart = useMemo(() => byDay.map(row => {
    const people = row.atLeast?.[String(minSlots)] ?? 0;
    const pct = row.registered ? Math.round((people / row.registered) * 100) : 0;
    return {
      dayLabel: formatForumDay(row.day),
      people,
      registered: row.registered,
      pct,
    };
  }), [byDay, minSlots]);

  const dirChart = useMemo(() => {
    const rows = byDirectionDay.filter(r => r.day === dirDay);
    return rows
      .map(row => {
        const people = row.atLeast?.[String(minSlots)] ?? 0;
        return {
          name: row.direction,
          people,
          registered: row.registered,
          pct: row.registered ? Math.round((people / row.registered) * 100) : 0,
        };
      })
      .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, 'ru'));
  }, [byDirectionDay, dirDay, minSlots]);

  const onThreshold = (v: number) => {
    setMinSlots(v);
    try { sessionStorage.setItem(THRESHOLD_KEY, String(v)); } catch { /* ignore */ }
  };

  if (!byDay.length && !byDirectionDay.length) {
    return (
      <DashCard title="Точки активности">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по точкам осмысления для текущего среза.
        </p>
      </DashCard>
    );
  }

  return (
    <div className="adm-dash-stack" style={{ gap: 12 }}>
      <SectionHeader
        minSlots={minSlots}
        slotsTotal={slotsTotal}
        onThreshold={onThreshold}
        dirDay={dirDay}
        dayOptions={dayOptions}
        onDirDay={setDirDay}
      />
      <DashGrid cols={2}>
        <DashCard title={`По дням · ≥ ${minSlots} из ${slotsTotal}`}>
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Сколько человек закрыли минимум выбранное число точек осмысления за день.
          </p>
          {dayChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dayChart} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltipRu />} />
                <Bar dataKey="people" name="Человек" fill="var(--m-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет серии по дням</p>
          )}
        </DashCard>

        <DashCard title={`По направлениям · ${formatForumDay(dirDay)} · ≥ ${minSlots}`}>
          <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Тот же порог точек, срез по выбранному дню.
          </p>
          {dirChart.length > 0 ? (
            <OrientableBarChart
              data={dirChart}
              categoryKey="name"
              series={[
                { dataKey: 'people', name: 'Человек', fill: 'var(--m-accent)' },
                { dataKey: 'registered', name: 'Зарегистрировано', fill: '#cbd5e1' },
              ]}
              showLegend
              yAxisWidth={120}
            />
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по направлениям</p>
          )}
        </DashCard>
      </DashGrid>
    </div>
  );
}

function SectionHeader({
  minSlots,
  slotsTotal,
  onThreshold,
  dirDay,
  dayOptions,
  onDirDay,
}: {
  minSlots: number;
  slotsTotal: number;
  onThreshold: (v: number) => void;
  dirDay: number;
  dayOptions: number[];
  onDirDay: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div>
        <div className="adm-dash-section-label" style={{ marginBottom: 4 }}>Точки активности</div>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          7 слотов дня: проверки состояния, осмысления и итоги. Порог и день настраиваются здесь.
        </p>
      </div>
      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, margin: 0 }}>
        <label className="adm-insights-filter">
          Минимум точек
          <select
            className="adm-input"
            value={minSlots}
            onChange={e => onThreshold(Number(e.target.value))}
          >
            {Array.from({ length: slotsTotal }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>
                ≥ {n} {n === slotsTotal ? '(все)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-insights-filter">
          День (направления)
          <select
            className="adm-input"
            value={dirDay}
            onChange={e => onDirDay(Number(e.target.value))}
          >
            {dayOptions.map(d => (
              <option key={d} value={d}>{formatForumDay(d)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
