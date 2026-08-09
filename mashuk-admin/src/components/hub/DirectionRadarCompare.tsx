import { useEffect, useMemo, useState } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { DashCard } from '../analytics/dashboardUi';

export type DirectionMetricRow = {
  direction: string;
  registered: number;
  coveragePct: number;
  energyAvg: number | null;
  engagementLiftPct: number;
  avgPoints: number;
  piggyCount: number;
  piggyPerCapita: number;
};

const METRICS = [
  { key: 'coverage', label: 'Охват' },
  { key: 'energy', label: 'Энергия' },
  { key: 'engagementLift', label: 'Включение + подъём' },
  { key: 'rating', label: 'Рейтинг' },
  { key: 'piggy', label: 'Копилка' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

function normalizePack(rows: DirectionMetricRow[]): Map<string, Record<MetricKey, number>> {
  const maxPoints = Math.max(1, ...rows.map(r => r.avgPoints || 0));
  const maxPiggy = Math.max(1, ...rows.map(r => r.piggyPerCapita || 0));
  const out = new Map<string, Record<MetricKey, number>>();
  for (const r of rows) {
    out.set(r.direction, {
      coverage: Math.min(100, Math.max(0, r.coveragePct || 0)),
      energy: r.energyAvg != null ? Math.min(100, Math.max(0, (r.energyAvg / 10) * 100)) : 0,
      engagementLift: Math.min(100, Math.max(0, r.engagementLiftPct || 0)),
      rating: Math.min(100, Math.max(0, ((r.avgPoints || 0) / maxPoints) * 100)),
      piggy: Math.min(100, Math.max(0, ((r.piggyPerCapita || 0) / maxPiggy) * 100)),
    });
  }
  return out;
}

function RadarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e5ea',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,.08)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={String(p.name)} style={{ display: 'flex', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, marginTop: 4 }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: 'auto' }}>{Math.round(Number(p.value) || 0)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Паутинка: прямое сравнение двух направлений по 5 ключевым метрикам (0–100).
 * Данные: hub directionMetrics.
 */
export function DirectionRadarCompare({
  rows,
}: {
  rows?: DirectionMetricRow[] | null;
}) {
  const list = useMemo(
    () => [...(rows ?? [])].sort((a, b) => a.direction.localeCompare(b.direction, 'ru')),
    [rows],
  );
  const [dirA, setDirA] = useState('');
  const [dirB, setDirB] = useState('');

  useEffect(() => {
    if (!list.length) return;
    setDirA(prev => (list.some(r => r.direction === prev) ? prev : list[0].direction));
    setDirB(prev => (
      list.some(r => r.direction === prev)
        ? prev
        : (list[1]?.direction ?? list[0].direction)
    ));
  }, [list]);

  const norm = useMemo(() => normalizePack(list), [list]);

  const chartData = useMemo(() => {
    const na = norm.get(dirA);
    const nb = norm.get(dirB);
    return METRICS.map(m => ({
      metric: m.label,
      A: na ? Math.round(na[m.key]) : 0,
      B: nb ? Math.round(nb[m.key]) : 0,
    }));
  }, [norm, dirA, dirB]);

  if (list.length === 0) {
    return (
      <DashCard title="Прямое сравнение двух направлений">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет направлений для сравнения в текущем срезе.
        </p>
      </DashCard>
    );
  }

  return (
    <DashCard title="Прямое сравнение двух направлений">
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
        5 показателей, нормировано 0–100
      </p>
      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <label className="adm-insights-filter">
          A
          <select
            className="adm-input"
            value={dirA}
            onChange={e => setDirA(e.target.value)}
          >
            {list.map(r => (
              <option key={r.direction} value={r.direction}>{r.direction}</option>
            ))}
          </select>
        </label>
        <label className="adm-insights-filter">
          Б
          <select
            className="adm-input"
            value={dirB}
            onChange={e => setDirB(e.target.value)}
          >
            {list.map(r => (
              <option key={r.direction} value={r.direction}>{r.direction}</option>
            ))}
          </select>
        </label>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#e5e5ea" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#4b5563' }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
          />
          <Tooltip content={<RadarTooltip />} />
          <Radar
            name={dirA || 'A'}
            dataKey="A"
            stroke="#C53030"
            fill="#C53030"
            fillOpacity={0.28}
            isAnimationActive={false}
          />
          <Radar
            name={dirB || 'Б'}
            dataKey="B"
            stroke="#276749"
            fill="#276749"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </RadarChart>
      </ResponsiveContainer>
    </DashCard>
  );
}
