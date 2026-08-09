import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from '../analytics/chartRu';
import { DashCard } from '../analytics/dashboardUi';

type EnergyDirDay = {
  direction: string;
  day: number;
  avg: number | null;
  responses: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function EnergyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: {
    direction: string;
    energy: number;
    prev: number | null;
    delta: number | null;
  } }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: '#1d1d1f',
      color: '#fff',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.direction}</div>
      <div>Энергия сегодня: {p.energy.toFixed(1).replace('.', ',')}</div>
      {p.prev != null && (
        <div style={{ opacity: 0.85, marginTop: 2 }}>
          Было: {p.prev.toFixed(1).replace('.', ',')}
          {p.delta != null ? ` (${p.delta > 0 ? '+' : ''}${p.delta.toFixed(1).replace('.', ',')})` : ''}
        </div>
      )}
    </div>
  );
}

/**
 * Столбцы — энергия за день B; подпись — Δ к дню A.
 * Данные: emotionalPulse.energyByDirectionDay.
 */
export function DirectionEnergyCompareChart({
  byDirectionDay,
}: {
  byDirectionDay?: EnergyDirDay[] | null;
}) {
  const { forumDay, meta } = useInsights();
  const rows = byDirectionDay ?? [];
  const daysPresent = useMemo(() => {
    const set = new Set(rows.filter(r => r.responses > 0 && r.avg != null).map(r => r.day));
    if (set.size === 0) {
      const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
      return Array.from({ length: Math.min(Math.max(cur, 2), 8) }, (_, i) => i + 1);
    }
    return [...set].sort((a, b) => a - b);
  }, [rows, meta?.currentForumDay, forumDay]);

  const current = meta?.currentForumDay ?? (Number(forumDay) || 1);
  const defaultB = (() => {
    if (daysPresent.includes(current) && current > 1) return current;
    if (daysPresent.length >= 2) return daysPresent[daysPresent.length - 1];
    return daysPresent[0] ?? 2;
  })();
  const defaultA = (() => {
    if (daysPresent.includes(defaultB - 1)) return defaultB - 1;
    const earlier = [...daysPresent].reverse().find(d => d < defaultB);
    return earlier ?? daysPresent[0] ?? 1;
  })();

  const [dayA, setDayA] = useState(defaultA);
  const [dayB, setDayB] = useState(defaultB);

  const chartData = useMemo(() => {
    const dirs = [...new Set(rows.map(r => r.direction || '—'))]
      .sort((a, b) => a.localeCompare(b, 'ru'));
    return dirs.map(direction => {
      const a = rows.find(r => r.direction === direction && r.day === dayA);
      const b = rows.find(r => r.direction === direction && r.day === dayB);
      const energy = b?.avg ?? null;
      const prev = a?.avg ?? null;
      const delta = energy != null && prev != null ? round1(energy - prev) : null;
      const deltaLabel = delta == null
        ? ''
        : `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')}`;
      return {
        direction,
        energy: energy ?? 0,
        prev,
        delta,
        deltaLabel,
        hasData: energy != null && (b?.responses ?? 0) > 0,
      };
    }).filter(r => r.hasData);
  }, [rows, dayA, dayB]);

  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length) return [0, 10];
    const vals = chartData.map(r => r.energy);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return [
      Math.max(0, Math.floor((min - 0.5) * 2) / 2),
      Math.min(10, Math.ceil((max + 0.5) * 2) / 2),
    ];
  }, [chartData]);

  return (
    <DashCard title={`Энергия по направлениям · ${formatForumDay(dayA)} → ${formatForumDay(dayB)}`}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 8,
      }}>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          Столбцы — {formatForumDay(dayB)}, подпись — изменение за выбранный интервал
        </p>
        <div className="adm-forum-toolbar" style={{ gap: 8, margin: 0 }}>
          <label className="adm-insights-filter">
            День A
            <select className="adm-input" value={dayA} onChange={e => setDayA(Number(e.target.value))}>
              {daysPresent.map(d => (
                <option key={d} value={d}>{formatForumDay(d)}</option>
              ))}
            </select>
          </label>
          <label className="adm-insights-filter">
            День B
            <select className="adm-input" value={dayB} onChange={e => setDayB(Number(e.target.value))}>
              {daysPresent.map(d => (
                <option key={d} value={d}>{formatForumDay(d)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {chartData.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по энергии направлений за выбранные дни.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 4, right: 8, top: 24, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" vertical={false} />
            <XAxis
              dataKey="direction"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 11, fill: '#86868b' }}
              tickFormatter={v => Number(v).toFixed(1)}
              width={36}
            />
            <Tooltip content={<EnergyTooltip />} />
            <Bar dataKey="energy" name="Энергия" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map(r => (
                <Cell
                  key={r.direction}
                  fill={r.delta != null && r.delta > 0 ? '#276749' : '#B8621A'}
                />
              ))}
              <LabelList
                dataKey="deltaLabel"
                position="top"
                style={{ fontSize: 11, fill: '#4b5563' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </DashCard>
  );
}
