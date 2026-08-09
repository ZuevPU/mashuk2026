import { useMemo } from 'react';
import { formatForumDay } from './chartRu';
import { DashCard, DashGrid, DashKpi, dashVal } from './dashboardUi';
import { OrientableBarChart } from './orientableBars';

type EnergyDay = { day: number; avg: number | null; responses: number };
type EnergyDirDay = { direction: string; day: number; avg: number | null; responses: number };

const FORUM_DAYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const DAY_SERIES_COLORS = [
  '#f59e0b', '#1F3A5F', '#2F6FED', '#0A7B6F',
  '#B8621A', '#6B5B95', '#C75000', '#475569',
];

type DirPivotRow = {
  name: string;
  overallAvg: number | null;
  overallResponses: number;
  byDay: Record<number, { avg: number | null; responses: number }>;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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
  const dayRows = byDay ?? [];
  const dirDayRows = byDirectionDay ?? [];
  const displayDays = FORUM_DAYS;

  const dayTable = useMemo(() => displayDays.map(day => {
    const hit = dayRows.find(r => r.day === day);
    return {
      day,
      dayLabel: formatForumDay(day),
      avg: hit?.avg ?? null,
      responses: hit?.responses ?? 0,
    };
  }), [dayRows, displayDays]);

  const dayChart = useMemo(
    () => dayTable.filter(d => d.responses > 0 && d.avg != null),
    [dayTable],
  );

  const dirPivot = useMemo(() => {
    const directions = [...new Set(dirDayRows.map(r => r.direction || '—'))]
      .sort((a, b) => a.localeCompare(b, 'ru'));
    const rows: DirPivotRow[] = directions.map(name => {
      const byDay: DirPivotRow['byDay'] = {};
      let sum = 0;
      let n = 0;
      for (const day of displayDays) {
        const hit = dirDayRows.find(r => r.direction === name && r.day === day);
        const responses = hit?.responses ?? 0;
        const dayAvg = hit?.avg ?? null;
        byDay[day] = { avg: dayAvg, responses };
        if (dayAvg != null && responses > 0) {
          sum += dayAvg * responses;
          n += responses;
        }
      }
      return {
        name,
        overallAvg: n ? round1(sum / n) : null,
        overallResponses: n,
        byDay,
      };
    }).filter(r => r.overallResponses > 0 || displayDays.some(d => (r.byDay[d]?.responses ?? 0) > 0));

    rows.sort((a, b) =>
      (b.overallAvg ?? -1) - (a.overallAvg ?? -1)
      || a.name.localeCompare(b.name, 'ru'));
    return rows;
  }, [dirDayRows, displayDays]);

  const dirChart = useMemo(() => dirPivot.map(r => {
    const row: Record<string, string | number | null> = { name: r.name };
    for (const day of displayDays) {
      row[`d${day}`] = r.byDay[day]?.avg ?? null;
    }
    return row;
  }), [dirPivot, displayDays]);

  const dirSeries = useMemo(() => displayDays.map((day, i) => ({
    dataKey: `d${day}`,
    name: `Ср. ${formatForumDay(day)}`,
    fill: DAY_SERIES_COLORS[i % DAY_SERIES_COLORS.length],
  })), [displayDays]);

  if (!dayRows.some(d => d.responses > 0) && avg == null && !dirPivot.length) {
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
      <div>
        <div className="adm-dash-section-label" style={{ marginBottom: 4 }}>{title}</div>
        <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
          Шкала 1–10 из проверки состояния. Среднее по дням и по направлениям (дни 1–8).
        </p>
      </div>

      {!compact && (
        <DashGrid cols={3}>
          <DashKpi value={dashVal(avg ?? null)} label="средняя энергия" sub="шкала 1–10" accent="#f59e0b" />
          <DashKpi
            value={dashVal(dayChart.length)}
            label="дней с данными"
          />
          <DashKpi
            value={dashVal(dayRows.reduce((s, r) => s + r.responses, 0))}
            label="ответов с энергией"
          />
        </DashGrid>
      )}

      <DashCard title="Энергия · по дням">
        {dayChart.length > 0 ? (
          <>
            <OrientableBarChart
              data={dayChart}
              categoryKey="dayLabel"
              series={[{ dataKey: 'avg', name: 'Средняя', fill: '#f59e0b' }]}
              height={220}
            />
            <div className="adm-table-scroll" style={{ marginTop: 12 }}>
              <table className="adm-table adm-table-compact">
                <thead>
                  <tr>
                    <th>День</th>
                    <th>Средняя</th>
                    <th>Ответов</th>
                  </tr>
                </thead>
                <tbody>
                  {dayTable.map(r => (
                    <tr key={r.day}>
                      <td>{r.dayLabel}</td>
                      <td><strong>{r.avg ?? '—'}</strong></td>
                      <td>{r.responses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>Нет данных по дням</p>
        )}
      </DashCard>

      <DashCard title="Энергия · направления · по дням">
        {dirPivot.length > 0 ? (
          <>
            <OrientableBarChart
              data={dirChart}
              categoryKey="name"
              series={dirSeries}
              showLegend
              yAxisWidth={120}
              height={Math.max(260, dirChart.length * (28 + displayDays.length * 4))}
            />
            <div className="adm-table-scroll" style={{ marginTop: 12, width: '100%' }}>
              <table className="adm-table adm-table-compact" style={{ width: '100%', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Направление</th>
                    <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Средняя</th>
                    <th colSpan={displayDays.length} style={{ textAlign: 'center' }}>Средняя по дням</th>
                    <th colSpan={displayDays.length} style={{ textAlign: 'center' }}>Ответов по дням</th>
                  </tr>
                  <tr>
                    {displayDays.map(d => (
                      <th key={`avg-h-${d}`}>{formatForumDay(d)}</th>
                    ))}
                    {displayDays.map(d => (
                      <th key={`n-h-${d}`}>{formatForumDay(d)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dirPivot.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td><strong>{r.overallAvg ?? '—'}</strong></td>
                      {displayDays.map(d => (
                        <td key={`avg-${r.name}-${d}`}>{r.byDay[d]?.avg ?? '—'}</td>
                      ))}
                      {displayDays.map(d => (
                        <td key={`n-${r.name}-${d}`}>{r.byDay[d]?.responses ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
            Нет данных по энергии направлений.
          </p>
        )}
      </DashCard>
    </div>
  );
}
