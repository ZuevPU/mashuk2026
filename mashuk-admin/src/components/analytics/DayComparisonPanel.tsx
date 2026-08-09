import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { ChartTooltipRu, formatForumDay } from './chartRu';
import { DashCard } from './dashboardUi';

export type DayMetricDef = {
  key: string;
  name: string;
  color: string;
  /** default on */
  defaultOn?: boolean;
};

const CHART_TICK = { fontSize: 11, fill: '#86868b' } as const;

const DIR_PALETTE = [
  '#1F3A5F', '#2F6FED', '#0A7B6F', '#B8621A', '#6B5B95',
  '#C75000', '#3D5A80', '#588157', '#9A3412', '#475569',
];

type SeriesRow = Record<string, string | number | undefined> & { day: number };

function toChartRows(series: SeriesRow[]): SeriesRow[] {
  return series.map(row => ({
    ...row,
    dayLabel: formatForumDay(row.day),
  }));
}

function pivotDirections(
  byDirection: SeriesRow[],
  metricKey: string,
): { rows: SeriesRow[]; directions: string[] } {
  const directions = [...new Set(byDirection.map(r => String(r.direction || '—')))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const days = [...new Set(byDirection.map(r => Number(r.day)))]
    .filter(d => d >= 1)
    .sort((a, b) => a - b);
  const rows = days.map(day => {
    const row: SeriesRow = { day, dayLabel: formatForumDay(day) };
    for (const dir of directions) {
      const hit = byDirection.find(r => Number(r.day) === day && String(r.direction || '—') === dir);
      row[dir] = Number(hit?.[metricKey] ?? 0);
    }
    return row;
  });
  return { rows, directions };
}

export function DayComparisonPanel({
  title = 'Динамика по дням',
  hint = 'Сравнение по дням форума. Детали ниже — по выбранному дню в фильтре.',
  series,
  byDirectionDaySeries,
  metrics,
  directionMetricKey,
  hideDirectionTab = false,
}: {
  title?: string;
  hint?: string;
  series: SeriesRow[] | undefined | null;
  byDirectionDaySeries?: SeriesRow[] | undefined | null;
  metrics: DayMetricDef[];
  /** Metric used for «По направлениям» multi-line chart */
  directionMetricKey?: string;
  hideDirectionTab?: boolean;
}) {
  const { forumDay } = useInsights();
  const selectedDayLabel = forumDay ? formatForumDay(Number(forumDay)) : null;
  const [tab, setTab] = useState<'totals' | 'directions'>('totals');
  const [onKeys, setOnKeys] = useState<Set<string>>(() => {
    const initial = metrics.filter(m => m.defaultOn !== false).map(m => m.key);
    return new Set(initial.length ? initial : metrics.slice(0, 2).map(m => m.key));
  });

  const dirMetric = directionMetricKey
    || metrics.find(m => m.key === 'coveragePct' || m.key === 'fillRatePct')?.key
    || metrics[0]?.key;

  const chartRows = useMemo(() => toChartRows(series ?? []), [series]);
  const dirPivot = useMemo(
    () => pivotDirections(byDirectionDaySeries ?? [], dirMetric),
    [byDirectionDaySeries, dirMetric],
  );

  const showDirections = !hideDirectionTab
    && (byDirectionDaySeries?.length ?? 0) > 0
    && dirPivot.directions.length > 0;

  if (!chartRows.length) {
    return (
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по дням для сравнения</p>
      </DashCard>
    );
  }

  const toggle = (key: string) => {
    setOnKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return next;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const dirMetricName = metrics.find(m => m.key === dirMetric)?.name || dirMetric;

  return (
    <DashCard title={title}>
      {hint ? (
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>{hint}</p>
      ) : null}

      <div className="adm-day-compare-toolbar">
        <div className="adm-day-compare-tabs" role="tablist" aria-label="Режим сравнения">
          <button
            type="button"
            role="tab"
            className={`adm-metric-chip${tab === 'totals' ? ' is-active' : ''}`}
            aria-selected={tab === 'totals'}
            onClick={() => setTab('totals')}
          >
            Всего
          </button>
          {showDirections && (
            <button
              type="button"
              role="tab"
              className={`adm-metric-chip${tab === 'directions' ? ' is-active' : ''}`}
              aria-selected={tab === 'directions'}
              onClick={() => setTab('directions')}
            >
              По направлениям
            </button>
          )}
        </div>

        {tab === 'totals' && (
          <div className="adm-day-compare-metrics" role="group" aria-label="Метрики">
            {metrics.map(m => (
              <button
                key={m.key}
                type="button"
                className={`adm-metric-chip${onKeys.has(m.key) ? ' is-active' : ''}`}
                style={onKeys.has(m.key) ? { borderColor: m.color, color: m.color } : undefined}
                onClick={() => toggle(m.key)}
              >
                <span className="adm-metric-chip-dot" style={{ background: m.color }} />
                {m.name}
              </button>
            ))}
          </div>
        )}
        {tab === 'directions' && (
          <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
            Метрика: {dirMetricName}
            {selectedDayLabel ? ` · фильтр деталей: ${selectedDayLabel}` : ''}
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        {tab === 'totals' ? (
          <LineChart data={chartRows} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid stroke="#e5e5ea" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dayLabel"
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={CHART_TICK} width={40} />
            <Tooltip content={<ChartTooltipRu />} />
            <Legend />
            {metrics.filter(m => onKeys.has(m.key)).map(m => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.name}
                stroke={m.color}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: m.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        ) : (
          <LineChart data={dirPivot.rows} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid stroke="#e5e5ea" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dayLabel" axisLine={false} tickLine={false} tick={CHART_TICK} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={CHART_TICK} width={40} />
            <Tooltip content={<ChartTooltipRu />} />
            <Legend />
            {dirPivot.directions.map((dir, i) => (
              <Line
                key={dir}
                type="monotone"
                dataKey={dir}
                name={dir}
                stroke={DIR_PALETTE[i % DIR_PALETTE.length]}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </DashCard>
  );
}

/** Standard metric packs */
export const PULSE_DAY_METRICS: DayMetricDef[] = [
  { key: 'active', name: 'Активные', color: '#1F3A5F', defaultOn: true },
  { key: 'coveragePct', name: 'Охват, %', color: '#0A7B6F', defaultOn: true },
  { key: 'eveningCompleted', name: 'Итоги', color: '#B8621A', defaultOn: true },
  { key: 'touchpoints', name: 'Смысл', color: '#2F6FED', defaultOn: true },
];

export const EVENING_DAY_METRICS: DayMetricDef[] = [
  { key: 'submitted', name: 'Сдано', color: '#1F3A5F', defaultOn: true },
  { key: 'fillRatePct', name: 'Охват, %', color: '#0A7B6F', defaultOn: true },
  { key: 'drafts', name: 'Черновики', color: '#B8621A', defaultOn: false },
];

export const AFTER_BLOCKS_DAY_METRICS: DayMetricDef[] = [
  { key: 'submitted', name: 'Ответили', color: '#1F3A5F', defaultOn: true },
  { key: 'fillRatePct', name: 'Охват, %', color: '#0A7B6F', defaultOn: true },
  { key: 'answerCount', name: 'Ответов', color: '#2F6FED', defaultOn: true },
];

export const STATE_CHECK_DAY_METRICS: DayMetricDef[] = [
  { key: 'submitted', name: 'Ответили', color: '#1F3A5F', defaultOn: true },
  { key: 'fillRatePct', name: 'Охват, %', color: '#0A7B6F', defaultOn: true },
  { key: 'riskFatiguePct', name: 'Риск+усталость, %', color: '#C75000', defaultOn: true },
];

export const DIRECTION_DAY_METRICS: DayMetricDef[] = [
  { key: 'active', name: 'Активные', color: '#1F3A5F', defaultOn: true },
  { key: 'coveragePct', name: 'Охват, %', color: '#0A7B6F', defaultOn: true },
  { key: 'eveningCompleted', name: 'Итоги', color: '#B8621A', defaultOn: true },
  { key: 'afterBlocksSubmitted', name: 'После блоков', color: '#2F6FED', defaultOn: true },
  { key: 'stateCheckSubmitted', name: 'Состояние', color: '#6B5B95', defaultOn: false },
  { key: 'touchpoints', name: 'Смысл', color: '#588157', defaultOn: false },
];
