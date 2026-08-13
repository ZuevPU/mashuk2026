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
import { HubLensLayout, type HubNavItem } from './HubSideNav';
import { GoalProgressByDirectionChart, type GoalProgressByDirectionData } from './GoalProgressByDirectionChart';
import { ConclusionCard } from './directionNarrative';
import { dayFixationNarr, dayOpenNarr } from './hubNarrative';

function isGoalProgressBlock(label: string): boolean {
  return /движен\S* к своей цели|находишься в движен/i.test(label);
}

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
  goalProgressByDirection?: GoalProgressByDirectionData | null;
  openQuotes?: Array<{ text: string; meta: string }>;
  practices: Array<{ name: string; n: number; mean: number }>;
  open: Array<{ key: string; label: string; n: number; fill: number; junk: number; medLen: number }>;
  draftByDir: Array<{ dir: string; n: number; pct: number }>;
  hours: Array<{ h: number; n: number }>;
  daySeries: Array<{ day: number; index: number | null; lowShare: number | null; submitted: number }>;
  diagnostics?: { notes?: string[] };
  exportPath?: string;
};

function isPracticePickLabel(text: string): boolean {
  return /презентаци\S*.{0,80}практик/i.test(text)
    || (/→/.test(text) && /\[\s*\d+\s*\/\s*10\s*\]/.test(text));
}

/**
 * Линза «Итоги дня» — пульс вечерней анкеты для утреннего штаба.
 * GET /analytics/hub/day-results
 */
