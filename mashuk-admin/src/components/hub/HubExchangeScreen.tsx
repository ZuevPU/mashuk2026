import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubDisplayDay, hubFilterParams, isAllForumDay } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
} from './dayResultsUi';

type ExchangeData = {
  meta: {
    day: number;
    questions: number;
    answers: number;
    people: number;
    registered: number;
    perQ: number;
    askers: number;
    answerers: number;
    both: number;
    legacy: number;
    rejected: number;
    shortAns: number;
    coveragePct: number;
    todayAnswers: number;
    peakAnswers: number;
    todayOtherPct: number;
    unanswered: number;
    unansweredPct: number;
    medFirstReplyMin: number | null;
    approved: number;
    expNonZero: number;
  };
  byDay: Array<{ day: number; date: string; q: number; a: number; other: number; people: number }>;
  catsLive: Array<{ key: string; name: string; n: number; sys: boolean }>;
  dirs: Array<{ dir: string; reg: number; people: number; cov: number; q: number; a: number }>;
  conc: {
    answerers: number; top10: number; top20: number; one: number; max: number; median: number;
  };
  ladder: Array<{ name: string; n: number }>;
  lenBins: Array<{ name: string; n: number }>;
  hours: Array<{ h: number; q: number; a: number }>;
  daySeries: Array<{ day: number; q: number | null; a: number | null }>;
  gaps: Array<{ title: string; text: string; tone: string }>;
  peakLabel?: string | null;
  exportPath?: string;
};

function covTone(cov: number): 'bad' | 'warn' | 'ok' {
  if (cov >= 24) return 'ok';
  if (cov >= 18) return 'warn';
  return 'bad';
}

/**
 * Линза «Обмен опытом» — живость площадки вопросов/ответов.
 * GET /analytics/hub/exchange
 */
