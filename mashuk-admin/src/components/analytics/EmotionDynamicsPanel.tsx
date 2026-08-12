import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ChartTooltipRu, EMOTION_COLORS, EMOTION_LABELS, EMOTION_ORDER, formatForumDay,
} from './chartRu';
import { OrientableBarChart } from './orientableBars';

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

type DayPhasePoint = {
  day: number;
  morningPct: number | null;
  dayPct: number | null;
  eveningPct: number | null;
  morningCount: number;
  dayCount: number;
  eveningCount: number;
  morningTotal?: number;
  dayTotal?: number;
  eveningTotal?: number;
};

type EmotionDynamics = {
  days?: number[];
  emotions?: {
    id: string;
    label: string;
    byDay: DayPhasePoint[];
  }[];
  note?: string;
};

const PHASE_COLORS = {
  morning: '#94a3b8',
  day: '#1F3A5F',
  evening: '#0A7B6F',
} as const;

function MethodHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, marginLeft: 6, borderRadius: '50%',
        fontSize: 10, fontWeight: 700, color: '#86868b', border: '1px solid #d2d2d7',
        cursor: 'help', verticalAlign: 'middle',
      }}
    >
      i
    </span>
  );
}

function emotionColor(id: string): string {
  return EMOTION_COLORS[id] ?? '#3182CE';
}