const DAY_RESULTS_NAV: HubNavItem[] = [
  { id: 'hub-day-pulse', label: 'Пульс' },
  { id: 'hub-day-spine', label: 'Хребет' },
  { id: 'hub-day-heatmap', label: 'Теплокарта' },
  { id: 'hub-day-goal', label: 'Цель' },
  { id: 'hub-day-experiment', label: 'Эксперимент' },
  { id: 'hub-day-fixation', label: 'Фиксация' },
  { id: 'hub-day-role', label: 'Роль' },
  { id: 'hub-day-practices', label: 'Практики' },
  { id: 'hub-day-feedback', label: 'ОС' },
  { id: 'hub-day-dynamics', label: 'Динамика' },
];

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

  const fixationItems = useMemo(
    () => (data?.fixation ?? []).filter(f => !isPracticePickLabel(f.name)),
    [data],
  );
  const fixationQuotes = useMemo(
    () => (data?.fixationQuotes ?? []).filter(q => !isPracticePickLabel(q.text)),
    [data],
  );

  const programBlocks = useMemo(
    () => (data?.blocks ?? [])
      .map((block, i) => ({ block, i }))
      .filter(({ block }) => !isGoalProgressBlock(block.label)),
    [data?.blocks],
  );

  const fixationConclusion = useMemo(() => {
    if (!data || !m) return null;
    return dayFixationNarr({
      fixationN: fixationItems.reduce((s, f) => s + f.n, 0),
      submitted: m.submitted,
      fixation: fixationItems,
      fixationQuotesN: fixationQuotes.length,
    });
  }, [data, m, fixationItems, fixationQuotes]);

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
    <HubLensLayout className="adm-day-results" items={DAY_RESULTS_NAV} navLabel="Разделы итогов дня">
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
            id="hub-day-pulse"
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
            id="hub-day-spine"
            title="Хребет дня"
            note="Диверг-шкала: линия — граница между «удовлетворён» (4–5) и «есть претензия» (1–3). Работает хвост слева, не среднее."
          >
            <DashCard>
              {[...programBlocks.map(p => p.block)].sort((a, b) => b.low - a.low).map(b => (
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
              {!programBlocks.length && <p className="adm-muted">Нет оценок по шкалам за этот день.</p>}
              <SpineLegend />
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-day-heatmap"
            title="Направления × блоки программы"
            note="Цвет — отклонение от общего среднего по блоку, не абсолютная оценка. Внизу — средняя по всему форуму."
          >
            <DashCard className="adm-day-results-scroll">
              {data.heat.length === 0 || programBlocks.length === 0 ? (
                <p className="adm-muted">Недостаточно данных для тепловой карты.</p>
              ) : (
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      <th style={{ textAlign: 'center' }}>N</th>
                      {programBlocks.map(({ block }) => (
                        <th key={block.key} style={{ textAlign: 'center', maxWidth: 74, whiteSpace: 'normal' }}>
                          {block.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.heat].sort((a, b) => a.idx - b.idx).map(r => (
                      <tr key={r.dir}>
                        <td>{r.dir}</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{r.n}</td>
                        {programBlocks.map(({ block, i }) => {
                          const c = r.vals[i];
                          if (!c || c.v == null) {
                            return (
                              <td key={block.key} style={{ padding: 4, textAlign: 'center' }}>
                                <span className="adm-muted">—</span>
                              </td>
                            );
                          }
                          const st = heatCellStyle(c.dev);
                          return (
                            <td key={block.key} style={{ padding: 4 }}>
                              <span className="adm-day-results-cell" style={st}>
                                {c.v.toFixed(2)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {data.heatForum && (
                      <tr style={{ background: 'var(--m-bg, #f5f5f7)', fontWeight: 600 }}>
                        <td>{data.heatForum.dir}</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{data.heatForum.n}</td>
                        {programBlocks.map(({ block, i }) => {
                          const c = data.heatForum?.vals[i];
                          return (
                            <td key={`forum-${block.key}`} style={{ padding: 4 }}>
                              <span className="adm-day-results-cell" style={{ background: 'transparent' }}>
                                {c?.v == null ? '—' : c.v.toFixed(2)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-day-goal"
            title="Движение к цели по направлениям"
            note="Где ты сейчас находишься в движении к своей цели (даже если она поменялась или уточнилась). Сверху — средняя 1–5, ниже — доли ответов."
          >
            {data.goalProgressByDirection?.byDirection?.length ? (
              <>
                <DashCard title="Средняя по направлениям">
                  {(() => {
                    const rows = [...data.goalProgressByDirection.byDirection]
                      .filter(r => r.avg != null)
                      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
                    const mx = 5;
                    return rows.map(r => (
                      <div key={r.direction} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">{r.direction}</div>
                          <HBar widthPct={((r.avg ?? 0) / mx) * 100} color="#007AFF" />
                        </div>
                        <div className="adm-day-results-nb">
                          {r.avg}
                          <span className="adm-muted" style={{ fontWeight: 500 }}> · {r.answered}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </DashCard>
                <GoalProgressByDirectionChart
                  data={data.goalProgressByDirection}
                  title="Доли ответов 1–5"
                />
              </>
            ) : (
              <DashCard>
                <p className="adm-muted">Нет ответов по этому вопросу в срезе дня.</p>
              </DashCard>
            )}
          </DayResultsSection>

          <DayResultsSection
            id="hub-day-experiment"
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
            id="hub-day-fixation"
            title="Что зафиксировали о себе"
            note="Самоописание дня: повторяющиеся формулировки и развёрнутые комментарии участников."
          >
            <DashCard title={`Формулировки · ${fixationItems.reduce((s, f) => s + f.n, 0)}`}>
              {fixationItems.length === 0 ? (
                <p className="adm-muted">Нет данных.</p>
              ) : (
                (() => {
                  const mx = Math.max(...fixationItems.map(f => f.n), 1);
                  return fixationItems.map(f => (
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
              title={`Комментарии · ${fixationQuotes.length}`}
              className="adm-hub-quotes-card"
            >
              {fixationQuotes.length === 0 ? (
                <p className="adm-muted">Нет развёрнутых текстов фиксации.</p>
              ) : (
                <>
                  {fixationQuotes.slice(0, fixQuoteLimit).map((q, i) => (
                    <div key={i} className="adm-state-quote">
                      {q.text}
                      <span className="adm-state-quote-m">{q.meta}</span>
                    </div>
                  ))}
                  {fixationQuotes.length > fixQuoteLimit && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      style={{ marginTop: 10 }}
                      onClick={() => setFixQuoteLimit(n => Math.min(n + 24, fixationQuotes.length))}
                    >
                      Показать ещё ({fixationQuotes.length - fixQuoteLimit})
                    </button>
                  )}
                </>
              )}
            </DashCard>
            {fixationConclusion && <ConclusionCard c={fixationConclusion} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-day-role"
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
            id="hub-day-practices"
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
            id="hub-day-feedback"
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
            id="hub-day-dynamics"
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
    </HubLensLayout>
  );
}
