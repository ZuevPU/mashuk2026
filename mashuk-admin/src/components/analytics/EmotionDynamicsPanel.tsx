import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltipRu, EMOTION_LABELS, EMOTION_ORDER, formatForumDay } from './chartRu';
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

function defaultEmotionId(
  dynamics: EmotionDynamics | null | undefined,
  fallbackLabel?: string | null,
): string {
  if (fallbackLabel) {
    const byLabel = EMOTION_ORDER.find(
      id => EMOTION_LABELS[id]?.toLowerCase() === fallbackLabel.trim().toLowerCase(),
    );
    if (byLabel) return byLabel;
    const byId = EMOTION_ORDER.find(id => id === fallbackLabel);
    if (byId) return byId;
  }
  let best = EMOTION_ORDER[0] as string;
  let bestN = -1;
  for (const e of dynamics?.emotions ?? []) {
    const n = e.byDay.reduce(
      (s, d) => s + d.morningCount + d.dayCount + d.eveningCount,
      0,
    );
    if (n > bestN) {
      bestN = n;
      best = e.id;
    }
  }
  return best;
}

export function EmotionDynamicsPanel({
  intraDay,
  dynamics,
  defaultEmotion,
}: {
  /** Сверка утро / день / вечер (агрегат) */
  intraDay?: EmotionSeriesRow[] | null;
  dynamics?: EmotionDynamics | null;
  defaultEmotion?: string | null;
}) {
  const emotionOptions = useMemo(() => {
    const fromDynamics = (dynamics?.emotions ?? []).map(e => ({ id: e.id, label: e.label }));
    if (fromDynamics.length) return fromDynamics;
    return EMOTION_ORDER.map(id => ({ id, label: EMOTION_LABELS[id] ?? id }));
  }, [dynamics?.emotions]);

  const [emotionId, setEmotionId] = useState(
    () => defaultEmotionId(dynamics, defaultEmotion),
  );

  useEffect(() => {
    if (!emotionOptions.some(o => o.id === emotionId)) {
      setEmotionId(defaultEmotionId(dynamics, defaultEmotion));
    }
  }, [dynamics, defaultEmotion, emotionId, emotionOptions]);

  const selectedLabel = EMOTION_LABELS[emotionId]
    ?? emotionOptions.find(e => e.id === emotionId)?.label
    ?? emotionId;

  const intraDayBars = useMemo(() => (
    (intraDay ?? []).map(e => ({
      name: e.label,
      morning: e.morningPct,
      day: e.dayPct,
      evening: e.eveningPct,
    }))
  ), [intraDay]);

  const dayTrend = useMemo(() => {
    const byDay = (dynamics?.emotions ?? []).find(e => e.id === emotionId)?.byDay ?? [];
    const days = dynamics?.days?.length
      ? dynamics.days
      : Array.from({ length: 8 }, (_, i) => i + 1);
    return days.map(day => {
      const hit = byDay.find(d => d.day === day);
      return {
        dayLabel: formatForumDay(day),
        morning: hit?.morningPct ?? null,
        day: hit?.dayPct ?? null,
        evening: hit?.eveningPct ?? null,
        morningCount: hit?.morningCount ?? 0,
        dayCount: hit?.dayCount ?? 0,
        eveningCount: hit?.eveningCount ?? 0,
        morningTotal: hit?.morningTotal ?? 0,
        dayTotal: hit?.dayTotal ?? 0,
        eveningTotal: hit?.eveningTotal ?? 0,
      };
    });
  }, [dynamics, emotionId]);

  const timeline = useMemo(() => {
    const rows: {
      label: string;
      pct: number | null;
      count: number;
      total: number;
    }[] = [];
    for (const d of dayTrend) {
      rows.push(
        {
          label: `${d.dayLabel} · Утро`,
          pct: d.morning,
          count: d.morningCount,
          total: d.morningTotal,
        },
        {
          label: `${d.dayLabel} · День`,
          pct: d.day,
          count: d.dayCount,
          total: d.dayTotal,
        },
        {
          label: `${d.dayLabel} · Вечер`,
          pct: d.evening,
          count: d.eveningCount,
          total: d.eveningTotal,
        },
      );
    }
    return rows;
  }, [dayTrend]);

  const hasIntra = intraDayBars.some(r => r.morning > 0 || r.day > 0 || r.evening > 0);
  const hasDynamics = dayTrend.some(
    d => (d.morningCount + d.dayCount + d.eveningCount) > 0,
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
    <div className="adm-dash-stack" style={{ marginTop: 16, gap: 16 }}>
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
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12,
            alignItems: 'flex-end', justifyContent: 'space-between',
          }}
          >
            <div>
              <div className="adm-dash-card-title" style={{ margin: 0 }}>
                Динамика эмоции по дням
                <MethodHint text={dynamics?.note ?? 'Доля выбранной эмоции в ответах утро / день / вечер за каждый день смены.'} />
              </div>
              <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Выберите эмоцию — три линии: утро, день и вечер на днях 1–8
              </p>
            </div>
            <label className="adm-insights-filter">
              Эмоция
              <select
                className="adm-input"
                value={emotionId}
                onChange={e => setEmotionId(e.target.value)}
              >
                {emotionOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="adm-chart-frame" style={{ marginTop: 12 }}>
            <div className="adm-dash-card-title">{selectedLabel} · утро / день / вечер по дням (%)</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dayTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#86868b' }} />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#86868b' }} width={36} unit="%" />
                <Tooltip content={<ChartTooltipRu />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="morning" name="Утро" stroke={PHASE_COLORS.morning} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="day" name="День" stroke={PHASE_COLORS.day} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="evening" name="Вечер" stroke={PHASE_COLORS.evening} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="adm-chart-frame" style={{ marginTop: 12 }}>
            <div className="adm-dash-card-title">{selectedLabel} · непрерывный путь по смене (%)</div>
            <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Точки: День N · Утро → День → Вечер, затем следующий день
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={timeline} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
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
                <Line
                  type="monotone"
                  dataKey="pct"
                  name={selectedLabel}
                  stroke="#3182CE"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="adm-table-scroll" style={{ marginTop: 12 }}>
            <table className="adm-table adm-table-compact" style={{ width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th>День</th>
                  <th>Утро %</th>
                  <th>День %</th>
                  <th>Вечер %</th>
                  <th>N утро</th>
                  <th>N день</th>
                  <th>N вечер</th>
                </tr>
              </thead>
              <tbody>
                {dayTrend.map(r => (
                  <tr key={r.dayLabel}>
                    <td>{r.dayLabel}</td>
                    <td>{r.morning ?? '—'}</td>
                    <td>{r.day ?? '—'}</td>
                    <td>{r.evening ?? '—'}</td>
                    <td>{r.morningCount}</td>
                    <td>{r.dayCount}</td>
                    <td>{r.eveningCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
