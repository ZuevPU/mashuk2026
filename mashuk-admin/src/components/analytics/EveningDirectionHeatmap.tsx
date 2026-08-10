import { useEffect, useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { formatForumDay } from './chartRu';
import { DashCard, DashKpi, DashGrid, dashVal } from './dashboardUi';
import { OrientableBarChart } from './orientableBars';

type ScaleQuestion = {
  key?: string;
  label: string;
  avg: number;
  answered: number;
  max?: number;
  type?: string;
};

type ScaleByDirection = {
  direction: string;
  overallAvg: number | null;
  answered: number;
  byQuestion?: ScaleQuestion[];
};

type ScaleByDirectionDay = ScaleByDirection & { day: number };

type Props = {
  byDirection?: ScaleByDirection[] | null;
  byDirectionDay?: ScaleByDirectionDay[] | null;
  /** Средняя по форуму (для сравнения) */
  forumOverallAvg?: number | null;
  title?: string;
};

type DayMode = 'period' | number;

function isOrganizerDirection(name: string): boolean {
  return name.trim().toLowerCase() === 'организатор форума';
}

function heatBg(avg: number | null, max: number): string {
  if (avg == null || !Number.isFinite(avg) || max <= 0) return '#f3f4f6';
  const t = Math.min(1, Math.max(0, avg / max));
  // cool → warm: low red-ish muted, high teal
  if (t < 0.45) {
    const a = 0.15 + (0.45 - t) * 0.5;
    return `rgba(185, 28, 28, ${a.toFixed(2)})`;
  }
  if (t < 0.7) {
    const a = 0.18 + (t - 0.45) * 0.6;
    return `rgba(217, 119, 6, ${a.toFixed(2)})`;
  }
  const a = 0.25 + (t - 0.7) * 1.2;
  return `rgba(15, 118, 110, ${Math.min(0.85, a).toFixed(2)})`;
}

function heatText(avg: number | null, max: number): string {
  if (avg == null) return '#9ca3af';
  const t = avg / Math.max(1, max);
  return t >= 0.72 ? '#fff' : '#134e4a';
}

function qKey(q: ScaleQuestion): string {
  return q.key || q.label;
}

export function EveningDirectionHeatmap({
  byDirection,
  byDirectionDay,
  forumOverallAvg,
  title = 'Оценки по направлениям · тепловая карта',
}: Props) {
  const { forumDay, meta } = useInsights();
  const periodRows = byDirection ?? [];
  const dayRows = byDirectionDay ?? [];

  const dayOptions = useMemo(() => {
    const days = [...new Set(dayRows.map(r => r.day))].filter(d => d >= 1).sort((a, b) => a - b);
    return days;
  }, [dayRows]);

  const defaultDay = dayOptions.includes(Number(forumDay))
    ? Number(forumDay)
    : (dayOptions[dayOptions.length - 1] ?? (meta?.currentForumDay ?? 1));

  const [dayMode, setDayMode] = useState<DayMode>('period');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeSlices = useMemo((): ScaleByDirection[] => {
    if (dayMode === 'period') return periodRows;
    return dayRows
      .filter(r => r.day === dayMode && (r.answered > 0 || (r.overallAvg != null)))
      .map(({ direction, overallAvg, answered, byQuestion }) => ({
        direction, overallAvg, answered, byQuestion,
      }));
  }, [dayMode, periodRows, dayRows]);

  const allDirections = useMemo(
    () => [...new Set(activeSlices.map(r => r.direction))]
      .filter(d => !isOrganizerDirection(d))
      .sort((a, b) => a.localeCompare(b, 'ru')),
    [activeSlices],
  );

  // Default: select all directions that have data
  useEffect(() => {
    setSelected(new Set(allDirections));
  }, [allDirections.join('\u0001')]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleDirs = useMemo(
    () => allDirections.filter(d => selected.has(d)),
    [allDirections, selected],
  );

  const questions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; max: number }>();
    for (const slice of activeSlices) {
      if (!visibleDirs.includes(slice.direction)) continue;
      for (const q of slice.byQuestion ?? []) {
        const key = qKey(q);
        if (!map.has(key)) {
          map.set(key, {
            key,
            label: q.label,
            max: q.max ?? (q.type === 'scale_1_10' ? 10 : 5),
          });
        } else {
          const cur = map.get(key)!;
          cur.max = Math.max(cur.max, q.max ?? cur.max);
        }
      }
    }
    return [...map.values()];
  }, [activeSlices, visibleDirs]);

  const cellMap = useMemo(() => {
    const m = new Map<string, { avg: number; answered: number; max: number }>();
    for (const slice of activeSlices) {
      for (const q of slice.byQuestion ?? []) {
        if (q.avg == null || !Number.isFinite(q.avg)) continue;
        m.set(`${slice.direction}::${qKey(q)}`, {
          avg: q.avg,
          answered: q.answered,
          max: q.max ?? (q.type === 'scale_1_10' ? 10 : 5),
        });
      }
    }
    return m;
  }, [activeSlices]);

  const compareBars = useMemo(() => activeSlices
    .filter(r => visibleDirs.includes(r.direction) && r.overallAvg != null)
    .map(r => ({
      name: r.direction,
      avg: r.overallAvg as number,
      answered: r.answered,
      delta: forumOverallAvg != null && r.overallAvg != null
        ? Math.round((r.overallAvg - forumOverallAvg) * 10) / 10
        : null as number | null,
    }))
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name, 'ru')),
  [activeSlices, visibleDirs, forumOverallAvg]);

  const toggleDir = (dir: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(dir)) {
        if (next.size <= 1) return next;
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allDirections));
  const selectNoneKeepOne = () => {
    if (allDirections[0]) setSelected(new Set([allDirections[0]]));
  };

  if (!periodRows.length && !dayRows.some(r => r.answered > 0)) {
    return (
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет оценок по направлениям в сданных анкетах вечера.
        </p>
      </DashCard>
    );
  }

  const periodLabel = dayMode === 'period'
    ? 'за выбранный период'
    : formatForumDay(dayMode);

  return (
    <div className="adm-dash-stack" style={{ gap: 12 }}>
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10, lineHeight: 1.45 }}>
          Средние оценки шкал итоговой анкеты по каждому направлению.
          Выберите направления для сравнения — таблица и график обновятся.
        </p>

        <div className="form-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <div className="adm-seg" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className={dayMode === 'period' ? 'on' : ''}
              onClick={() => setDayMode('period')}
            >
              Весь период
            </button>
            {dayOptions.map(d => (
              <button
                key={d}
                type="button"
                className={dayMode === d ? 'on' : ''}
                onClick={() => setDayMode(d)}
              >
                {formatForumDay(d)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Направления для сравнения</span>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={selectAll}>Все</button>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={selectNoneKeepOne}>Сбросить</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allDirections.map(dir => {
              const on = selected.has(dir);
              return (
                <button
                  key={dir}
                  type="button"
                  className={`adm-metric-chip${on ? ' is-active' : ''}`}
                  onClick={() => toggleDir(dir)}
                  aria-pressed={on}
                >
                  {dir}
                </button>
              );
            })}
            {allDirections.length === 0 && (
              <span className="adm-muted" style={{ fontSize: 12 }}>Нет данных за {periodLabel}</span>
            )}
          </div>
        </div>

        <DashGrid cols={3}>
          <DashKpi
            value={dashVal(visibleDirs.length)}
            label="направлений в сравнении"
          />
          <DashKpi
            value={dashVal(forumOverallAvg ?? null)}
            label="средняя по форуму"
            accent="var(--m-accent)"
          />
          <DashKpi
            value={dashVal(compareBars[0]?.avg ?? null)}
            label="лидер по средней"
            sub={compareBars[0]?.name}
            accent="#0A7B6F"
          />
        </DashGrid>

        {compareBars.length > 0 && (
          <>
            <p className="adm-muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 6 }}>
              Сравнение средних по шкалам · {periodLabel}
            </p>
            <OrientableBarChart
              data={compareBars}
              categoryKey="name"
              series={[{ dataKey: 'avg', name: 'Средняя', fill: 'var(--m-accent)' }]}
              yAxisWidth={130}
              height={Math.max(200, compareBars.length * 34)}
            />
            <table className="adm-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Направление</th>
                  <th>Средняя</th>
                  <th>Δ к форуму</th>
                  <th>Ответов</th>
                </tr>
              </thead>
              <tbody>
                {compareBars.map(r => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td><strong>{r.avg}</strong></td>
                    <td style={{
                      color: r.delta == null ? undefined
                        : r.delta > 0 ? '#2F855A'
                          : r.delta < 0 ? '#C53030' : undefined,
                    }}>
                      {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${r.delta}`}
                    </td>
                    <td>{r.answered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </DashCard>

      <DashCard title={`Тепловая таблица · вопрос × направление · ${periodLabel}`}>
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10, lineHeight: 1.45 }}>
          Цвет ячейки — средняя оценка по шкале (чем насыщеннее бирюзовый, тем выше).
          Наведите на ячейку: средняя и число ответов.
        </p>

        {questions.length === 0 || visibleDirs.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
            Выберите направления с оценками за этот период.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 180, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    Вопрос / шкала
                  </th>
                  {visibleDirs.map(dir => (
                    <th key={dir} style={{ textAlign: 'center', minWidth: 88 }}>{dir}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Overall row */}
                <tr>
                  <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    Средняя по всем шкалам
                  </td>
                  {visibleDirs.map(dir => {
                    const slice = activeSlices.find(s => s.direction === dir);
                    const avg = slice?.overallAvg ?? null;
                    const max = 5;
                    return (
                      <td
                        key={dir}
                        title={avg != null ? `${avg} · ответов: ${slice?.answered ?? 0}` : 'нет данных'}
                        style={{
                          textAlign: 'center',
                          fontWeight: 700,
                          background: heatBg(avg, max),
                          color: heatText(avg, max),
                        }}
                      >
                        {avg != null ? avg : '—'}
                      </td>
                    );
                  })}
                </tr>
                {questions.map(q => (
                  <tr key={q.key}>
                    <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                      <div>{q.label}</div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>1–{q.max}</div>
                    </td>
                    {visibleDirs.map(dir => {
                      const cell = cellMap.get(`${dir}::${q.key}`);
                      const avg = cell?.avg ?? null;
                      const max = cell?.max ?? q.max;
                      return (
                        <td
                          key={dir}
                          title={avg != null ? `${avg} из ${max} · ответов: ${cell?.answered ?? 0}` : 'нет данных'}
                          style={{
                            textAlign: 'center',
                            fontWeight: 600,
                            background: heatBg(avg, max),
                            color: heatText(avg, max),
                          }}
                        >
                          {avg != null ? avg : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
    </div>
  );
}
