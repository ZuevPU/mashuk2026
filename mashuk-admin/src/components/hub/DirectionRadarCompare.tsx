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

const DIR_PALETTE = [
  '#C53030', '#276749', '#2B6CB0', '#B7791F', '#6B46C1',
  '#DD6B20', '#319795', '#C05621', '#2C5282', '#9B2C2C',
  '#553C9A', '#285E61', '#744210', '#1A365D', '#97266D',
];

function isOrganizerDirection(name: string): boolean {
  return name.trim().toLowerCase() === 'организатор форума';
}

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
      maxWidth: 320,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {[...payload]
        .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
        .map(p => (
          <div key={String(p.name)} style={{ display: 'flex', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, marginTop: 4, flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>{p.name}</span>
            <span style={{ marginLeft: 'auto' }}>{Math.round(Number(p.value) || 0)}</span>
          </div>
        ))}
    </div>
  );
}

/**
 * Паутинка: сравнение направлений по 5 ключевым метрикам (0–100).
 * Все направления (кроме «Организатор форума») — чекбоксами; по умолчанию все включены.
 */
export function DirectionRadarCompare({
  rows,
}: {
  rows?: DirectionMetricRow[] | null;
}) {
  const list = useMemo(
    () => [...(rows ?? [])]
      .filter(r => r.direction && !isOrganizerDirection(r.direction))
      .sort((a, b) => a.direction.localeCompare(b.direction, 'ru')),
    [rows],
  );

  const allDirs = useMemo(() => list.map(r => r.direction), [list]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(allDirs));
  }, [allDirs.join('\u0001')]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleDirs = useMemo(
    () => allDirs.filter(d => selected.has(d)),
    [allDirs, selected],
  );

  const norm = useMemo(() => normalizePack(list), [list]);

  const chartData = useMemo(() => METRICS.map(m => {
    const row: Record<string, string | number> = { metric: m.label };
    for (const dir of visibleDirs) {
      const n = norm.get(dir);
      row[dir] = n ? Math.round(n[m.key]) : 0;
    }
    return row;
  }), [norm, visibleDirs]);

  const colorByDir = useMemo(() => {
    const map = new Map<string, string>();
    allDirs.forEach((d, i) => map.set(d, DIR_PALETTE[i % DIR_PALETTE.length]));
    return map;
  }, [allDirs]);

  const toggle = (dir: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(dir)) {
        if (next.size <= 1) return next;
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allDirs));
  const keepOne = () => {
    if (allDirs[0]) setSelected(new Set([allDirs[0]]));
  };

  if (list.length === 0) {
    return (
      <DashCard title="Сравнение направлений">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет направлений для сравнения в текущем срезе.
        </p>
      </DashCard>
    );
  }

  const chartHeight = Math.max(520, Math.min(720, 420 + visibleDirs.length * 12));

  return (
    <DashCard title="Сравнение направлений">
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10, lineHeight: 1.45 }}>
        5 показателей, нормировано 0–100. Снимите галочку, чтобы убрать направление с графика.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Направления</span>
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={selectAll}>Все</button>
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={keepOne}>Сбросить</button>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          выбрано {visibleDirs.length} из {allDirs.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {allDirs.map(dir => {
          const on = selected.has(dir);
          const color = colorByDir.get(dir) || '#64748b';
          return (
            <label
              key={dir}
              className="adm-forum-check"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 8,
                border: `1px solid ${on ? color : '#e5e5ea'}`,
                background: on ? `${color}14` : '#fafafa',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(dir)}
                style={{ accentColor: color }}
              />
              <span style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: color,
                flexShrink: 0,
              }}
              />
              {dir}
            </label>
          );
        })}
      </div>

      <div style={{ width: '100%', minHeight: chartHeight }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="78%">
            <PolarGrid stroke="#e5e5ea" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 13, fill: '#374151' }} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
            />
            <Tooltip content={<RadarTooltip />} />
            {visibleDirs.map(dir => {
              const color = colorByDir.get(dir) || '#64748b';
              return (
                <Radar
                  key={dir}
                  name={dir}
                  dataKey={dir}
                  stroke={color}
                  fill={color}
                  fillOpacity={Math.max(0.06, 0.22 / Math.max(1, visibleDirs.length * 0.35))}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              );
            })}
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </DashCard>
  );
}
