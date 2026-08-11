import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashCard } from '../analytics/dashboardUi';
import { DayResultsSection } from './dayResultsUi';

export type SeriesMetric = {
  key: string;
  name: string;
  inst: string;
  unit: string;
  up: boolean;
  data: Record<string, Record<string, number>>;
};

export function HubDirectionDynamics({
  instruments,
  series,
  dirs,
  dirColors,
  selectedDir,
}: {
  instruments: string[];
  series: SeriesMetric[];
  dirs: string[];
  dirColors: Record<string, string>;
  selectedDir: string | null;
}) {
  const [scope, setScope] = useState<'all' | 'dirs'>('dirs');
  const [inst, setInst] = useState(() => {
    const prefer = instruments.includes('Обмен опытом') ? 'Обмен опытом' : instruments[0];
    return prefer ?? 'Обмен опытом';
  });
  const metricsOf = useMemo(
    () => series.filter(s => s.inst === inst),
    [series, inst],
  );
  const [metricKey, setMetricKey] = useState(() => {
    const m = series.find(s => s.inst === 'Обмен опытом' && s.key === 'ex_ans')
      ?? series.find(s => s.inst === (instruments.includes('Обмен опытом') ? 'Обмен опытом' : instruments[0]));
    return m?.key ?? series[0]?.key ?? '';
  });
  const [dayMode, setDayMode] = useState<'trend' | string>('trend');
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(dirs.map(d => [d, true])),
  );

  const metric = series.find(s => s.key === metricKey) ?? metricsOf[0] ?? series[0];
  if (!metric) return null;

  const availableDays = Object.keys(metric.data.all || {})
    .map(Number)
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);

  const keys = scope === 'all' ? ['all'] : dirs.filter(d => on[d] !== false);

  const trendData = [1, 2, 3, 4, 5, 6, 7, 8].map(d => {
    const row: Record<string, number | string | null> = { day: `Д${d}` };
    for (const k of keys) {
      const v = metric.data[k]?.[String(d)];
      row[k] = v != null ? v : null;
    }
    return row;
  });

  const barData = dayMode !== 'trend'
    ? keys
      .map(k => ({
        key: k,
        name: k === 'all' ? 'Весь форум' : k,
        v: metric.data[k]?.[dayMode] as number | undefined,
        fill: k === 'all' ? '#e6ae4a' : (dirColors[k] || '#6f7d95'),
      }))
      .filter((r): r is typeof r & { v: number } => r.v != null)
      .sort((a, b) => (metric.up ? b.v - a.v : a.v - b.v))
    : [];

  return (
    <DayResultsSection
      title="Динамика по дням"
      note="Инструмент → показатель → день. «Тренд» строит линию по дням с данными; отдельный день — столбики по направлениям."
    >
      <DashCard>
        <div className="adm-dir-picker" style={{ marginTop: 0 }}>
          {([['all', 'Весь форум'], ['dirs', 'По направлениям']] as const).map(([v, n]) => (
            <button
              key={v}
              type="button"
              className={`adm-dir-chip ${scope === v ? 'is-on' : ''}`}
              onClick={() => setScope(v)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="adm-dir-picker">
          {instruments.map(i => (
            <button
              key={i}
              type="button"
              className={`adm-dir-chip ${inst === i ? 'is-on' : ''}`}
              onClick={() => {
                setInst(i);
                const first = series.find(s => s.inst === i);
                if (first) setMetricKey(first.key);
                setDayMode('trend');
              }}
            >
              {i}
              <span className="adm-dir-chip-c">{series.filter(s => s.inst === i).length}</span>
            </button>
          ))}
        </div>
        <div className="adm-dir-picker">
          {metricsOf.map(m => (
            <button
              key={m.key}
              type="button"
              className={`adm-dir-chip ${metric.key === m.key ? 'is-on' : ''}`}
              onClick={() => { setMetricKey(m.key); setDayMode('trend'); }}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="adm-dir-picker">
          <button
            type="button"
            className={`adm-dir-chip ${dayMode === 'trend' ? 'is-on' : ''}`}
            onClick={() => setDayMode('trend')}
          >
            Тренд Д1–Д8
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => {
            const has = availableDays.includes(i);
            return (
              <button
                key={i}
                type="button"
                className={`adm-dir-chip ${dayMode === String(i) ? 'is-on' : ''}`}
                style={has ? undefined : { opacity: 0.35, cursor: 'default' }}
                disabled={!has}
                onClick={() => has && setDayMode(String(i))}
              >
                Д{i}
              </button>
            );
          })}
        </div>
        {scope === 'dirs' && (
          <div className="adm-dir-picker">
            {dirs.map(d => (
              <button
                key={d}
                type="button"
                className="adm-dir-chip"
                style={{ opacity: on[d] !== false ? 1 : 0.45 }}
                onClick={() => setOn(prev => ({ ...prev, [d]: !(prev[d] !== false) }))}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: dirColors[d],
                    marginRight: 7,
                  }}
                />
                {d}
              </button>
            ))}
          </div>
        )}

        <div style={{ width: '100%', height: 300, marginTop: 8 }}>
          {dayMode === 'trend' ? (
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip />
                {keys.map(k => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k === 'all' ? 'Весь форум' : k}
                    stroke={k === 'all' ? '#e6ae4a' : (dirColors[k] || '#6f7d95')}
                    strokeWidth={k === selectedDir || k === 'all' ? 3 : 2}
                    dot={{ r: k === selectedDir || k === 'all' ? 4 : 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip />
                <Bar dataKey="v" name={metric.name} radius={[5, 5, 0, 0]}>
                  {barData.map(r => (
                    <Cell key={r.key} fill={r.fill} fillOpacity={r.key === selectedDir || r.key === 'all' ? 1 : 0.72} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <p
          className="adm-day-results-callout"
          style={{ borderLeftColor: metric.up ? '#57bd9c' : '#e2685e' }}
        >
          <b>{metric.name}</b>{metric.unit ? `, ${metric.unit}` : ''} — источник: {metric.inst}.{' '}
          {metric.up ? 'Больше — лучше.' : 'Меньше — лучше.'}
          {availableDays.length > 1
            ? ` Есть данные за ${availableDays.length} дн.`
            : availableDays.length === 1
              ? ` Пока есть выгрузка только за день ${availableDays[0]}.`
              : ' Пока нет точек для линии.'}
        </p>
      </DashCard>
    </DayResultsSection>
  );
}
