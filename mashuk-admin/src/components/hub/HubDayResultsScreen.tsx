import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import {
  DashCard,
  DashScreenTitle,
} from '../analytics/dashboardUi';
import { ChartTooltipRu, formatForumDay } from '../analytics/chartRu';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubDisplayDay, hubFilterParams, isAllForumDay } from './hubQuery';
import {
  DayResultsSection,
  EXPERIMENT_COLORS,
  Flag,
  HBar,
  SpineBar,
  SpineLegend,
  StackBar,
  fillTone,
  heatCellStyle,
  lowTone,
} from './dayResultsUi';
import { ConclusionCard } from './directionNarrative';
import { dayFixationNarr, dayOpenNarr } from './hubNarrative';

type Block = {
  key: string;
  label: string;
  n: number;
  mean: number;
  dist: number[];
  top2: number;
  low: number;
  spread: number;
};

type HeatRow = {
  dir: string;
  n: number;
  vals: Array<{ v: number | null; dev: number }>;
  idx: number;
  isForum?: boolean;
};

type DayResultsData = {
  meta: {
    day: number;
    total: number;
    submitted: number;
    drafts: number;
    scaleN: number;
    index: number | null;
    practiceAttended: number;
    fillRatePct: number;
    attentionBlocks: number;
    formalPct: number;
    transferIndex: number;
  };
  blocks: Block[];
  heat: HeatRow[];
  heatForum?: HeatRow | null;
  worstGroups: Array<{
    group: string; dir: string; n: number; idx: number; weak: string; weakVal: number;
  }>;
  bestGroups: Array<{ group: string; n: number; idx: number }>;
  roles: Array<{ name: string; n: number }>;
  experiment: Array<{ name: string; n: number }>;
  fixation: Array<{ name: string; n: number }>;
  fixationN: number;
  fixationQuotes?: Array<{ text: string; meta: string }>;
  openQuotes?: Array<{ text: string; meta: string }>;
  practices: Array<{ name: string; n: number; mean: number }>;
  open: Array<{ key: string; label: string; n: number; fill: number; junk: number; medLen: number }>;
  draftByDir: Array<{ dir: string; n: number; pct: number }>;
  hours: Array<{ h: number; n: number }>;
  daySeries: Array<{ day: number; index: number | null; lowShare: number | null; submitted: number }>;
  diagnostics?: { notes?: string[] };
  exportPath?: string;
};

/**
 * Линза «Итоги дня» — пульс вечерней анкеты для утреннего штаба.
 * GET /analytics/hub/day-results
 */
