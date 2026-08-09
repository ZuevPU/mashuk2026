import type { ReactNode } from 'react';
import { DashGrid, DashKpi } from '../analytics/dashboardUi';

export type HubKpiItem = {
  value: ReactNode;
  label: string;
  sub?: string;
  trend?: string;
  trendTone?: 'up' | 'down' | 'flat';
  accent?: string;
};

/** Общая KPI-шапка для линз «Штаба». */
export function HubKpiRow({
  items,
  cols = 3,
}: {
  items: HubKpiItem[];
  cols?: 2 | 3 | 4;
}) {
  if (items.length === 0) return null;
  const rows: HubKpiItem[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return (
    <>
      {rows.map((row, idx) => (
        <DashGrid key={idx} cols={cols}>
          {row.map(item => (
            <DashKpi
              key={item.label}
              value={item.value}
              label={item.label}
              sub={item.sub}
              trend={item.trend}
              trendTone={item.trendTone}
              accent={item.accent}
            />
          ))}
        </DashGrid>
      ))}
    </>
  );
}
