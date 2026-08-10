import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltipRu, EMOTION_COLORS, EMOTION_ORDER, formatForumDay } from './chartRu';
import { OrientableBarChart } from './orientableBars';

type PathStep = {
  key: string;
  label: string;
  responses: number;
  uniqueParticipants: number;
  energy: { avg: number | null; median: number | null; count: number };
  modeEmotion: string | null;
  modeZone: string | null;
  riskFatiguePct: number | null;
  emotions?: { id: string; label: string; count: number; pct: number }[];
};

type EmotionSeriesRow = {
  emotion: string;
  label: string;
  morningPct: number;
  dayPct: number;
  eveningPct: number;
  morningCount: number;
  dayCount: number;
  eveningCount: number;
};

type DayPhasePoint = {
  day: number;
  morningPct: number | null;
  dayPct: number | null;
  eveningPct: number | null;
  morningCount: number;
  dayCount: number;
  eveningCount: number;
};

type EmotionDynamics = {
  days?: number[];
  emotions?: { id: string; label: string; byDay: DayPhasePoint[] }[];
};

type EnergyDynamics = {
  days?: number[];
  byDay?: {
    day: number;
    morningAvg: number | null;
    dayAvg: number | null;
    eveningAvg: number | null;
    morningCount: number;
    dayCount: number;
    eveningCount: number;
  }[];
};

type PathData = {
  steps?: PathStep[];
  emotionSeries?: EmotionSeriesRow[];
  energySeries?: { step: string; label: string; avg: number | null; median: number | null; n: number }[];
  note?: string;
  dayFilter?: number | null;
};

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
  return EMOTION_COLORS[id] ?? '#64748b';
}

