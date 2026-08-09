import { useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from './chartRu';
import { DashCard, DashGrid, DashKpi, dashVal } from './dashboardUi';
import { OrientableBarChart } from './orientableBars';

type EnergyDay = { day: number; avg: number | null; responses: number };
type EnergyDirDay = { direction: string; day: number; avg: number | null; responses: number };

/** Средняя энергия (1–10) по дням и по направлениям. */
export function EnergyAverages({
  avg,
  byDay,
  byDirectionDay,
  title = 'Средняя энергия',
  compact = false,
}: {
  avg?: number | null;
  byDay?: EnergyDay[] | null;
  byDirectionDay?: EnergyDirDay[] | null;
  title?: string;
  compact?: boolean;
}) {
  const { forumDay, meta } = useInsights();
  const dayRows = byDay ?? [];
  const dirDayRows = byDirectionDay ?? [];

  const dayOptions = useMemo(() => {
    if (dayRows.length) return dayRows.map(d => d.day);
    const cur = meta?.currentForumDay ?? (Number(forumDay) || 1);
    return Array.from({ length: Math.min(Math.max(1, cur), 7) }, (_, i) => i + 1);
  }, [dayRows, meta?.currentForumDay, forumDay]);

  const defaultDay = dayOptions.includes(Number(forumDay))
    ? Number(forumDay)
    : (dayOptions[dayOptions.length - 1] ?? 1);
  const [dirDay, setDirDay] = useState(defaultDay);

  const dayChart = useMemo(() => dayRows
    .filter(r => r.responses > 0 && r.avg != null)
    .map(r => ({
      dayLabel: formatForumDay(r.day),
      avg: r.avg as number,
      responses: r.responses,
    })), [dayRows]);

  const dirChart = useMemo(() => dirDayRows
    .filter(r => r.day === dirDay && r.avg != null && r.responses > 0)
    .map(r => ({
      name: r.direction,
      avg: r.avg as number,
      responses: r.responses,
    }))
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name, 'ru')), [dirDayRows, dirDay]);

  if (!dayRows.some(d => d.responses > 0) && avg == null) {
    return (
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет данных по энергии из проверок состояния.
        </p>
      </DashCard>
    );
  }

  return (
    <div className="adm-dash-stack" style={{ gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="adm-dash-section-label" style={{ marginBottom: 4 }}>{title}</div>
          <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
            Шкала 1–10 из проверки состояния. Среднее по дням и по направлениям.
          </p>
        </div>
        <label className="adm-insights-filter">
          День (направления)
          <select className="adm-input" value={dirDay} onChange={e => setDirDay(Number(e.target.value))}>
            {dayOptions.map(d => (
              <option key={d} value={d}>{formatForumDay(d)}</option>
            ))}
          </select>
        </label>
      </div>

      {!compact && (
        <DashGrid cols={3}>
          <DashKpi value={dashVal(avg ?? null)} label="средняя энергия" sub="шкала 1–10" accent="#f59e0b" />
          <DashKpi value={dashVal(dayChart.length)} label="дней с данными" />
          <DashKpi
            value={dashVal(dayRows.reduce((s, r) => s + r.responses, 0))}
            label="ответов с энергией"
          />
        </DashGrid>
      )}

      <DashGrid cols={2}>
        <DashCard title="Энергия · по дням">
          {dayChart.length > 0 ? (
            <>
              <OrientableBarChart
                data={dayChart}
                categoryKey="dayLabel"
                series={[{ dataKey: 'avg', name: 'Средняя', fill: '#f59e0b' }]}
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
                      <td><strong>{r.avg ?? '—'}</strong></td>
                      <td>{r.responses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по дням</p>
          )}
        </DashCard>

        <DashCard title={`Энергия · направления · ${formatForumDay(dirDay)}`}>
          {dirChart.length > 0 ? (
            <>
              <OrientableBarChart
                data={dirChart}
                categoryKey="name"
                series={[{ dataKey: 'avg', name: 'Средняя', fill: '#f59e0b' }]}
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
                      <td>{r.responses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
              В этот день нет данных по энергии направлений.
            </p>
          )}
        </DashCard>
      </DashGrid>
    </div>
  );
}
