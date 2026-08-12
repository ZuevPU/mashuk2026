import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashCard } from '../analytics/dashboardUi';

const STEPS = [
  { score: 1, key: 's1', short: '1 · Там же', color: '#FF3B30' },
  { score: 2, key: 's2', short: '2 · Понимание', color: '#FF9500' },
  { score: 3, key: 's3', short: '3 · Шаги', color: '#FFCC00' },
  { score: 4, key: 's4', short: '4 · Результаты', color: '#34C759' },
  { score: 5, key: 's5', short: '5 · Ближе к цели', color: '#007AFF' },
] as const;

export type GoalProgressDirRow = {
  direction: string;
  answered: number;
  avg: number | null;
  dist: { score: number; count: number; pct: number }[];
};

export type GoalProgressByDirectionData = {
  key?: string;
  label?: string;
  answered?: number;
  avg?: number | null;
  byDirection?: GoalProgressDirRow[];
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: {
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string;
    payload?: { answered?: number; avg?: number; unit?: 'pct' | 'count' };
  }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const answered = Number(payload[0]?.payload?.answered ?? 0);
  const avg = payload[0]?.payload?.avg;
  const unit = payload[0]?.payload?.unit ?? 'pct';
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e5ea',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,.08)',
      minWidth: 180,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {avg != null && (
        <div className="adm-muted" style={{ marginBottom: 6, fontSize: 11 }}>
          средняя {avg} · n={answered}
        </div>
      )}
      {payload.map(p => (
        <div key={String(p.dataKey)} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
            {unit === 'pct' ? `${p.value}%` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Итоги дня: «Где ты сейчас находишься в движении к своей цели» — все направления.
 */
export function GoalProgressByDirectionChart({
  data,
  onOpenDirection,
}: {
  data: GoalProgressByDirectionData | null | undefined;
  onOpenDirection?: (direction: string) => void;
}) {
  const [unit, setUnit] = useState<'pct' | 'count'>('pct');
  const rows = data?.byDirection ?? [];

  const chartData = useMemo(() => rows.map(row => {
    const out: Record<string, string | number> = {
      direction: row.direction,
      answered: row.answered,
      avg: row.avg ?? 0,
      unit,
    };
    for (const step of STEPS) {
      const cell = row.dist.find(d => d.score === step.score);
      out[step.key] = unit === 'pct' ? (cell?.pct ?? 0) : (cell?.count ?? 0);
    }
    return out;
  }), [rows, unit]);

  if (!data || !rows.length) return null;

  const height = Math.max(240, rows.length * 44 + 56);
  const title = 'Движение к цели · по направлениям';

  return (
    <DashCard title={title}>
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
        {data.label || 'Где ты сейчас находишься в движении к своей цели'}
        {data.avg != null ? ` · средняя ${data.avg} из 5` : ''}
        {data.answered != null ? ` · ${data.answered} отв.` : ''}
      </p>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}
      >
        <p className="adm-muted" style={{ fontSize: 11, margin: 0, flex: '1 1 240px' }}>
          1 — там же · 2 — понимание · 3 — первые шаги · 4 — результаты · 5 — существенно ближе к цели
        </p>
        <div className="adm-forum-seg" role="group" aria-label="Единицы на графике">
          <button
            type="button"
            className={unit === 'count' ? 'on' : ''}
            aria-pressed={unit === 'count'}
            onClick={() => setUnit('count')}
          >
            Числа
          </button>
          <button
            type="button"
            className={unit === 'pct' ? 'on' : ''}
            aria-pressed={unit === 'pct'}
            onClick={() => setUnit('pct')}
          >
            %
          </button>
        </div>
      </div>
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
            domain={unit === 'pct' ? [0, 100] : [0, 'auto']}
            ticks={unit === 'pct' ? [0, 25, 50, 75, 100] : undefined}
            tickFormatter={v => unit === 'pct' ? `${v}` : String(v)}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#86868b' }}
            allowDecimals={false}
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
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {STEPS.map(step => (
            <Bar
              key={step.key}
              dataKey={step.key}
              name={step.short}
              stackId="goal"
              fill={step.color}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <table className="adm-table" style={{ marginTop: 12, fontSize: 12 }}>
        <thead>
          <tr>
            <th>Направление</th>
            <th>Средняя</th>
            <th>Ответов</th>
            <th>4–5</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const high = row.dist
              .filter(d => d.score >= 4)
              .reduce((s, d) => s + d.pct, 0);
            return (
              <tr key={row.direction}>
                <td>
                  {onOpenDirection ? (
                    <button type="button" className="adm-link" onClick={() => onOpenDirection(row.direction)}>
                      {row.direction}
                    </button>
                  ) : row.direction}
                </td>
                <td><strong>{row.avg ?? '—'}</strong></td>
                <td>{row.answered}</td>
                <td>{Math.round(high * 10) / 10}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DashCard>
  );
}
