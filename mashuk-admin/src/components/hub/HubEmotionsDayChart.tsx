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
import { hubDirections } from './hubQuery';

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

type PhaseEmotions = {
  zones?: Record<string, number>;
  emotions?: Record<string, number>;
  n?: number;
};

type DirectionPhaseRow = {
  direction: string;
  byPhase: {
    morning?: PhaseEmotions;
    day?: PhaseEmotions;
    evening?: PhaseEmotions;
  };
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

function emotionLabel(id: string, fallback?: string): string {
  return fallback || EMOTION_LABELS[id] || id;
}

/** Серия утро→день→вечер из byDirectionPhase для одного направления. */
function seriesFromDirectionPhase(row: DirectionPhaseRow | undefined): EmotionSeriesRow[] {
  if (!row) return [];
  const ids = new Set<string>([...EMOTION_ORDER]);
  for (const phase of PHASES) {
    for (const id of Object.keys(row.byPhase[phase.key]?.emotions ?? {})) ids.add(id);
  }
  return [...ids].map(id => {
    const morningN = row.byPhase.morning?.n ?? 0;
    const dayN = row.byPhase.day?.n ?? 0;
    const eveningN = row.byPhase.evening?.n ?? 0;
    const morningPct = row.byPhase.morning?.emotions?.[id] ?? 0;
    const dayPct = row.byPhase.day?.emotions?.[id] ?? 0;
    const eveningPct = row.byPhase.evening?.emotions?.[id] ?? 0;
    return {
      emotion: id,
      label: emotionLabel(id),
      morningPct,
      dayPct,
      eveningPct,
      morningCount: Math.round((morningPct / 100) * morningN),
      dayCount: Math.round((dayPct / 100) * dayN),
      eveningCount: Math.round((eveningPct / 100) * eveningN),
    };
  });
}

/** Среднее по фазам для одного направления (бары). */
function avgFromDirectionPhase(row: DirectionPhaseRow | undefined): EmotionAvg[] {
  if (!row) return [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const phase of PHASES) {
    const bucket = row.byPhase[phase.key];
    const n = bucket?.n ?? 0;
    total += n;
    for (const [id, pct] of Object.entries(bucket?.emotions ?? {})) {
      counts.set(id, (counts.get(id) || 0) + Math.round((pct / 100) * n));
    }
  }
  if (!total) return [];
  return EMOTION_ORDER
    .map(id => {
      const count = counts.get(id) || 0;
      return {
        id,
        label: emotionLabel(id),
        count,
        pct: Math.round((count / total) * 1000) / 10,
      };
    })
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Штаб · Форум: 11 эмоций — линия «в течение дня» / среднее за день,
 * плюс плашка «среднее за форум» и фильтр направления (по умолчанию все).
 */
export function HubEmotionsDayChart({
  emotions,
  emotionSeries,
  emotionsForum,
  byDirectionPhase,
  byDirectionPhaseForum,
  directions,
}: {
  emotions?: EmotionAvg[] | null;
  emotionSeries?: EmotionSeriesRow[] | null;
  emotionsForum?: EmotionAvg[] | null;
  byDirectionPhase?: DirectionPhaseRow[] | null;
  byDirectionPhaseForum?: DirectionPhaseRow[] | null;
  directions?: string[] | null;
}) {
  const [mode, setMode] = useState<ViewMode>('timeline');
  const [directionFilter, setDirectionFilter] = useState('');

  const directionOptions = useMemo(() => {
    const fromMeta = hubDirections(directions);
    if (fromMeta.length) return fromMeta;
    const fromRows = hubDirections((byDirectionPhase ?? []).map(r => r.direction));
    return fromRows;
  }, [directions, byDirectionPhase]);

  const dayDirectionRow = useMemo(
    () => (byDirectionPhase ?? []).find(r => r.direction === directionFilter),
    [byDirectionPhase, directionFilter],
  );
  const forumDirectionRow = useMemo(
    () => (byDirectionPhaseForum ?? byDirectionPhase ?? [])
      .find(r => r.direction === directionFilter),
    [byDirectionPhaseForum, byDirectionPhase, directionFilter],
  );

  const series = useMemo(() => {
    if (directionFilter) {
      const fromDir = seriesFromDirectionPhase(dayDirectionRow);
      if (fromDir.length) return fromDir;
    }
    if (emotionSeries?.length) return emotionSeries;
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
  }, [directionFilter, dayDirectionRow, emotionSeries, emotions]);

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

  const avgItems = useMemo(() => {
    if (directionFilter) return avgFromDirectionPhase(dayDirectionRow);
    return (emotions ?? []).filter(e => e.count > 0);
  }, [directionFilter, dayDirectionRow, emotions]);

  const forumAvgItems = useMemo(() => {
    if (directionFilter) return avgFromDirectionPhase(forumDirectionRow);
    return (emotionsForum ?? emotions ?? []).filter(e => e.count > 0);
  }, [directionFilter, forumDirectionRow, emotionsForum, emotions]);

  const renderDirectionSelect = () => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span className="adm-muted">Направление</span>
      <select
        className="adm-input"
        value={directionFilter}
        onChange={e => setDirectionFilter(e.target.value)}
        style={{ minWidth: 180, fontSize: 12, padding: '4px 8px' }}
      >
        <option value="">Все направления</option>
        {directionOptions.map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </label>
  );

  if (!hasTimeline && !avgItems.length && !forumAvgItems.length) {
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
    <>
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
          <p className="adm-muted" style={{ fontSize: 12, margin: 0, flex: '1 1 220px' }}>
            {mode === 'timeline'
              ? 'Доля каждой эмоции среди ответов утро → день → вечер (видно, как меняется настроение).'
              : 'Средняя доля эмоций за выбранный день (все фазы вместе).'}
          </p>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {renderDirectionSelect()}
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

      <DashCard title="11 эмоций · среднее за форум">
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
        >
          <p className="adm-muted" style={{ fontSize: 12, margin: 0, flex: '1 1 220px' }}>
            Средняя доля эмоций за весь форум (дни 1…текущий), все фазы вместе.
          </p>
          {renderDirectionSelect()}
        </div>
        {forumAvgItems.length ? (
          <SrcBars items={forumAvgItems.map(d => ({
            label: `${d.label} (${d.pct}%) · ${d.count}`,
            count: d.count,
          }))}
          />
        ) : (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет данных за форум.</p>
        )}
      </DashCard>
    </>
  );
}
