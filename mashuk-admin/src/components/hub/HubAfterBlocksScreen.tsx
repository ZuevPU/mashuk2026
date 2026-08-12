import { useEffect, useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubDisplayDay, hubFilterParams, isAllForumDay } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
  StackBar,
} from './dayResultsUi';
import { ConclusionCard } from './directionNarrative';
import { afterBlocksNarr } from './hubNarrative';

const LEVELS = ['Перенос в практику', 'Связь с собой', 'Тезис', 'Реакция'] as const;
const LEVEL_COLORS: Record<string, string> = {
  'Перенос в практику': '#57bd9c',
  'Связь с собой': '#79b8c9',
  'Тезис': '#6f7d95',
  'Реакция': '#e6ae4a',
};

type AfterBlocksData = {
  levels: string[];
  meta: {
    day: number;
    answers: number;
    people: number;
    registered: number;
    own: number;
    medLen: number;
    subtopics: number;
    coveragePct: number;
    transferPct?: number;
    reactionPct?: number;
    shortPct?: number;
  };
  levelDist: Array<{ name: string; n: number; med: number }>;
  events: Array<{
    event: string; n: number; people: number; own: number; dist: number[]; med: number;
  }>;
  subtopics: Array<{
    name: string; short: string; n: number; own: number; med: number; event: string; dist: number[];
  }>;
  dirs: Array<{
    dir: string; n: number; people: number; registered: number;
    cov: number; own: number; med: number; dist: number[];
  }>;
  byTime: Array<{ bucket: string; n: number; own: number; med: number }>;
  quotes: Array<{
    lvl: string; text: string; event: string; subtopic: string; direction: string;
  }>;
  quotesTotal?: number;
  daySeries: Array<{
    day: number; own: number | null; coveragePct: number | null; answers: number;
  }>;
  exportPath?: string;
};

function covTone(cov: number): 'bad' | 'warn' | 'ok' {
  if (cov < 60) return 'bad';
  if (cov < 72) return 'warn';
  return 'ok';
}

/**
 * Линза «После блоков» — присвоение материала программы.
 * GET /analytics/hub/after-blocks
 */
