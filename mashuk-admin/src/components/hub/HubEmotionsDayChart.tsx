import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashCard, SrcBars } from '../analytics/dashboardUi';
import {
  ChartTooltipRu,
  EMOTION_COLORS,
  EMOTION_LABELS,
  EMOTION_ORDER,
} from '../analytics/chartRu';

type EmotionAvg = {
  id?: string;
  label: string;
  count: number;
  pct: number;
};

type EmotionSeriesRow = {
  emotion: string;
  label: string;
  morningPct: number;
  dayPct: number;
  eveningPct: number;
  morningCount?: number;
  dayCount?: number;
  eveningCount?: number;
};

type ViewMode = 'timeline' | 'average';

const PHASES = [
  { key: 'morning' as const, label: 'Утро' },
  { key: 'day' as const, label: 'День' },
  { key: 'evening' as const, label: 'Вечер' },
];

function emotionColor(id: string): string {
  return EMOTION_COLORS[id] ?? '#3182CE';
}

/**
 * Штаб · Форум: 11 эмоций — линия «в течение дня» (утро→день→вечер)
 * или среднее за выбранный день (горизонтальные бары).
 */
export function HubEmotionsDayChart({
  emotions,
  emotionSeries,
}: {
  emotions?: EmotionAvg[] | null;
  emotionSeries?: EmotionSeriesRow[] | null;
}) {
  const [mode, setMode] = useState<ViewMode>('timeline');

  const series = useMemo(() => {
    if (emotionSeries?.length) return emotionSeries;
    // Fallback: только среднее — линии плоские.
    return (emotions ?? []).map(e => ({
      emotion: e.id || e.label,
      label: e.label,
      morningPct: e.pct,
      dayPct: e.pct,
      eveningPct: e.pct,
      morningCount: e.count,
      dayCount: e.count,
      eveningCount: e.count,
    }));
  }, [emotionSeries, emotions]);

  const activeEmotions = useMemo(() => {
    const ordered = EMOTION_ORDER.map(id => series.find(s => s.emotion === id)).filter(Boolean) as EmotionSeriesRow[];
    const rest = series.filter(s => !(EMOTION_ORDER as readonly string[]).includes(s.emotion));
    const all = [...ordered, ...rest];
    return all.filter(s =>
      (s.morningCount ?? 0) + (s.dayCount ?? 0) + (s.eveningCount ?? 0) > 0
      || s.morningPct > 0 || s.dayPct > 0 || s.eveningPct > 0,
    );
  }, [series]);

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const selectedIds = selected ?? new Set(activeEmotions.map(e => e.emotion));

  const timelineData = useMemo(() => PHASES.map(phase => {
    const row: Record<string, string | number> = { label: phase.label };
    for (const e of activeEmotions) {
      const pctKey = `${phase.key}Pct` as 'morningPct' | 'dayPct' | 'eveningPct';
      row[e.emotion] = e[pctKey] ?? 0;
    }
    return row;
  }), [activeEmotions]);

  const hasTimeline = activeEmotions.some(e =>
    e.morningPct > 0 || e.dayPct > 0 || e.eveningPct > 0,
  );
  const avgItems = (emotions ?? []).filter(e => e.count > 0);

  if (!hasTimeline && !avgItems.length) {
    return (
      <DashCard title="11 эмоций">
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет ответов проверки состояния с эмоциями.
        </p>
      </DashCard>
    );
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const base = prev ?? new Set(activeEmotions.map(e => e.emotion));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = activeEmotions.filter(e => selectedIds.has(e.emotion));

  return (
    <DashCard title="11 эмоций">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}
      >
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          {mode === 'timeline'
            ? 'Доля каждой эмоции среди ответов утро → день → вечер (видно, как меняется настроение).'
            : 'Средняя доля эмоций за выбранный день (все фазы вместе).'}
        </p>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button
            type="button"
            className={mode === 'timeline' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
            onClick={() => setMode('timeline')}
          >
            В течение дня
          </button>
          <button
            type="button"
            className={mode === 'average' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
            onClick={() => setMode('average')}
          >
            Среднее за день
          </button>
        </div>
      </div>

      {mode === 'average' ? (
        avgItems.length ? (
          <SrcBars items={avgItems.map(d => ({
            label: `${d.label} (${d.pct}%) · ${d.count}`,
            count: d.count,
          }))}
          />
        ) : (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет данных за день.</p>
        )
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {activeEmotions.map(e => {
              const on = selectedIds.has(e.emotion);
              const color = emotionColor(e.emotion);
              return (
                <label
                  key={e.emotion}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: `1px solid ${on ? color : '#d2d2d7'}`,
                    background: on ? `${color}18` : '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(e.emotion)}
                  />
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color, display: 'inline-block',
                  }}
                  />
                  {e.label || EMOTION_LABELS[e.emotion] || e.emotion}
                </label>
              );
            })}
          </div>
          {visible.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
              Выберите хотя бы одну эмоцию.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#86868b' }} />
                <YAxis
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11, fill: '#86868b' }}
                  width={36}
                  unit="%"
                />
                <Tooltip content={<ChartTooltipRu />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {visible.map(e => (
                  <Line
                    key={e.emotion}
                    type="monotone"
                    dataKey={e.emotion}
                    name={e.label || EMOTION_LABELS[e.emotion] || e.emotion}
                    stroke={emotionColor(e.emotion)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </DashCard>
  );
}
