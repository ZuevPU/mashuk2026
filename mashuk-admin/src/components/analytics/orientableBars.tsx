import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltipRu } from './chartRu';

/** horizontal = полосы слева направо; vertical = классические столбцы снизу вверх */
export type BarsLayout = 'horizontal' | 'vertical';

const CHART_TICK = { fontSize: 11, fill: '#86868b' } as const;
const DEFAULT_BAR_FILL = '#1F3A5F';

export type BarSeries = {
  dataKey: string;
  name?: string;
  fill?: string;
};

export function ChartOrientToggle({
  value,
  onChange,
}: {
  value: BarsLayout;
  onChange: (v: BarsLayout) => void;
}) {
  const next: BarsLayout = value === 'horizontal' ? 'vertical' : 'horizontal';
  return (
    <button
      type="button"
      className="adm-chart-orient-btn"
      onClick={() => onChange(next)}
      title={value === 'horizontal' ? 'Вертикальные столбцы' : 'Горизонтальные столбцы'}
      aria-label={value === 'horizontal' ? 'Переключить на вертикальные столбцы' : 'Переключить на горизонтальные столбцы'}
    >
      {value === 'horizontal' ? '▤' : '▥'}
    </button>
  );
}

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
  const [barsLayout, setBarsLayout] = useState<BarsLayout>('horizontal');
  const horizontal = barsLayout === 'horizontal';
  const h = height ?? (horizontal
    ? Math.max(220, data.length * 36)
    : Math.max(220, 180 + Math.min(data.length, 12) * 8));

  if (!data.length) {
    return <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных</p>;
  }

  return (
    <div className="adm-chart-frame">
      <ChartOrientToggle value={barsLayout} onChange={setBarsLayout} />
      <ResponsiveContainer width="100%" height={h}>
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={margin ?? { left: 8, right: 24, top: 8, bottom: 4 }}>
            <CartesianGrid stroke="#e5e5ea" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={CHART_TICK} />
            <YAxis
              type="category"
              dataKey={categoryKey}
              width={yAxisWidth}
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
            />
            <Tooltip content={<ChartTooltipRu />} />
            {showLegend && <Legend />}
            {series.map(s => (
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name ?? s.dataKey} fill={s.fill ?? DEFAULT_BAR_FILL} />
            ))}
          </BarChart>
        ) : (
          <BarChart data={data} margin={margin ?? { left: 8, right: 8, top: 12, bottom: 8 }}>
            <CartesianGrid stroke="#e5e5ea" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey={categoryKey}
              axisLine={false}
              tickLine={false}
              tick={CHART_TICK}
              interval={0}
              angle={data.length > 6 ? -25 : 0}
              textAnchor={data.length > 6 ? 'end' : 'middle'}
              height={data.length > 6 ? 70 : 40}
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={CHART_TICK} />
            <Tooltip content={<ChartTooltipRu />} />
            {showLegend && <Legend />}
            {series.map(s => (
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name ?? s.dataKey} fill={s.fill ?? DEFAULT_BAR_FILL} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