export function HubAfterBlocksScreen() {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<AfterBlocksData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qEvent, setQEvent] = useState('');
  const [qSub, setQSub] = useState('');
  const [qDir, setQDir] = useState('');
  const [quoteLimit, setQuoteLimit] = useState(24);

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
    adminFetch(`/analytics/hub/after-blocks?${params.toString()}`)
      .then(res => setData(res as AfterBlocksData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить осмысление');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const m = data?.meta;

  const filteredQuotes = useMemo(() => {
    if (!data) return [];
    return data.quotes.filter(q => {
      if (qEvent && q.event !== qEvent) return false;
      if (qSub && q.subtopic !== qSub) return false;
      if (qDir && q.direction !== qDir) return false;
      return true;
    });
  }, [data, qEvent, qSub, qDir]);

  const visibleQuotes = filteredQuotes.slice(0, quoteLimit);

  const takeawayConclusion = useMemo(() => {
    if (!data) return null;
    const transfer = data.levelDist.find(l => l.name === 'Перенос в практику')?.n ?? 0;
    const reaction = data.levelDist.find(l => l.name === 'Реакция')?.n ?? 0;
    const tot = data.meta.answers || 1;
    return afterBlocksNarr({
      answers: data.meta.answers,
      people: data.meta.people,
      coveragePct: data.meta.coveragePct,
      own: data.meta.own,
      medLen: data.meta.medLen,
      transferPct: data.meta.transferPct ?? Math.round((transfer / tot) * 100),
      reactionPct: data.meta.reactionPct ?? Math.round((reaction / tot) * 100),
      shortPct: data.meta.shortPct ?? 0,
      quotesN: data.quotesTotal ?? data.quotes.length,
    });
  }, [data]);

  return (
    <div className="adm-day-results">
      <DashScreenTitle
        title="Осмысление после блоков"
        hint={
          m
            ? `День ${m.day} · ${m.answers} текстов · ${m.people} участников · индекс присвоения ${m.own}%`
            : 'Дошло ли до практики — не «понравилось ли»'
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
            <button key={d} type="button" className={cls} onClick={() => setForumDay(String(d))}>
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
          <DayResultsSection
            title="Что дал день"
            note="Эта анкета отвечает не на «понравилось ли», а на «дошло ли до практики». Удовлетворённость — в итогах дня, здесь — присвоение."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: `${m.own}%`,
                  label: 'Индекс присвоения',
                  sub: 'перенос в практику + связь с собой',
                  accent: m.own < 15 ? '#b91c1c' : undefined,
                },
                {
                  value: `${Math.round(m.coveragePct)}%`,
                  label: 'Написали осмысление',
                  sub: `${m.people} из ${m.registered}`,
                },
                {
                  value: m.answers,
                  label: 'Текстов за день',
                  sub: m.subtopics ? `по ${m.subtopics} подтемам (от 20 ответов)` : undefined,
                },
                {
                  value: m.medLen,
                  label: 'Медиана длины, знаков',
                  sub: 'минимум 20 знаков отсекает формальный мусор',
                },
              ]}
            />
          </DayResultsSection>

          <DayResultsSection
            title="Глубина осмысления"
            note="Четыре уровня по речевым маркерам. Медиана длины рядом — быстрая проверка разметки: у переноса она должна быть выше, чем у реакции."
          >
            <DashCard>
              <StackBar
                items={data.levelDist.map(x => ({ name: x.name, n: x.n }))}
                colors={LEVELS.map(l => LEVEL_COLORS[l])}
              />
              {(() => {
                const tot = data.levelDist.reduce((a, x) => a + x.n, 0) || 1;
                return data.levelDist.map(x => (
                  <div key={x.name} className="adm-refl-lvrow">
                    <div className="adm-day-results-lb">
                      <i
                        style={{
                          display: 'inline-block',
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: LEVEL_COLORS[x.name],
                          marginRight: 8,
                        }}
                      />
                      {x.name}
                    </div>
                    <HBar widthPct={(x.n / tot) * 100} color={LEVEL_COLORS[x.name]} />
                    <div className="adm-refl-vl">
                      {((x.n / tot) * 100).toFixed(1)}%
                      <div className="adm-muted" style={{ fontSize: 11 }}>{x.med} зн.</div>
                    </div>
                  </div>
                ));
              })()}
              <div className="adm-day-results-callout">
                <b>Четыре ответа из пяти обычно — пересказ.</b>
                {' '}Так отвечают, когда вопрос звучит как «о чём было». Формулировка вопроса — самый дешёвый рычаг.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Карта программы: охват × присвоение"
            note="По горизонтали — число ответов по подтеме, по вертикали — доля присвоения. Линия — средний индекс дня. Подтемы от 20 ответов."
          >
            <DashCard>
              {data.subtopics.length === 0 ? (
                <p className="adm-muted">Пока нет подтем с 20+ ответами за выбранный день.</p>
              ) : (
                <div className="adm-refl-quad">
                  <div className="adm-refl-qtag" style={{ left: 12, top: 10 }}>
                    малый охват · высокое присвоение → масштабировать
                  </div>
                  <div className="adm-refl-qtag" style={{ right: 12, top: 10 }}>
                    массовое и работает → эталон
                  </div>
                  <div className="adm-refl-qtag" style={{ right: 12, bottom: 10 }}>
                    массовое, но не присваивается → переделать формат
                  </div>
                  {(() => {
                    const pts = data.subtopics;
                    const maxN = Math.max(...pts.map(p => p.n), 1);
                    const maxOwn = Math.max(...pts.map(p => p.own), m.own, 1) * 1.15;
                    return (
                      <>
                        <div
                          className="adm-refl-qline"
                          style={{ left: 0, right: 0, bottom: `${(m.own / maxOwn) * 100}%`, height: 1 }}
                        />
                        <div
                          className="adm-refl-qline"
                          style={{ top: 0, bottom: 0, left: '38%', width: 1, opacity: 0.6 }}
                        />
                        {pts.map(p => {
                          const x = 8 + (p.n / maxN) * 84;
                          const y = 6 + (p.own / maxOwn) * 84;
                          const col = p.own >= m.own ? '#57bd9c' : '#e2685e';
                          return (
                            <div key={`${p.event}-${p.name}`}>
                              <div
                                className="adm-refl-pt"
                                style={{
                                  left: `${x}%`,
                                  bottom: `${y}%`,
                                  background: col,
                                  boxShadow: `0 0 0 3px ${col}28`,
                                }}
                                title={`${p.name}: ${p.n} · ${p.own}%`}
                              />
                              <div
                                className="adm-refl-plb"
                                style={{ left: `${x}%`, bottom: `${Math.max(y - 4.6, 1)}%` }}
                              >
                                {p.short}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="adm-day-results-callout adm-day-results-callout-amber">
                <b>Инструментальные форматы обычно присваиваются лучше лекционных</b>
                {' '}при меньшем охвате. Массовые подтемы часто остаются на уровне тезиса.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="События программы"
            note="Доли считаются внутри события: один человек проходит несколько блоков."
          >
            <DashCard>
              {data.events.map(e => {
                const tot = e.dist.reduce((a, b) => a + b, 0) || 1;
                return (
                  <div key={e.event} style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5 }}>{e.event}</span>
                      <span className="adm-muted" style={{ fontSize: 12.5 }}>
                        {e.people} чел · медиана {e.med} зн ·{' '}
                        <b style={{ color: e.own >= 12 ? '#0f766e' : '#b91c1c' }}>{e.own}%</b>
                      </span>
                    </div>
                    <StackBar
                      items={LEVELS.map((name, i) => ({ name, n: e.dist[i] ?? 0 }))}
                      colors={LEVELS.map(l => LEVEL_COLORS[l])}
                    />
                    <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
                      n={tot}
                    </div>
                  </div>
                );
              })}
              <div className="adm-day-results-legend">
                {LEVELS.map(l => (
                  <span key={l}><i style={{ background: LEVEL_COLORS[l] }} />{l}</span>
                ))}
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Направления и момент ответа"
            note="Слева — кто как осмысляет. Справа — глубина в зависимости от времени написания."
          >
            <div className="adm-activity-grid2">
              <DashCard>
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Направление</th>
                        <th style={{ textAlign: 'center' }}>Охват</th>
                        <th style={{ textAlign: 'center' }}>Присвоение</th>
                        <th style={{ textAlign: 'center' }}>Медиана</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dirs.map(d => (
                        <tr key={d.dir}>
                          <td>
                            {d.dir}
                            <div className="adm-muted" style={{ fontSize: 11.5 }}>
                              {d.people} из {d.registered}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Flag tone={covTone(d.cov)}>{d.cov}%</Flag>
                          </td>
                          <td style={{
                            textAlign: 'center',
                            color: d.own >= 10 ? '#0f766e' : undefined,
                          }}>
                            {d.own}%
                          </td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">{d.med} зн.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashCard>
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  Когда написано осмысление
                </div>
                {(() => {
                  const tmx = Math.max(1, ...data.byTime.map(x => x.own));
                  return data.byTime.map(x => (
                    <div key={x.bucket} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.bucket}</div>
                        <HBar
                          widthPct={(x.own / tmx) * 100}
                          color={x.own >= 12 ? '#57bd9c' : '#6f7d95'}
                        />
                      </div>
                      <div className="adm-day-results-nb">
                        {x.own}%
                        <div className="adm-muted" style={{ fontSize: 11 }}>n={x.n}</div>
                      </div>
                    </div>
                  ));
                })()}
                <div className="adm-day-results-callout adm-day-results-callout-amber">
                  По горячим следам обычно глубже, чем вечером задним числом.
                  Окно ответа стоит открывать сразу после блока.
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Что именно уносят"
            note="Лента сильных ответов (перенос и связь с собой, длиннее 60 знаков). Рабочий материал для методистов."
          >
            <DashCard>
              <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', marginBottom: 12, gap: 8 }}>
                <label className="adm-insights-filter">
                  Событие
                  <select className="adm-input" value={qEvent} onChange={e => { setQEvent(e.target.value); setQSub(''); }}>
                    <option value="">Все</option>
                    {[...new Set(data.quotes.map(q => q.event))].map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </label>
                <label className="adm-insights-filter">
                  Подтема
                  <select className="adm-input" value={qSub} onChange={e => setQSub(e.target.value)}>
                    <option value="">Все</option>
                    {[...new Set(data.quotes.filter(q => !qEvent || q.event === qEvent).map(q => q.subtopic))].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="adm-insights-filter">
                  Направление
                  <select className="adm-input" value={qDir} onChange={e => setQDir(e.target.value)}>
                    <option value="">Все</option>
                    {[...new Set(data.quotes.map(q => q.direction))].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
              </div>
              {filteredQuotes.length === 0 ? (
                <p className="adm-muted">Нет цитат по выбранным фильтрам.</p>
              ) : (
                <>
                  {visibleQuotes.map((q, i) => (
                    <div
                      key={`${i}-${q.text.slice(0, 24)}`}
                      className="adm-state-quote"
                      style={{ borderLeftColor: LEVEL_COLORS[q.lvl] || '#57bd9c' }}
                    >
                      {q.text}
                      <span className="adm-state-quote-m">
                        {q.lvl} · {q.subtopic} · {q.direction}
                      </span>
                    </div>
                  ))}
                  {filteredQuotes.length > quoteLimit && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      style={{ marginTop: 10 }}
                      onClick={() => setQuoteLimit(n => Math.min(n + 24, filteredQuotes.length))}
                    >
                      Показать ещё ({filteredQuotes.length - quoteLimit})
                    </button>
                  )}
                </>
              )}
              <div className="adm-day-results-callout" style={{ borderLeftColor: '#6f7d95' }}>
                Ответы короче 60 знаков в ленту не попадают, но остаются в статистике.
                Разметка словарная — на 5–7 % выборки стоит проверить вручную.
              </div>
            </DashCard>
            {takeawayConclusion && <ConclusionCard c={takeawayConclusion} />}
          </DayResultsSection>

          <DayResultsSection
            title="Динамика по дням форума"
            note="Сквозная метрика — индекс присвоения. Он сравним между днями и не зависит от состава программы."
          >
            <DashCard>
              <div className="adm-day-results-dyn">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
                  const pt = data.daySeries.find(s => s.day === d);
                  const own = pt?.own;
                  const h = own != null ? Math.max(6, Math.round((own / 25) * 120)) : 6;
                  return (
                    <div key={d} className="adm-day-results-dyn-col">
                      <div
                        className="adm-day-results-dyn-bar"
                        style={{
                          height: h,
                          background: own != null
                            ? (d === selectedDay ? 'var(--m-accent)' : '#1F3A5F')
                            : 'var(--m-bg)',
                        }}
                      />
                      <div style={{ fontSize: 11, marginTop: 8 }} className={d === selectedDay ? '' : 'adm-muted'}>
                        {own != null ? `${own}%` : '—'}
                      </div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>Д{d}</div>
                    </div>
                  );
                })}
              </div>
              <div className="adm-day-results-callout" style={{ borderLeftColor: '#6f7d95' }}>
                К концу форума индекс присвоения должен расти, даже если охват падает.
                Если стоит на месте — участника не просят перевести услышанное в действие.
              </div>
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'after-blocks',
                  label: 'После блоков',
                  path: data.exportPath || `/exports/after-blocks?mode=day&day=${selectedDay}`,
                  filename: `after_blocks_d${selectedDay}.xlsx`,
                });
              }}
            >
              Скачать XLSX после блоков
            </button>
          </div>
        </>
      )}
    </div>
  );
}
