import { useEffect, useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from './chartRu';
import { DashCard, DashKpi, DashGrid, dashVal } from './dashboardUi';
import { OrientableBarChart } from './orientableBars';

export type EveningScaleRow = {
  key?: string;
  label: string;
  avg: number;
  answered: number;
  max?: number;
  type?: string;
};

type ScaleByDay = {
  day: number;
  overallAvg: number | null;
  answered: number;
  byQuestion?: EveningScaleRow[];
};

type ScaleByDirectionDay = {
  direction: string;
  day: number;
  overallAvg: number | null;
  answered: number;
  byQuestion?: EveningScaleRow[];
};

/** Средние оценки по шкалам итоговой анкеты: вопросы + разрезы по дням и направлениям. */
export function EveningScaleAverages({
  rows,
  overallAvg,
  byDay,
  byDirectionDay,
  title = 'Средние оценки · итоги дня',
  compact = false,
}: {
  rows: EveningScaleRow[] | null | undefined;
  overallAvg?: number | null;
  byDay?: ScaleByDay[] | null;
  byDirectionDay?: ScaleByDirectionDay[] | null;
  title?: string;
  compact?: boolean;
}) {
  const { forumDay, meta } = useInsights();
  const list = (rows ?? []).filter(r => r.avg != null && Number.isFinite(r.avg));
  const dayRows = byDay ?? [];
  const dirDayRows = byDirectionDay ?? [];

  const dayOptions = useMemo(() => {
    if (dayRows.length) return dayRows.map(d => d.day);
    const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
    return Array.from({ length: Math.min(Math.max(1, cur), 7) }, (_, i) => i + 1);
  }, [dayRows, meta?.currentForumDay, forumDay]);

  const defaultDay = useMemo(() => {
    const selected = Number(forumDay);
    const withData = [...dayRows].reverse().find(d => d.answered > 0)?.day;
    if (dayOptions.includes(selected)) {
      const sel = dayRows.find(d => d.day === selected);
      if (sel && sel.answered > 0) return selected;
      if (withData != null) return withData;
      return selected;
    }
    return withData ?? dayOptions[dayOptions.length - 1] ?? 1;
  }, [dayOptions, dayRows, forumDay]);
  const [dirDay, setDirDay] = useState(defaultDay);
  useEffect(() => {
    setDirDay(defaultDay);
  }, [defaultDay]);

  const dayChart = useMemo(() => dayRows.map(r => ({
    dayLabel: formatForumDay(r.day),
    avg: r.overallAvg ?? 0,
    answered: r.answered,
  })), [dayRows]);

  const dirChart = useMemo(() => dirDayRows
    .filter(r => r.day === dirDay && r.overallAvg != null)
    .map(r => ({
      name: r.direction,
      avg: r.overallAvg as number,
      answered: r.answered,
    }))
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name, 'ru')), [dirDayRows, dirDay]);

  if (!list.length && !dayRows.some(d => d.answered > 0)) {
    return (
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет оценок по шкалам в сданных анкетах вечера.
        </p>
      </DashCard>
    );
  }

  const chartData = list.map(r => ({
    name: r.label.length > 42 ? `${r.label.slice(0, 40)}…` : r.label,
    avg: r.avg,
    answered: r.answered,
  }));

  const hasSeriesOnly = !list.length && dayRows.some(d => d.answered > 0);

  return (
    <div className="adm-dash-stack" style={{ gap: 12 }}>
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          Среднее по каждому вопросу со шкалой (обычно 1–5). Ниже — график, таблица и разрезы по дням / направлениям.
        </p>
        {hasSeriesOnly && (
          <p className="adm-muted" style={{ fontSize: 13, marginTop: 0 }}>
            За выбранный день сданных анкет пока нет. Ниже — сводка по дням смены (включая прошлые).
          </p>
        )}
        {!compact && (
          <DashGrid cols={3}>
            <DashKpi value={dashVal(overallAvg ?? null)} label="средняя по всем шкалам" accent="var(--m-accent)" />
            <DashKpi value={dashVal(list.length)} label="шкал с оценками" />
            <DashKpi
              value={dashVal(list.reduce((s, r) => s + (r.answered || 0), 0))}
              label="ответов на шкалы"
            />
          </DashGrid>
        )}
        {compact && overallAvg != null && (
          <p style={{ fontSize: 13, marginTop: 0 }}>
            Средняя по шкалам: <strong>{overallAvg}</strong>
            {' · '}вопросов: {list.length}
          </p>
        )}
        {chartData.length > 0 && (
          <OrientableBarChart
            data={chartData}
            categoryKey="name"
            series={[{ dataKey: 'avg', name: 'Средняя', fill: 'var(--m-accent)' }]}
            yAxisWidth={compact ? 140 : 160}
            height={Math.max(220, list.length * 34)}
          />
        )}
        {list.length > 0 && (
          <table className="adm-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Вопрос</th>
                <th>Средняя</th>
                <th>Шкала</th>
                <th>Ответов</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.key || r.label}>
                  <td>{r.label}</td>
                  <td><strong>{r.avg}</strong></td>
                  <td>1–{r.max ?? 5}</td>
                  <td>{r.answered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashCard>

      <DashGrid cols={2}>
        <DashCard title="Средняя по шкалам · по дням">
          {dayChart.some(d => d.answered > 0) ? (
            <>
              <OrientableBarChart
                data={dayChart.filter(d => d.answered > 0)}
                categoryKey="dayLabel"
                series={[{ dataKey: 'avg', name: 'Средняя', fill: '#3182CE' }]}
                height={220}
              />
              <table className="adm-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>День</th>
                    <th>Средняя</th>
                    <th>Ответов</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map(r => (
                    <tr key={r.day}>
                      <td>{formatForumDay(r.day)}</td>
                      <td><strong>{r.overallAvg ?? '—'}</strong></td>
                      <td>{r.answered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по дням</p>
          )}
        </DashCard>

        <DashCard title={`Средняя по шкалам · направления · ${formatForumDay(dirDay)}`}>
          <label className="adm-insights-filter" style={{ display: 'inline-flex', marginBottom: 8 }}>
            День
            <select
              className="adm-input"
              value={dirDay}
              onChange={e => setDirDay(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            >
              {dayOptions.map(d => (
                <option key={d} value={d}>{formatForumDay(d)}</option>
              ))}
            </select>
          </label>
          {dirChart.length > 0 ? (
            <>
              <OrientableBarChart
                data={dirChart}
                categoryKey="name"
                series={[{ dataKey: 'avg', name: 'Средняя', fill: 'var(--m-accent)' }]}
                yAxisWidth={120}
                height={Math.max(200, dirChart.length * 32)}
              />
              <table className="adm-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Направление</th>
                    <th>Средняя</th>
                    <th>Ответов</th>
                  </tr>
                </thead>
                <tbody>
                  {dirChart.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td><strong>{r.avg}</strong></td>
                      <td>{r.answered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
                Подробное сравнение по вопросам — в тепловой таблице ниже.
              </p>
            </>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
              В этот день нет оценок по направлениям.
            </p>
          )}
        </DashCard>
      </DashGrid>
    </div>
  );
}