export function ParticipantPathPanel({
  data,
  emotionDynamics,
  energyDynamics,
}: {
  data: PathData | null | undefined;
  emotionDynamics?: EmotionDynamics | null;
  energyDynamics?: EnergyDynamics | null;
}) {
  const [mode, setMode] = useState<'table' | 'chart'>('chart');
  const [emotionsOpen, setEmotionsOpen] = useState(false);

  const steps = data?.steps ?? [];
  const emotionSeries = data?.emotionSeries ?? [];
  const hasAny = steps.some(s => s.responses > 0)
    || (energyDynamics?.byDay ?? []).some(d => d.morningCount + d.dayCount + d.eveningCount > 0);

  /** Energy: prefer multi-day dynamics, else path energySeries/steps */
  const energyTimeline = useMemo(() => {
    const byDay = energyDynamics?.byDay ?? [];
    if (byDay.length) {
      const rows: { label: string; avg: number | null; median: number | null; n: number }[] = [];
      for (const d of byDay) {
        rows.push(
          { label: `${formatForumDay(d.day)} · Утро`, avg: d.morningAvg, median: null, n: d.morningCount },
          { label: `${formatForumDay(d.day)} · День`, avg: d.dayAvg, median: null, n: d.dayCount },
          { label: `${formatForumDay(d.day)} · Вечер`, avg: d.eveningAvg, median: null, n: d.eveningCount },
        );
      }
      return rows;
    }
    return (data?.energySeries ?? steps).map(s => ({
      label: 'label' in s ? s.label : (s as PathStep).label,
      avg: 'avg' in s ? (s.avg as number | null) : (s as PathStep).energy?.avg,
      median: 'median' in s ? (s.median as number | null) : (s as PathStep).energy?.median,
      n: 'n' in s ? (s.n as number) : (s as PathStep).energy?.count ?? 0,
    }));
  }, [energyDynamics, data?.energySeries, steps]);

  /** Emotions continuous path across all days × phases */
  const emotionTimeline = useMemo(() => {
    const days = emotionDynamics?.days?.length
      ? emotionDynamics.days
      : (energyDynamics?.days?.length
        ? energyDynamics.days
        : Array.from({ length: 8 }, (_, i) => i + 1));
    const emos = emotionDynamics?.emotions?.length
      ? emotionDynamics.emotions
      : EMOTION_ORDER.map(id => ({
        id,
        label: emotionSeries.find(e => e.emotion === id)?.label ?? id,
        byDay: [] as DayPhasePoint[],
      }));

    if (emotionDynamics?.emotions?.length) {
      const rows: Record<string, string | number | null>[] = [];
      for (const day of days) {
        for (const phase of [
          { label: 'Утро', pct: (d: DayPhasePoint) => d.morningPct },
          { label: 'День', pct: (d: DayPhasePoint) => d.dayPct },
          { label: 'Вечер', pct: (d: DayPhasePoint) => d.eveningPct },
        ]) {
          const row: Record<string, string | number | null> = {
            label: `${formatForumDay(day)} · ${phase.label}`,
          };
          for (const emo of emos) {
            const hit = emo.byDay.find(d => d.day === day);
            row[emo.id] = hit ? phase.pct(hit) : null;
          }
          rows.push(row);
        }
      }
      return { rows, emotions: emos.map(e => ({ id: e.id, label: e.label })) };
    }

    // Fallback: only 3 phase points from compact emotionSeries
    const labels = ['Утро', 'День', 'Вечер'] as const;
    const keys = ['morningPct', 'dayPct', 'eveningPct'] as const;
    const rows = labels.map((label, i) => {
      const row: Record<string, string | number | null> = { label };
      for (const e of emotionSeries) row[e.emotion] = e[keys[i]];
      return row;
    });
    return {
      rows,
      emotions: emotionSeries.map(e => ({ id: e.emotion, label: e.label })),
    };
  }, [emotionDynamics, energyDynamics?.days, emotionSeries]);

  const emotionBarRows = useMemo(() => (
    emotionSeries.map(e => ({
      name: e.label,
      morning: e.morningPct,
      day: e.dayPct,
      evening: e.eveningPct,
    }))
  ), [emotionSeries]);

  if (!hasAny) {
    return (
      <div className="adm-dash-card" style={{ marginTop: 16 }}>
        <div className="adm-dash-card-title">Путь участника</div>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет ответов проверки состояния по шагам утро → день → вечер.
        </p>
      </div>
    );
  }

  const isShiftPath = steps.length > 3 || (energyDynamics?.byDay?.length ?? 0) > 0;

  return (
    <div className="adm-dash-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="adm-dash-card-title" style={{ margin: 0 }}>
            Путь участника
            <MethodHint text={data?.note ?? 'Средние эмоция и энергия по проверкам состояния утро → день → вечер за всю смену.'} />
          </div>
          <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            {isShiftPath
              ? 'Вся смена: День N · Утро → День → Вечер, затем следующий день'
              : 'Утро → день → вечер · эмоция и энергия только из проверок состояния'}
            {data?.dayFilter != null && !isShiftPath ? ` · D${data.dayFilter}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => setMode(m => (m === 'table' ? 'chart' : 'table'))}
        >
          {mode === 'table' ? 'Показать графики' : 'Показать таблицу'}
        </button>
      </div>

      {mode === 'table' ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Шаг</th>
                  <th>Ответов</th>
                  <th>Участников</th>
                  <th>Ср. энергия</th>
                  <th>Медиана</th>
                  <th>Мода эмоции</th>
                  <th>Зона</th>
                  <th>Риск+усталость</th>
                </tr>
              </thead>
              <tbody>
                {steps.map(s => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td>{s.responses}</td>
                    <td>{s.uniqueParticipants}</td>
                    <td>{s.energy.avg != null ? `${s.energy.avg} · N=${s.energy.count}` : '—'}</td>
                    <td>{s.energy.median ?? '—'}</td>
                    <td>{s.modeEmotion ?? '—'}</td>
                    <td>{s.modeZone ?? '—'}</td>
                    <td>{s.riskFatiguePct != null ? `${s.riskFatiguePct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="adm-btn adm-btn-ghost adm-btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setEmotionsOpen(o => !o)}
          >
            {emotionsOpen ? 'Скрыть эмоции по шагам' : 'Эмоции × фазы (сводка)'}
          </button>

          {emotionsOpen ? (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table className="adm-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Эмоция</th>
                    <th>Утро %</th>
                    <th>День %</th>
                    <th>Вечер %</th>
                    <th>N утро</th>
                    <th>N день</th>
                    <th>N вечер</th>
                  </tr>
                </thead>
                <tbody>
                  {emotionSeries.map(e => (
                    <tr key={e.emotion}>
                      <td>{e.label}</td>
                      <td>{e.morningPct}</td>
                      <td>{e.dayPct}</td>
                      <td>{e.eveningPct}</td>
                      <td>{e.morningCount}</td>
                      <td>{e.dayCount}</td>
                      <td>{e.eveningCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ marginTop: 14 }} className="adm-dash-stack">
          <div className="adm-chart-frame">
            <div className="adm-dash-card-title">Средняя энергия по пути · вся смена</div>
            <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              День 1 · Утро → День → Вечер → День 2 · Утро → …
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={energyTimeline} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: '#86868b' }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#86868b' }} width={32} />
                <Tooltip content={<ChartTooltipRu />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="avg" name="Средняя энергия" stroke="#1F3A5F" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                {energyTimeline.some(r => r.median != null) ? (
                  <Line type="monotone" dataKey="median" name="Медиана" stroke="#86868b" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} connectNulls />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="adm-chart-frame">
            <div className="adm-dash-card-title">Динамика эмоций · утро / день / вечер за все дни (%)</div>
            <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Непрерывный путь смены: доля каждой эмоции в фазе
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={emotionTimeline.rows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
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
                {emotionTimeline.emotions.map(e => (
                  <Line
                    key={e.id}
                    type="monotone"
                    dataKey={e.id}
                    name={e.label}
                    stroke={emotionColor(e.id)}
                    strokeWidth={1.5}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="adm-dash-card-title">Доля каждой эмоции по фазам · сводка за смену (%)</div>
            <OrientableBarChart
              data={emotionBarRows}
              categoryKey="name"
              series={[
                { dataKey: 'morning', name: 'Утро', fill: '#94a3b8' },
                { dataKey: 'day', name: 'День', fill: '#1F3A5F' },
                { dataKey: 'evening', name: 'Вечер', fill: '#0A7B6F' },
              ]}
              height={Math.max(260, emotionBarRows.length * 32)}
              yAxisWidth={120}
              showLegend
            />
          </div>
        </div>
      )}
    </div>
  );
}