export function HubDayResultsScreen() {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<DayResultsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fixQuoteLimit, setFixQuoteLimit] = useState(24);
  const [openQuoteLimit, setOpenQuoteLimit] = useState(24);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction,
      group,
      ageCategory,
      activity,
    });
    adminFetch(`/analytics/hub/day-results?${params.toString()}`)
      .then(res => setData(res as DayResultsData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить итоги дня');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const m = data?.meta;

  const forumIndexChart = useMemo(() => {
    const series = data?.daySeries ?? [];
    return [1, 2, 3, 4, 5, 6, 7, 8].map(day => {
      const pt = series.find(s => s.day === day);
      return {
        day,
        dayLabel: formatForumDay(day),
        index: pt?.index ?? null,
        submitted: pt?.submitted ?? 0,
        selected: day === selectedDay,
      };
    });
  }, [data?.daySeries, selectedDay]);

  const hasForumIndexSeries = forumIndexChart.some(r => r.index != null);

  const fixationConclusion = useMemo(() => {
    if (!data || !m) return null;
    return dayFixationNarr({
      fixationN: data.fixationN,
      submitted: m.submitted,
      fixation: data.fixation,
      fixationQuotesN: data.fixationQuotes?.length ?? 0,
    });
  }, [data, m]);

  const openConclusion = useMemo(() => {
    if (!data || !m) return null;
    return dayOpenNarr({
      submitted: m.submitted,
      formalPct: m.formalPct,
      open: data.open,
      openQuotesN: data.openQuotes?.length ?? 0,
    });
  }, [data, m]);

  return (
    <div className="adm-day-results">
      <DashScreenTitle
        title="Итоги дня — вечерняя анкета"
        hint={
          m
            ? `День ${m.day} из 8 · сдано ${m.submitted} из ${m.total} · индекс ${m.index ?? '—'}`
            : 'Аналитика итоговой анкеты для утреннего штаба'
        }
      />

      <div className="adm-day-results-days" aria-label="Дни форума">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
          const cls = [
            'adm-day-results-day',
            d === selectedDay && !allForum ? 'is-on' : '',
            d < selectedDay ? 'is-past' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={d}
              type="button"
              className={cls}
              onClick={() => setForumDay(String(d))}
            >
              {d}
            </button>
          );
        })}
      </div>

      {loading && !data && <p className="adm-muted">Загрузка…</p>}
      {loading && !!data && <p className="adm-muted" style={{ fontSize: 12 }}>Обновление…</p>}
      {err && <p className="adm-muted" style={{ color: '#b91c1c' }}>{err}</p>}

      {data && m && (
        <>
          {(data.diagnostics?.notes?.length ?? 0) > 0 && (
            <DashCard title="Диагностика данных">
              <ul className="adm-day-results-notes">
                {data.diagnostics!.notes!.map(n => <li key={n}>{n}</li>)}
              </ul>
            </DashCard>
          )}

          <DayResultsSection
            title="Пульс дня"
            note="Четыре числа, по которым утренний штаб решает, менять ли что-то в программе."
          >
            <DashCard title="Индекс форума по дням">
              <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                Среднее по шкалам итоговой анкеты за каждый день смены (1–5). Карточки ниже — срез выбранного дня.
              </p>
              {hasForumIndexSeries ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={forumIndexChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#86868b' }} />
                    <YAxis
                      domain={[1, 5]}
                      ticks={[1, 2, 3, 4, 5]}
                      tick={{ fontSize: 11, fill: '#86868b' }}
                      width={28}
                    />
                    <Tooltip content={<ChartTooltipRu />} />
                    <Line
                      type="monotone"
                      dataKey="index"
                      name="Индекс форума"
                      stroke="var(--m-accent)"
                      strokeWidth={2.5}
                      connectNulls
                      dot={(props) => {
                        const { cx, cy, payload } = props as {
                          cx?: number;
                          cy?: number;
                          payload?: { selected?: boolean; index?: number | null };
                        };
                        if (cx == null || cy == null || payload?.index == null) return null;
                        const on = Boolean(payload.selected);
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={on ? 5 : 3}
                            fill={on ? 'var(--m-accent)' : '#1F3A5F'}
                            stroke="#fff"
                            strokeWidth={on ? 2 : 1}
                          />
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
                  Пока нет сданных анкет ни за один день — индекс появится после первых сдач.
                </p>
              )}
            </DashCard>

            <HubKpiRow
              cols={4}
              items={[
                {
                  value: m.index ?? '—',
                  label: 'Индекс дня — среднее по блокам',
                  sub: `шкала 1–5 · n=${m.scaleN}`,
                },
                {
                  value: `${m.fillRatePct}%`,
                  label: 'Сдали анкету',
                  sub: `${m.submitted} из ${m.total} · черновиков ${m.drafts}`,
                },
                {
                  value: m.attentionBlocks,
                  label: 'Блока в зоне внимания',
                  sub: 'где ≥10% оценок ниже 4',
                },
                {
                  value: `${m.formalPct}%`,
                  label: 'Формальных ответов в тексте',
                  sub: '«.», «-», «все ок» — качество рефлексии',
                },
              ]}
            />
          </DayResultsSection>

          <DayResultsSection
            title="Хребет дня"
            note="Диверг-шкала: линия — граница между «удовлетворён» (4–5) и «есть претензия» (1–3). Работает хвост слева, не среднее."
          >
            <DashCard>
              {[...data.blocks].sort((a, b) => b.low - a.low).map(b => (
                <div key={b.key} className="adm-day-results-spine">
                  <div className="adm-day-results-spine-nm">{b.label}</div>
                  <SpineBar dist={b.dist} />
                  <div className="adm-day-results-spine-val">
                    <b>{b.mean.toFixed(2)}</b>
                    {' · '}
                    <Flag tone={lowTone(b.low)}>{b.low}%</Flag>
                  </div>
                </div>
              ))}
              {!data.blocks.length && <p className="adm-muted">Нет оценок по шкалам за этот день.</p>}
              <SpineLegend />
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Направления × блоки программы"
            note="Цвет — отклонение от общего среднего по блоку, не абсолютная оценка. Внизу — средняя по всему форуму."
          >
            <DashCard className="adm-day-results-scroll">
              {data.heat.length === 0 || data.blocks.length === 0 ? (
                <p className="adm-muted">Недостаточно данных для тепловой карты.</p>
              ) : (
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      <th style={{ textAlign: 'center' }}>N</th>
                      {data.blocks.map(b => (
                        <th key={b.key} style={{ textAlign: 'center', maxWidth: 74, whiteSpace: 'normal' }}>
                          {b.label}
                        </th>
                      ))}
                      <th style={{ textAlign: 'center' }}>Индекс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.heat].sort((a, b) => a.idx - b.idx).map(r => (
                      <tr key={r.dir}>
                        <td>{r.dir}</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{r.n}</td>
                        {r.vals.map((c, i) => {
                          if (c.v == null) {
                            return (
                              <td key={data.blocks[i]?.key ?? i} style={{ padding: 4, textAlign: 'center' }}>
                                <span className="adm-muted">—</span>
                              </td>
                            );
                          }
                          const st = heatCellStyle(c.dev);
                          return (
                            <td key={data.blocks[i]?.key ?? i} style={{ padding: 4 }}>
                              <span className="adm-day-results-cell" style={st}>
                                {c.v.toFixed(2)}
                              </span>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.idx.toFixed(2)}</td>
                      </tr>
                    ))}
                    {data.heatForum && (
                      <tr style={{ background: 'var(--m-bg, #f5f5f7)', fontWeight: 600 }}>
                        <td>{data.heatForum.dir}</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{data.heatForum.n}</td>
                        {data.heatForum.vals.map((c, i) => (
                          <td key={`forum-${data.blocks[i]?.key ?? i}`} style={{ padding: 4 }}>
                            <span className="adm-day-results-cell" style={{ background: 'transparent' }}>
                              {c.v == null ? '—' : c.v.toFixed(2)}
                            </span>
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}>{data.heatForum.idx.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Где направления расходятся сильнее всего"
            note="Разница между самым довольным и самым недовольным направлением (n ≥ 10)."
          >
            <DashCard>
              {(() => {
                const sorted = [...data.blocks].sort((a, b) => b.spread - a.spread);
                const mx = Math.max(...sorted.map(b => b.spread), 0.01);
                return sorted.map(b => (
                  <div key={b.key} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{b.label}</div>
                      <HBar
                        widthPct={(b.spread / mx) * 100}
                        color={b.spread >= 0.5 ? '#e2685e' : '#6f7d95'}
                      />
                    </div>
                    <div className="adm-day-results-nb">{b.spread.toFixed(2)}</div>
                  </div>
                ));
              })()}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Группы в зоне внимания"
            note="Только группы от 8 анкет — на меньших выборках одна плохая ночь двигает среднее."
          >
            <div className="adm-dash-grid adm-dash-grid-2">
              <DashCard title="Слабые группы">
                {data.worstGroups.length === 0 ? (
                  <p className="adm-muted">Нет групп с n ≥ 8.</p>
                ) : (
                  <table className="adm-table adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Группа</th>
                        <th>Направление</th>
                        <th style={{ textAlign: 'center' }}>N</th>
                        <th style={{ textAlign: 'center' }}>Индекс</th>
                        <th>Слабое место</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.worstGroups.map(r => (
                        <tr key={r.group}>
                          <td style={{ fontWeight: 600 }}>{r.group}</td>
                          <td className="adm-muted">{r.dir}</td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">{r.n}</td>
                          <td style={{ textAlign: 'center' }}>
                            <Flag tone={r.idx < 4.4 ? 'bad' : 'warn'}>{r.idx}</Flag>
                          </td>
                          <td className="adm-muted">{r.weak} · {r.weakVal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </DashCard>
              <DashCard title="Лучшие группы дня">
                <p className="adm-day-results-note" style={{ marginTop: 0 }}>
                  Источник практик, а не только повод похвалить
                </p>
                {data.bestGroups.length === 0 ? (
                  <p className="adm-muted">Нет групп с n ≥ 8.</p>
                ) : (
                  <table className="adm-table adm-day-results-table">
                    <tbody>
                      {data.bestGroups.map(r => (
                        <tr key={r.group}>
                          <td style={{ fontWeight: 600 }}>{r.group}</td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">{r.n} анкет</td>
                          <td style={{ textAlign: 'right' }}>
                            <Flag tone="ok">{r.idx}</Flag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.bestGroups[0] && data.worstGroups[0] && (
                  <p className="adm-day-results-callout">
                    Разрыв между верхом и низом —{' '}
                    <b>{(data.bestGroups[0].idx - data.worstGroups[0].idx).toFixed(2)}</b>
                    {' '}балла при одинаковой программе.
                  </p>
                )}
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Ролевой эксперимент дня"
            note="Педагогическое ядро: не «понравилось», а получилось ли перенести приём на себя."
          >
            <DashCard>
              {data.experiment.length === 0 ? (
                <p className="adm-muted">Нет ответов по эксперименту.</p>
              ) : (
                <>
                  <StackBar items={data.experiment} colors={EXPERIMENT_COLORS} />
                  <div className="adm-day-results-legend" style={{ marginTop: 12 }}>
                    {data.experiment.map((e, i) => (
                      <span key={e.name}>
                        <i style={{ background: EXPERIMENT_COLORS[i % EXPERIMENT_COLORS.length] }} />
                        {e.name} — {e.n}
                      </span>
                    ))}
                  </div>
                  <p className="adm-day-results-callout">
                    <b>{m.transferIndex}%</b> довели эксперимент до результата
                    (индекс переноса).
                  </p>
                </>
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Что зафиксировали о себе"
            note="Самоописание дня: повторяющиеся формулировки и развёрнутые комментарии участников."
          >
            <DashCard title={`Формулировки · ${data.fixationN}`}>
              {data.fixation.length === 0 ? (
                <p className="adm-muted">Нет данных.</p>
              ) : (
                (() => {
                  const mx = Math.max(...data.fixation.map(f => f.n), 1);
                  return data.fixation.map(f => (
                    <div key={f.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{f.name}</div>
                        <HBar widthPct={(f.n / mx) * 100} />
                      </div>
                      <div className="adm-day-results-nb">{f.n}</div>
                    </div>
                  ));
                })()
              )}
            </DashCard>
            <DashCard
              title={`Комментарии · ${(data.fixationQuotes ?? []).length}`}
              className="adm-hub-quotes-card"
            >
              {(data.fixationQuotes ?? []).length === 0 ? (
                <p className="adm-muted">Нет развёрнутых текстов фиксации.</p>
              ) : (
                <>
                  {(data.fixationQuotes ?? []).slice(0, fixQuoteLimit).map((q, i) => (
                    <div key={i} className="adm-state-quote">
                      {q.text}
                      <span className="adm-state-quote-m">{q.meta}</span>
                    </div>
                  ))}
                  {(data.fixationQuotes ?? []).length > fixQuoteLimit && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      style={{ marginTop: 10 }}
                      onClick={() => setFixQuoteLimit(n => Math.min(n + 24, (data.fixationQuotes ?? []).length))}
                    >
                      Показать ещё ({(data.fixationQuotes ?? []).length - fixQuoteLimit})
                    </button>
                  )}
                </>
              )}
            </DashCard>
            {fixationConclusion && <ConclusionCard c={fixationConclusion} />}
          </DayResultsSection>

          <DayResultsSection
            title="Роль, выбранная на завтра"
            note="Распределение ролей среди сдавших анкету."
          >
            <DashCard>
              {data.roles.length === 0 ? (
                <p className="adm-muted">Нет данных.</p>
              ) : (
                (() => {
                  const mx = Math.max(...data.roles.map(r => r.n), 1);
                  const base = m.total || m.submitted || 1;
                  return data.roles.map(r => (
                    <div key={r.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{r.name}</div>
                        <HBar widthPct={(r.n / mx) * 100} color="#6f7d95" />
                      </div>
                      <div className="adm-day-results-nb">{Math.round((r.n / base) * 100)}%</div>
                    </div>
                  ));
                })()
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Презентации практик участников"
            note={
              `Дошли до презентаций ${m.practiceAttended} человек из ${m.total}`
              + ` — это охват. Рейтинг на ${data.practices.reduce((a, p) => a + p.n, 0)} оценках.`
            }
          >
            <DashCard>
              {data.practices.length === 0 ? (
                <p className="adm-muted">Нет оценок практик.</p>
              ) : (
                data.practices.map(p => (
                  <div key={p.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{p.name}</div>
                      <HBar
                        widthPct={(p.mean / 10) * 100}
                        color={p.mean >= 9 ? '#57bd9c' : '#e6ae4a'}
                      />
                    </div>
                    <div className="adm-day-results-nb">
                      {p.mean.toFixed(1)}
                      <div style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}>n={p.n}</div>
                    </div>
                  </div>
                ))
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Качество обратной связи"
            note="Если доходимость до открытых вопросов падает — анкета длинная, а не участники ленивые."
          >
            <DashCard>
              {data.open.length === 0 ? (
                <p className="adm-muted">Нет открытых вопросов с ответами.</p>
              ) : (
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Вопрос</th>
                      <th style={{ textAlign: 'center' }}>Ответов</th>
                      <th style={{ textAlign: 'center' }}>Доходимость</th>
                      <th style={{ textAlign: 'center' }}>Формальных</th>
                      <th style={{ textAlign: 'center' }}>Медиана длины</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.open.map(o => (
                      <tr key={o.key}>
                        <td>{o.label}</td>
                        <td style={{ textAlign: 'center' }}>{o.n}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Flag tone={fillTone(o.fill)}>{o.fill}%</Flag>
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            color: o.junk >= 10 ? '#b91c1c' : undefined,
                          }}
                        >
                          {o.junk}%
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{o.medLen} зн.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashCard>
            <DashCard
              title={`Комментарии анкеты · ${(data.openQuotes ?? []).length}`}
              className="adm-hub-quotes-card"
            >
              {(data.openQuotes ?? []).length === 0 ? (
                <p className="adm-muted">Нет развёрнутых открытых ответов.</p>
              ) : (
                <>
                  {(data.openQuotes ?? []).slice(0, openQuoteLimit).map((q, i) => (
                    <div key={i} className="adm-state-quote">
                      {q.text}
                      <span className="adm-state-quote-m">{q.meta}</span>
                    </div>
                  ))}
                  {(data.openQuotes ?? []).length > openQuoteLimit && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      style={{ marginTop: 10 }}
                      onClick={() => setOpenQuoteLimit(n => Math.min(n + 24, (data.openQuotes ?? []).length))}
                    >
                      Показать ещё ({(data.openQuotes ?? []).length - openQuoteLimit})
                    </button>
                  )}
                </>
              )}
            </DashCard>
            {openConclusion && <ConclusionCard c={openConclusion} />}
            <div className="adm-dash-grid adm-dash-grid-2" style={{ marginTop: 14 }}>
              <DashCard title="Черновики по направлениям">
                {data.draftByDir.length === 0 ? (
                  <p className="adm-muted">Нет черновиков.</p>
                ) : (
                  (() => {
                    const mx = Math.max(...data.draftByDir.map(r => r.pct), 1);
                    return [...data.draftByDir].sort((a, b) => b.pct - a.pct).map(r => (
                      <div key={r.dir} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">{r.dir}</div>
                          <HBar
                            widthPct={(r.pct / mx) * 100}
                            color={r.pct >= 15 ? '#e2685e' : '#6f7d95'}
                          />
                        </div>
                        <div className="adm-day-results-nb">{r.pct}%</div>
                      </div>
                    ));
                  })()
                )}
              </DashCard>
              <DashCard title="Когда заполняют (МСК)">
                {data.hours.length === 0 ? (
                  <p className="adm-muted">Нет времени заполнения.</p>
                ) : (
                  (() => {
                    const mx = Math.max(...data.hours.map(h => h.n), 1);
                    return data.hours.map(h => (
                      <div key={h.h} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">
                            {String(h.h).padStart(2, '0')}:00
                          </div>
                          <HBar widthPct={(h.n / mx) * 100} color="#e6ae4a" />
                        </div>
                        <div className="adm-day-results-nb">{h.n}</div>
                      </div>
                    ));
                  })()
                )}
                <p className="adm-day-results-callout adm-day-results-callout-amber">
                  Половина анкет обычно приходит в первый час после открытия — разбор на утреннем штабе можно строить на снимке 07:00.
                </p>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Динамика по дням"
            note="Сквозные шкалы сравниваются напрямую. Разовые вопросы дня в динамику не попадают."
          >
            <DashCard>
              <div className="adm-day-results-dyn">
                {([1, 2, 3, 4, 5, 6, 7, 8] as const).map(d => {
                  const pt = data.daySeries.find(s => s.day === d);
                  const idx = pt?.index;
                  const h = idx != null
                    ? Math.max(6, Math.round(((idx - 3.8) / 1.2) * 120))
                    : 6;
                  return (
                    <div key={d} className="adm-day-results-dyn-col">
                      <div
                        className="adm-day-results-dyn-bar"
                        style={{
                          height: h,
                          background: idx != null
                            ? (d === selectedDay ? 'var(--m-accent)' : '#1F3A5F')
                            : 'var(--m-bg)',
                        }}
                      />
                      <div className={d === selectedDay ? '' : 'adm-muted'} style={{ fontSize: 11, marginTop: 8 }}>
                        {idx != null ? idx.toFixed(2) : '—'}
                      </div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>Д{d}</div>
                    </div>
                  );
                })}
              </div>
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'evening-summary',
                  label: 'Итоговая анкета',
                  path: data.exportPath || `/exports/evening-summary?mode=day&day=${selectedDay}`,
                  filename: `evening_summary_d${selectedDay}.xlsx`,
                });
              }}
            >
              Скачать XLSX итоговой анкеты
            </button>
          </div>
        </>
      )}
    </div>
  );
}