export function HubExchangeScreen() {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<ExchangeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    adminFetch(`/analytics/hub/exchange?${params.toString()}`)
      .then(res => setData(res as ExchangeData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить обмен опытом');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const m = data?.meta;
  const todayRow = data?.byDay.find(d => d.day === selectedDay)
    ?? data?.byDay[data.byDay.length - 1];
  const peakA = data?.byDay.length
    ? data.byDay.reduce((best, d) => (d.a > best.a ? d : best), data.byDay[0])
    : null;

  return (
    <div className="adm-day-results">
      <DashScreenTitle
        title="Обмен опытом"
        hint={
          m
            ? `День ${m.day} · ${m.questions} вопросов · ${m.answers} ответов · охват ${Math.round(m.coveragePct)}%`
            : 'Живёт ли площадка сама — не заполняемость анкеты'
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
            title="Модуль сегодня"
            note="Обмен опытом — не анкета: его нельзя «назначить». Здесь измеряется, живёт ли площадка сама."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: m.perQ,
                  label: 'Ответов на один вопрос',
                  sub: `${m.answers} ответов на ${m.questions} вопросов`,
                },
                {
                  value: `${Math.round(m.coveragePct)}%`,
                  label: 'Заходили писать',
                  sub: `${m.people} из ${m.registered} участников`,
                },
                {
                  value: m.todayAnswers,
                  label: 'Ответов в выбранный день',
                  sub: peakA ? `пик был ${peakA.a} (${peakA.date})` : undefined,
                  accent: m.todayAnswers < m.peakAnswers * 0.25 ? '#b91c1c' : undefined,
                },
                {
                  value: `${todayRow?.other ?? m.todayOtherPct}%`,
                  label: 'Вопросов без категории за день',
                  sub: m.legacy ? `в архиве «Другое» — ${m.legacy}` : 'рубрикатор на новых вопросах',
                  accent: (todayRow?.other ?? m.todayOtherPct) > 10 ? '#b91c1c' : '#0f766e',
                },
              ]}
            />
            {(m.unansweredPct > 0 || m.medFirstReplyMin != null) && (
              <div className="adm-day-results-callout adm-day-results-callout-amber" style={{ marginTop: 12 }}>
                <b>Здоровье площадки:</b>
                {' '}без ответа {m.unanswered} из {m.approved} одобренных ({m.unansweredPct}%)
                {m.medFirstReplyMin != null ? ` · медиана до первого ответа ${m.medFirstReplyMin} мин` : ''}
              </div>
            )}
          </DayResultsSection>

          <DayResultsSection
            title="Модуль затухает"
            note="Вопросы и ответы по дням — главный график. Накопительный итог скрыл бы падение."
          >
            <DashCard>
              {(() => {
                const amax = Math.max(1, ...data.byDay.map(d => Math.max(d.a, d.q)));
                return (
                  <div className="adm-exch-flow">
                    {data.byDay.map(d => (
                      <div key={d.day} className="adm-exch-fcol">
                        <div className="adm-exch-fbars">
                          <div
                            style={{ height: `${(d.q / amax) * 170}px`, background: '#79b8c9' }}
                            title={`вопросы: ${d.q}`}
                          />
                          <div
                            style={{ height: `${(d.a / amax) * 170}px`, background: '#e6ae4a' }}
                            title={`ответы: ${d.a}`}
                          />
                        </div>
                        <div className="adm-muted" style={{ fontSize: 12, marginTop: 10 }}>
                          {d.q} вопр · {d.a} отв
                        </div>
                        <div className="adm-muted" style={{ fontSize: 12 }}>
                          {d.date} · {d.people} чел
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="adm-day-results-legend">
                <span><i style={{ background: '#79b8c9' }} />вопросы</span>
                <span><i style={{ background: '#e6ae4a' }} />ответы</span>
              </div>
              <div className="adm-day-results-callout">
                <b>Площадка умирает без вопросов, а не без отвечающих.</b>
                {' '}Управлять надо потоком новых вопросов: поводы после блоков, вопрос дня, разбор на общем сборе.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Рубрикатор категорий"
            note="Доля «Другое» считается по дате создания — архив до релиза и новые вопросы не смешиваются."
          >
            <div className="adm-activity-grid2">
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  Доля «Другое» по дням
                </div>
                {data.byDay.map(d => (
                  <div key={d.day} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{d.date} · {d.q} вопросов</div>
                      <HBar
                        widthPct={d.other}
                        color={d.other > 50 ? '#e2685e' : d.other > 10 ? '#e6ae4a' : '#57bd9c'}
                      />
                    </div>
                    <div className="adm-day-results-nb">{d.other}%</div>
                  </div>
                ))}
                <div className="adm-day-results-callout" style={{ borderLeftColor: '#57bd9c' }}>
                  <b>Критерий приёмки — other ≤ 10 % на новых вопросах.</b>
                  {' '}Архив в «Другое» ({m.legacy}) доразмечается очередью модерации.
                </div>
              </DashCard>
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  Распределение размеченных вопросов
                </div>
                {(() => {
                  const lmx = Math.max(1, ...data.catsLive.map(x => x.n));
                  return data.catsLive.map(x => (
                    <div key={x.key} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.name}</div>
                        <HBar
                          widthPct={(x.n / lmx) * 100}
                          color={x.key === 'smalltalk' ? '#c98fb0' : '#e6ae4a'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{x.n}</div>
                    </div>
                  ));
                })()}
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Кто здесь есть"
            note="Спрашивать и отвечать — разные роли: рост отвечающих не компенсирует нехватку вопросов."
          >
            <DashCard>
              <div className="adm-exch-roles">
                <div className="adm-exch-role">
                  <div className="adm-exch-role-v" style={{ color: '#79b8c9' }}>{m.askers}</div>
                  <div className="adm-muted" style={{ fontSize: 12 }}>задавали вопросы</div>
                </div>
                <div className="adm-exch-role">
                  <div className="adm-exch-role-v" style={{ color: '#57bd9c' }}>{m.both}</div>
                  <div className="adm-muted" style={{ fontSize: 12 }}>и спрашивали, и отвечали</div>
                </div>
                <div className="adm-exch-role">
                  <div className="adm-exch-role-v" style={{ color: '#e6ae4a' }}>{m.answerers}</div>
                  <div className="adm-muted" style={{ fontSize: 12 }}>отвечали</div>
                </div>
                <div className="adm-exch-role">
                  <div className="adm-exch-role-v adm-muted">{m.registered - m.people}</div>
                  <div className="adm-muted" style={{ fontSize: 12 }}>не заходили ни разу</div>
                </div>
              </div>
              <div className="adm-activity-grid2" style={{ marginTop: 16 }}>
                <div>
                  <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                    Сколько ответов написал человек
                  </div>
                  {(() => {
                    const wmx = Math.max(1, ...data.ladder.map(x => x.n));
                    return data.ladder.map((x, i) => (
                      <div key={x.name} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">{x.name}</div>
                          <HBar
                            widthPct={(x.n / wmx) * 100}
                            color={i === 0 ? '#e2685e' : i === 3 ? '#57bd9c' : '#6f7d95'}
                          />
                        </div>
                        <div className="adm-day-results-nb">{x.n}</div>
                      </div>
                    ));
                  })()}
                </div>
                <div>
                  <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                    Концентрация
                  </div>
                  <div className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">Верхние 10 отвечающих</div>
                      <HBar widthPct={data.conc.top10} color="#c98fb0" />
                    </div>
                    <div className="adm-day-results-nb">{data.conc.top10}%</div>
                  </div>
                  <div className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">Верхние 20</div>
                      <HBar widthPct={data.conc.top20} color="#c98fb0" />
                    </div>
                    <div className="adm-day-results-nb">{data.conc.top20}%</div>
                  </div>
                  <div className="adm-day-results-callout adm-day-results-callout-amber">
                    Медиана — {data.conc.median}, максимум — {data.conc.max}.
                    Одноразовых отвечающих — {data.conc.one}.
                  </div>
                </div>
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Качество ответов"
            note="Короткие ответы — реакции, а не содержание. Порог длины из ТЗ закрывает этот класс."
          >
            <div className="adm-activity-grid2">
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>Длина ответа</div>
                {(() => {
                  const qmx = Math.max(1, ...data.lenBins.map(x => x.n));
                  return data.lenBins.map((x, i) => (
                    <div key={x.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.name}</div>
                        <HBar
                          widthPct={(x.n / qmx) * 100}
                          color={i === 0 ? '#e2685e' : i === 3 ? '#57bd9c' : '#6f7d95'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{x.n}</div>
                    </div>
                  ));
                })()}
                <div className="adm-day-results-callout">
                  <b>{m.shortAns}% ответов короче 20 знаков.</b>
                  {' '}Это реакции, а не ответы.
                </div>
              </DashCard>
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>Направления</div>
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Направление</th>
                        <th style={{ textAlign: 'center' }}>Охват</th>
                        <th style={{ textAlign: 'center' }}>Вопросов</th>
                        <th style={{ textAlign: 'center' }}>Ответов</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dirs.map(d => (
                        <tr key={d.dir}>
                          <td>
                            {d.dir}
                            <div className="adm-muted" style={{ fontSize: 11.5 }}>
                              {d.people} из {d.reg}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Flag tone={covTone(d.cov)}>{d.cov}%</Flag>
                          </td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">{d.q}</td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">{d.a}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Когда пишут"
            note="Обмен опытом живёт днём, между блоками — как копилка. Вечерние напоминания сюда не работают."
          >
            <DashCard>
              {(() => {
                const hours = Array.from({ length: 24 }, (_, h) => {
                  const found = data.hours.find(x => x.h === h);
                  return { h, q: found?.q ?? 0, a: found?.a ?? 0 };
                });
                const hmx = Math.max(1, ...hours.map(h => h.q + h.a));
                return (
                  <div className="adm-state-hist">
                    {hours.map(h => {
                      const tot = h.q + h.a;
                      return (
                        <div key={h.h}>
                          <div className="adm-piggy-hour" style={{ height: `${(tot / hmx) * 100}px` }}>
                            {h.a > 0 && <div style={{ flex: h.a, background: '#e6ae4a' }} />}
                            {h.q > 0 && <div style={{ flex: h.q, background: '#79b8c9' }} />}
                          </div>
                          <div className="adm-state-hist-x">{String(h.h).padStart(2, '0')}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="adm-day-results-legend">
                <span><i style={{ background: '#79b8c9' }} />вопросы</span>
                <span><i style={{ background: '#e6ae4a' }} />ответы</span>
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Пробелы и здоровье данных"
            note="Что панель видит и где ещё есть риск расхождения с другими инструментами."
          >
            <DashCard>
              {data.gaps.map(r => (
                <div key={r.title} className="adm-state-rule">
                  <div
                    className="adm-state-rule-w"
                    style={{ color: r.tone === 'bad' ? '#b91c1c' : r.tone === 'ok' ? '#0f766e' : '#b45309' }}
                  >
                    {r.title}
                  </div>
                  <div>{r.text}</div>
                </div>
              ))}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Динамика по дням форума"
            note="Новые вопросы за день, не накопленный итог."
          >
            <DashCard>
              <div className="adm-day-results-dyn">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
                  const pt = data.daySeries.find(s => s.day === d);
                  const q = pt?.q;
                  const qm = Math.max(1, ...data.daySeries.map(s => s.q ?? 0));
                  const h = q != null ? Math.max(4, Math.round((q / qm) * 120)) : 6;
                  return (
                    <div key={d} className="adm-day-results-dyn-col">
                      <div
                        className="adm-day-results-dyn-bar"
                        style={{
                          height: h,
                          background: q != null
                            ? (d === selectedDay ? 'var(--m-accent)' : '#1F3A5F')
                            : 'var(--m-bg)',
                        }}
                      />
                      <div style={{ fontSize: 11, marginTop: 8 }} className={d === selectedDay ? '' : 'adm-muted'}>
                        {q != null ? q : '—'}
                      </div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>Д{d}</div>
                    </div>
                  );
                })}
              </div>
              <div className="adm-day-results-callout" style={{ borderLeftColor: '#6f7d95' }}>
                Здоровый сценарий — ровный поток 15–25 вопросов в день, а не всплеск на старте.
              </div>
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'exchange',
                  label: 'Обмен опытом',
                  path: data.exportPath || '/exports/exchange?format=xlsx',
                  filename: `exchange_d${selectedDay}.xlsx`,
                });
              }}
            >
              Скачать XLSX обмена опытом
            </button>
          </div>
        </>
      )}
    </div>
  );
}
