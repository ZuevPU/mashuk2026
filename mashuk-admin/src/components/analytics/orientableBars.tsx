import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsightsOptional, type BarsLayout } from '../insights/InsightsContext';
import { ChartTooltipRu } from './chartRu';

export type BarSeries = {
  dataKey: string;
  name?: string;
  fill?: string;
};

/** Recharts: layout="vertical" = горизонтальные столбцы (категории слева). */
export function OrientableBarChart({
  data,
  categoryKey,
  series,
  height,
  yAxisWidth = 110,
  showLegend = false,
  margin,
}: {
  data: Record<string, unknown>[];
  categoryKey: string;
  series: BarSeries[];
  height?: number;
  yAxisWidth?: number;
  showLegend?: boolean;
  margin?: { top?: number; right?: number; left?: number; bottom?: number };
}) {
  const barsLayout = useInsightsOptional()?.barsLayout ?? 'horizontal';
  const horizontal = barsLayout === 'horizontal';
  const h = height ?? (horizontal
    ? Math.max(220, data.length * 36)
    : Math.max(220, 180 + Math.min(data.length, 12) * 8));

  if (!data.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={h}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={margin ?? { left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey={categoryKey} width={yAxisWidth} tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltipRu />} />
          {showLegend && <Legend />}
          {series.map(s => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name ?? s.dataKey} fill={s.fill ?? 'var(--m-accent)'} />
          ))}
        </BarChart>
      ) : (
        <BarChart data={data} margin={margin ?? { left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey={categoryKey}
            tick={{ fontSize: 10 }}
            interval={0}
            angle={data.length > 6 ? -25 : 0}
            textAnchor={data.length > 6 ? 'end' : 'middle'}
            height={data.length > 6 ? 70 : 40}
          />
          <YAxis allowDecimals={false} />
          <Tooltip content={<ChartTooltipRu />} />
          {showLegend && <Legend />}
          {series.map(s => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name ?? s.dataKey} fill={s.fill ?? 'var(--m-accent)'} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function BarsLayoutToggle({
  value,
  onChange,
}: {
  value: BarsLayout;
  onChange: (v: BarsLayout) => void;
}) {
  return (
    <div className="adm-bars-layout-toggle" role="group" aria-label="Вид столбчатых диаграмм">
      <button
        type="button"
        className={`adm-btn adm-btn-ghost adm-btn-sm${value === 'horizontal' ? ' is-active' : ''}`}
        onClick={() => onChange('horizontal')}
        title="Горизонтальные столбцы"
      >
        ▤ Горизонт.
      </button>
      <button
        type="button"
        className={`adm-btn adm-btn-ghost adm-btn-sm${value === 'vertical' ? ' is-active' : ''}`}
        onClick={() => onChange('vertical')}
        title="Вертикальные столбцы"
      >
        ▥ Вертик.
      </button>
    </div>
  );
}