function avgPhasePct(d: DayPhasePoint): number | null {
  const vals = [d.morningPct, d.dayPct, d.eveningPct].filter((v): v is number => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10;
}

export function EmotionDynamicsPanel({
  intraDay,
  dynamics,
}: {
  /** Сверка утро / день / вечер (агрегат) */
  intraDay?: EmotionSeriesRow[] | null;
  dynamics?: EmotionDynamics | null;
  /** @deprecated multi-select replaces single default */
  defaultEmotion?: string | null;
}) {
  const emotionOptions = useMemo(() => {
    const fromDynamics = (dynamics?.emotions ?? []).map(e => ({ id: e.id, label: e.label }));
    if (fromDynamics.length) return fromDynamics;
    return EMOTION_ORDER.map(id => ({ id, label: EMOTION_LABELS[id] ?? id }));
  }, [dynamics?.emotions]);

  const optionsKey = emotionOptions.map(o => o.id).join(',');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(emotionOptions.map(o => o.id)),
  );

  useEffect(() => {
    setSelected(new Set(emotionOptions.map(o => o.id)));
    // Reset selection when the emotion catalog from API changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionsKey tracks catalog identity
  }, [optionsKey]);

  const selectedList = emotionOptions.filter(o => selected.has(o.id));

  const toggleEmotion = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(emotionOptions.map(o => o.id)));
  const clearAll = () => setSelected(new Set());

  const days = useMemo(() => {
    if (dynamics?.days?.length) return dynamics.days;
    return Array.from({ length: 8 }, (_, i) => i + 1);
  }, [dynamics?.days]);

  /** X = dayLabel; one key per emotion = mean of phases that day */
  const dayTrendMulti = useMemo(() => {
    return days.map((day) => {
      const row: Record<string, string | number | null> = {
        dayLabel: formatForumDay(day),
      };
      for (const emo of emotionOptions) {
        const hit = (dynamics?.emotions ?? []).find(e => e.id === emo.id)?.byDay.find(d => d.day === day);
        row[emo.id] = hit ? avgPhasePct(hit) : null;
      }
      return row;
    });
  }, [days, dynamics?.emotions, emotionOptions]);

  /** Continuous path: one point per day×phase, keys = emotion ids */
  const timelineMulti = useMemo(() => {
    const rows: Record<string, string | number | null>[] = [];
    for (const day of days) {
      for (const phase of [
        { key: 'morning' as const, label: 'Утро', pct: (d: DayPhasePoint) => d.morningPct },
        { key: 'day' as const, label: 'День', pct: (d: DayPhasePoint) => d.dayPct },
        { key: 'evening' as const, label: 'Вечер', pct: (d: DayPhasePoint) => d.eveningPct },
      ]) {
        const row: Record<string, string | number | null> = {
          label: `${formatForumDay(day)} · ${phase.label}`,
        };
        for (const emo of emotionOptions) {
          const hit = (dynamics?.emotions ?? []).find(e => e.id === emo.id)?.byDay.find(d => d.day === day);
          row[emo.id] = hit ? phase.pct(hit) : null;
        }
        rows.push(row);
      }
    }
    return rows;
  }, [days, dynamics?.emotions, emotionOptions]);

  const intraDayBars = useMemo(() => (
    (intraDay ?? []).map(e => ({
      name: e.label,
      morning: e.morningPct,
      day: e.dayPct,
      evening: e.eveningPct,
    }))
  ), [intraDay]);

  const hasIntra = intraDayBars.some(r => r.morning > 0 || r.day > 0 || r.evening > 0);
  const hasDynamics = (dynamics?.emotions ?? []).some(e =>
    e.byDay.some(d => (d.morningCount + d.dayCount + d.eveningCount) > 0),
  );

  if (!hasIntra && !hasDynamics) {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="adm-dash-card-title">Эмоции · утро / день / вечер</div>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет ответов проверки состояния по фазам дня.
        </p>
      </div>
    );
  }

  return (
    <div className="adm-stack" style={{ marginTop: 16, gap: 16 }}>
      {hasIntra ? (
        <div>
          <div className="adm-dash-card-title">
            Сверка внутри дня · утро / день / вечер
            <MethodHint text="Доля каждой эмоции среди ответов проверки состояния на шаге (утро, день, вечер)." />
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
            Сравниваем, как распределяются эмоции в течение дня.
          </p>
          <OrientableBarChart
            data={intraDayBars}
            categoryKey="name"
            series={[
              { dataKey: 'morning', name: 'Утро', fill: PHASE_COLORS.morning },
              { dataKey: 'day', name: 'День', fill: PHASE_COLORS.day },
              { dataKey: 'evening', name: 'Вечер', fill: PHASE_COLORS.evening },
            ]}
            height={Math.max(260, intraDayBars.length * 32)}
            yAxisWidth={120}
            showLegend
          />
        </div>
      ) : null}

      {hasDynamics ? (
        <div>
          <div className="adm-dash-card-title" style={{ margin: 0 }}>
            Динамика эмоций по смене
            <MethodHint text={dynamics?.note ?? 'Доля эмоций в ответах утро / день / вечер за каждый день смены.'} />
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
            Отметьте эмоции — линии появляются на обоих графиках. Снимите галочку, чтобы убрать серию.
          </p>

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            marginBottom: 8,
          }}
          >
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={selectAll}>
              Выбрать все
            </button>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={clearAll}>
              Снять все
            </button>
            <span className="adm-muted" style={{ fontSize: 12 }}>
              Выбрано: {selectedList.length} / {emotionOptions.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {emotionOptions.map((o) => {
              const on = selected.has(o.id);
              return (
                <label
                  key={o.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: `1px solid ${on ? emotionColor(o.id) : '#d2d2d7'}`,
                    background: on ? `${emotionColor(o.id)}18` : '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleEmotion(o.id)}
                  />
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: emotionColor(o.id), display: 'inline-block',
                  }}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>

          {selectedList.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 13 }}>Выберите хотя бы одну эмоцию.</p>
          ) : (
            <>
              <div className="adm-chart-frame" style={{ marginTop: 4 }}>
                <div className="adm-dash-card-title">Эмоции · среднее за день (%)</div>
                <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                  По дням: среднее из фаз утро / день / вечер, где есть ответы
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dayTrendMulti} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#86868b' }} />
                    <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#86868b' }} width={36} unit="%" />
                    <Tooltip content={<ChartTooltipRu />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedList.map(o => (
                      <Line
                        key={o.id}
                        type="monotone"
                        dataKey={o.id}
                        name={o.label}
                        stroke={emotionColor(o.id)}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="adm-chart-frame" style={{ marginTop: 12 }}>
                <div className="adm-dash-card-title">Эмоции · непрерывный путь по смене (%)</div>
                <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                  Вся смена подряд: День N · Утро → День → Вечер, затем следующий день
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timelineMulti} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: '#86868b' }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#86868b' }} width={36} unit="%" />
                    <Tooltip content={<ChartTooltipRu />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedList.map(o => (
                      <Line
                        key={o.id}
                        type="monotone"
                        dataKey={o.id}
                        name={o.label}
                        stroke={emotionColor(o.id)}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
