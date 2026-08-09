import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashCard } from '../analytics/dashboardUi';
import {
  PHASE_LABELS,
  ZONE_COLORS,
  ZONE_ORDER,
  formatZoneName,
} from '../analytics/chartRu';
import type { DirectionPhaseRow } from './DirectionZonePhaseTable';

type PhaseFilter = 'all' | 'morning' | 'day' | 'evening';

type DirectionZones = {
  direction: string;
  zones: Record<string, number>;
};

/** Палитра как на макете пульса: риск→подъём слева направо. */
const STACK_COLORS: Record<string, string> = {
  risk: '#C53030',
  fatigue: '#DD6B20',
  neutral: '#C6B49A',
  engagement: '#68D391',
  lift: '#276749',
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
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
        <div key={String(p.dataKey)} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(Number(p.value) || 0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 100% stacked bars: эмоциональный пульс по всем направлениям на одном графике.
 * Данные — emotionalPulse.byDirection (+ byDirectionPhase для утро/день/вечер).
 */
export function DirectionEmotionPulseChart({
  byDirection,
  byDirectionPhase,
  onOpenDirection,
}: {
  byDirection?: DirectionZones[] | null;
  byDirectionPhase?: DirectionPhaseRow[] | null;
  onOpenDirection?: (direction: string) => void;
}) {
  const [phase, setPhase] = useState<PhaseFilter>('all');

  const chartData = useMemo(() => {
    if (phase === 'all') {
      return [...(byDirection ?? [])]
        .map(row => {
          const out: Record<string, string | number> = { direction: row.direction };
          let sum = 0;
          for (const key of ZONE_ORDER) {
            const v = Number(row.zones?.[key] ?? 0);
            out[key] = v;
            sum += v;
          }
          out._sum = sum;
          return out;
        })
        .filter(r => Number(r._sum) > 0)
        .sort((a, b) => String(a.direction).localeCompare(String(b.direction), 'ru'));
    }

    return [...(byDirectionPhase ?? [])]
      .map(row => {
        const zones = row.byPhase?.[phase]?.zones ?? {};
        const out: Record<string, string | number> = { direction: row.direction };
        let sum = 0;
        for (const key of ZONE_ORDER) {
          const v = Number(zones[key] ?? 0);
          out[key] = v;
          sum += v;
        }
        out._sum = sum;
        out._n = row.byPhase?.[phase]?.n ?? 0;
        return out;
      })
      .filter(r => Number(r._sum) > 0)
      .sort((a, b) => String(a.direction).localeCompare(String(b.direction), 'ru'));
  }, [byDirection, byDirectionPhase, phase]);

  const height = Math.max(220, chartData.length * 44 + 48);

  return (
    <DashCard title="Эмоциональный пульс по направлениям">
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
        Все направления на одном графике — доли 5 зон в проверках состояния (сумма ≈ 100%).
      </p>
      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {([
          ['all', 'Всего'],
          ['morning', PHASE_LABELS.morning],
          ['day', PHASE_LABELS.day],
          ['evening', PHASE_LABELS.evening],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={phase === key ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
            onClick={() => setPhase(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {chartData.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет ответов проверки состояния по направлениям в этом срезе.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 4, right: 16, top: 8, bottom: 4 }}
            barCategoryGap="18%"
          >
            <CartesianGrid stroke="#e5e5ea" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={v => String(v)}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#86868b' }}
            />
            <YAxis
              type="category"
              dataKey="direction"
              width={120}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#1d1d1f' }}
              onClick={(e: { value?: string }) => {
                if (e?.value && onOpenDirection) onOpenDirection(String(e.value));
              }}
              style={onOpenDirection ? { cursor: 'pointer' } : undefined}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              formatter={(value: string) => formatZoneName(value)}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            {ZONE_ORDER.map(key => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                stackId="zones"
                fill={STACK_COLORS[key] ?? ZONE_COLORS[key]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </DashCard>
  );
}
