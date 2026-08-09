import { useMemo } from 'react';
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

type PhaseKey = 'morning' | 'day' | 'evening';

const PHASES: PhaseKey[] = ['morning', 'day', 'evening'];

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
          <span>{formatZoneName(String(p.dataKey))}</span>
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(Number(p.value) || 0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 100% stacked columns: зоны эмоций утро / день / вечер.
 * Данные — emotionalPulse.byPhase из pulse/hub.
 */
export function PhaseEmotionPulseChart({
  byPhase,
}: {
  byPhase?: Partial<Record<PhaseKey, Record<string, number>>> | null;
}) {
  const chartData = useMemo(() => {
    return PHASES.map(phase => {
      const zones = byPhase?.[phase] ?? {};
      const row: Record<string, string | number> = {
        phase,
        label: PHASE_LABELS[phase] ?? phase,
      };
      let sum = 0;
      for (const key of ZONE_ORDER) {
        const v = Number(zones[key] ?? 0);
        row[key] = v;
        sum += v;
      }
      row._sum = sum;
      return row;
    });
  }, [byPhase]);

  const hasData = chartData.some(r => Number(r._sum) > 0);

  /** Медиана доли зоны по трём фазам — для подсказки внизу. */
  const medianNote = useMemo(() => {
    if (!hasData) return null;
    const liftVals = chartData.map(r => Number(r.lift) || 0).sort((a, b) => a - b);
    const riskVals = chartData.map(r => Number(r.risk) || 0).sort((a, b) => a - b);
    const mid = (arr: number[]) => arr[Math.floor(arr.length / 2)] ?? 0;
    return `Медиана по фазам: подъём ${Math.round(mid(liftVals))}%, риск ${Math.round(mid(riskVals))}%.`;
  }, [chartData, hasData]);

  return (
    <DashCard title="Состояние по времени дня">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          Утро · день · вечер, в сравнении с медианой
        </p>
      </div>
      {!hasData ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет ответов проверки состояния по фазам дня.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke="#e5e5ea" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#1d1d1f' }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                tickFormatter={v => `${v}%`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#86868b' }}
                width={44}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value: string) => formatZoneName(value)}
                wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              />
              {ZONE_ORDER.map(key => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key}
                  stackId="phase"
                  fill={STACK_COLORS[key] ?? ZONE_COLORS[key]}
                  isAnimationActive={false}
                  maxBarSize={72}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {medianNote && (
            <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 0', fontStyle: 'italic' }}>
              {medianNote}
            </p>
          )}
        </>
      )}
    </DashCard>
  );
}
