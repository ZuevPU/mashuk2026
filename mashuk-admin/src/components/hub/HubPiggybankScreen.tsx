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
import { HubLensLayout, type HubNavItem } from './HubSideNav';

const TAG_COLORS: Record<string, string> = {
  'мысль': '#6f7d95',
  'вопрос': '#79b8c9',
  'идея': '#e6ae4a',
  'в работу': '#57bd9c',
  'на будущее': '#8fb98a',
  'контакт': '#c98fb0',
};

const FUNNEL_COLORS = ['#6f7d95', '#e6ae4a', '#57bd9c', '#c98fb0'];

type PiggyData = {
  meta: {
    day: number;
    records: number;
    manual: number;
    auto: number;
    people: number;
    peopleManual: number;
    registered: number;
    medManual: number;
    medAuto: number;
    coveragePct: number;
    actionShare: number;
    returnedShare: number;
  };
  tagsManual: Array<{ tag: string; n: number; med: number }>;
  tagsAuto: Array<{ tag: string; n: number }>;
  funnel: Array<{ name: string; n: number }>;
  sources: Array<{ src: string; n: number; people: number; act: number; med: number }>;
  concentration: {
    people: number; one: number; top10: number; top20: number; median: number; max: number;
  };
  ladder: Array<{ name: string; n: number }>;
  dirs: Array<{
    dir: string; reg: number; people: number; cov: number;
    n: number; manual: number; perPerson: number; act: number;
  }>;
  hours: Array<{ h: number; manual: number; auto: number }>;
  privacy: Array<{ title: string; text: string }>;
  daySeries: Array<{
    day: number; coveragePct: number | null; returnedShare: number | null; actionShare: number | null;
  }>;
  exportPath?: string;
};

function actTone(act: number): 'bad' | 'warn' | 'ok' {
  if (act >= 50) return 'ok';
  if (act >= 30) return 'warn';
  return 'bad';
}

function covTone(cov: number): 'bad' | 'warn' | 'ok' {
  if (cov >= 25) return 'ok';
  if (cov >= 15) return 'warn';
  return 'bad';
}

/**
 * Линза «Копилка» — охват и удержание добровольного инструмента.
 * GET /analytics/hub/piggybank · тексты заметок не выводятся.
 */
const PIGGY_NAV: HubNavItem[] = [
  { id: 'hub-piggy-overview', label: 'Обзор' },
  { id: 'hub-piggy-tools', label: 'Инструменты' },
  { id: 'hub-piggy-transfer', label: 'Перенос' },
  { id: 'hub-piggy-sources', label: 'Источники' },
  { id: 'hub-piggy-who', label: 'Кто' },
  { id: 'hub-piggy-when', label: 'Когда' },
  { id: 'hub-piggy-access', label: 'Доступ' },
  { id: 'hub-piggy-dynamics', label: 'Динамика' },
];

export function HubPiggybankScreen() {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<PiggyData | null>(null);
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
    adminFetch(`/analytics/hub/piggybank?${params.toString()}`)
      .then(res => setData(res as PiggyData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить копилку');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const m = data?.meta;
  const c = data?.concentration;

  return (
    <HubLensLayout className="adm-day-results" items={PIGGY_NAV} navLabel="Разделы копилки">
      <DashScreenTitle
        title="Копилка"
        hint={
          m
            ? `День ${m.day} · ${m.records} записей · ${m.people} участников · тексты в панель не выводятся`
            : 'Дашборд использования инструмента · тексты участников не показываются'
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

      {data && m && c && (
        <>
          <DayResultsSection
            id="hub-piggy-overview"
            title="Как пользуются копилкой"
            note="Копилка — единственный добровольный инструмент форума. Метрика здесь не объём, а охват и удержание."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: `${Math.round(m.coveragePct)}%`,
                  label: 'Завели хотя бы одну запись',
                  sub: `${m.people} из ${m.registered} участников`,
                  accent: m.coveragePct < 25 ? '#b91c1c' : undefined,
                },
                {
                  value: m.manual,
                  label: 'Собственных заметок',
                  sub: `плюс ${m.auto} сохранённых материалов программы`,
                },
                {
                  value: `${c.one}%`,
                  label: 'Написали одну запись и ушли',
                  sub: `медиана — ${c.median} на человека`,
                  accent: '#b91c1c',
                },
                {
                  value: `${c.top10}%`,
                  label: 'Всех заметок дают 10 человек',
                  sub: `максимум у одного — ${c.max}`,
                },
              ]}
            />
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-tools"
            title="В таблице лежат два разных инструмента"
            note="Часть записей — не текст участника, а автоматически сохранённый материал программы. Их нельзя считать вместе с заметками."
          >
            <DashCard>
              {m.records > 0 && (
                <div className="adm-piggy-split">
                  <div
                    style={{
                      width: `${(m.manual / m.records) * 100}%`,
                      background: '#e6ae4a',
                    }}
                  >
                    заметки — {m.manual}
                  </div>
                  <div
                    style={{
                      width: `${(m.auto / m.records) * 100}%`,
                      background: '#6f7d95',
                    }}
                  >
                    материалы — {m.auto}
                  </div>
                </div>
              )}
              <div className="adm-activity-grid2">
                <div>
                  <div className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                    Теги в заметках участников
                  </div>
                  {(() => {
                    const mmx = Math.max(1, ...data.tagsManual.map(x => x.n));
                    return data.tagsManual.map(x => (
                      <div key={x.tag} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">{x.tag}</div>
                          <HBar widthPct={(x.n / mmx) * 100} color={TAG_COLORS[x.tag] || '#6f7d95'} />
                        </div>
                        <div className="adm-day-results-nb">{x.n}</div>
                      </div>
                    ));
                  })()}
                </div>
                <div>
                  <div className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                    Теги в сохранённых материалах
                  </div>
                  {(() => {
                    const amx = Math.max(1, ...data.tagsAuto.map(x => x.n));
                    return data.tagsAuto.map(x => (
                      <div key={x.tag} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">{x.tag}</div>
                          <HBar
                            widthPct={x.n ? (x.n / amx) * 100 : 0}
                            color={TAG_COLORS[x.tag] || '#6f7d95'}
                          />
                        </div>
                        <div className="adm-day-results-nb">{x.n}</div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <div className="adm-day-results-callout">
                <b>«На будущее» в сырых данных часто — артефакт автосохранения.</b>
                {' '}Реальных отложенных планов руками — {data.tagsManual.find(t => t.tag === 'на будущее')?.n ?? 0}.
                {' '}Медиана длины: {m.medManual} знаков у заметок против {m.medAuto} у автозаписей.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-transfer"
            title="От наблюдения к переносу"
            note="Лестница присвоения только по собственным заметкам."
          >
            <DashCard>
              {(() => {
                const fmx = Math.max(1, ...data.funnel.map(f => f.n));
                const ftot = data.funnel.reduce((a, f) => a + f.n, 0) || 1;
                return data.funnel.map((f, i) => (
                  <div key={f.name} className="adm-piggy-fstep">
                    <div className="adm-day-results-lb">{f.name}</div>
                    <div
                      className="adm-piggy-fbar"
                      style={{
                        width: `${Math.max((f.n / fmx) * 100, 6)}%`,
                        background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                      }}
                    >
                      {Math.round((f.n / ftot) * 100)}%
                    </div>
                    <div className="adm-day-results-nb">{f.n}</div>
                  </div>
                ));
              })()}
              <div className="adm-day-results-callout adm-day-results-callout-amber">
                <b>Сеть почти не фиксируется.</b>
                {' '}«Познакомиться» — частая ценность форума в анкетах, а тег «контакт» ставится редко:
                инструмент не подсказывает, что знакомство тоже можно сохранить.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-sources"
            title="Откуда приходит материал"
            note="Доля с действием — теги «в работу» или «на будущее». Какие форматы дают задел, а не впечатление."
          >
            <DashCard>
              <div className="adm-day-results-scroll">
                <table className="adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Источник</th>
                      <th style={{ textAlign: 'center' }}>Заметок</th>
                      <th style={{ textAlign: 'center' }}>Авторов</th>
                      <th style={{ textAlign: 'center' }}>С действием</th>
                      <th style={{ textAlign: 'center' }}>Медиана</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map(s => (
                      <tr key={s.src}>
                        <td>{s.src}</td>
                        <td style={{ textAlign: 'center' }}>{s.n}</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{s.people}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Flag tone={actTone(s.act)}>{s.act}%</Flag>
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{s.med} зн.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="adm-day-results-callout adm-day-results-callout-amber">
                Работа в направлении обычно даёт больше половины заметок.
                Клубы и открытые уроки часто почти не доходят до копилки.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-who"
            title="Кто пользуется"
            note="Слева — лестница удержания. Справа — охват по направлениям."
          >
            <div className="adm-activity-grid2">
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  Сколько заметок сделал участник
                </div>
                {(() => {
                  const lmx = Math.max(1, ...data.ladder.map(x => x.n));
                  return data.ladder.map((x, i) => (
                    <div key={x.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.name}</div>
                        <HBar
                          widthPct={(x.n / lmx) * 100}
                          color={i === 0 ? '#e2685e' : i === 3 ? '#57bd9c' : '#6f7d95'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{x.n}</div>
                    </div>
                  ));
                })()}
                <div className="adm-day-results-callout">
                  Половина открывших часто не возвращается. Сюда стоит одно напоминание
                  с конкретным поводом — после блока, после разговора, перед отбоем.
                </div>
              </DashCard>
              <DashCard>
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Направление</th>
                        <th style={{ textAlign: 'center' }}>Охват</th>
                        <th style={{ textAlign: 'center' }}>Заметок на автора</th>
                        <th style={{ textAlign: 'center' }}>С действием</th>
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
                          <td style={{ textAlign: 'center' }} className="adm-muted">{d.perPerson}</td>
                          <td style={{ textAlign: 'center' }}>{d.act}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="adm-day-results-callout adm-day-results-callout-amber">
                  Если ни одно направление не переходит 20 % — это общий уровень знания об инструменте, а не разница треков.
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-when"
            title="Когда записывают"
            note="Единственный инструмент, который живёт весь день, а не в окне вечерней анкеты."
          >
            <DashCard>
              {(() => {
                const hours = Array.from({ length: 24 }, (_, h) => {
                  const found = data.hours.find(x => x.h === h);
                  return { h, manual: found?.manual ?? 0, auto: found?.auto ?? 0 };
                });
                const hmx = Math.max(1, ...hours.map(h => h.manual + h.auto));
                return (
                  <div className="adm-state-hist">
                    {hours.map(h => {
                      const tot = h.manual + h.auto;
                      const height = (tot / hmx) * 100;
                      return (
                        <div key={h.h}>
                          <div className="adm-piggy-hour" style={{ height: `${height}px` }}>
                            {h.manual > 0 && (
                              <div style={{ flex: h.manual, background: '#e6ae4a' }} />
                            )}
                            {h.auto > 0 && (
                              <div style={{ flex: h.auto, background: '#6f7d95' }} />
                            )}
                          </div>
                          <div className="adm-state-hist-x">{String(h.h).padStart(2, '0')}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="adm-day-results-legend">
                <span><i style={{ background: '#e6ae4a' }} />заметки</span>
                <span><i style={{ background: '#6f7d95' }} />материалы</span>
              </div>
              <div className="adm-day-results-callout" style={{ borderLeftColor: '#6f7d95' }}>
                Пики обычно на переходах между блоками. Напоминание в вечерней рассылке приходит не вовремя —
                лучше сразу после блока.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-access"
            title="Границы доступа"
            note="Участник пишет копилку для себя, а не для организаторов. От этого зависит, что можно выводить в админку."
          >
            <DashCard>
              {data.privacy.map(r => (
                <div key={r.title} className="adm-state-rule">
                  <div className="adm-state-rule-w">{r.title}</div>
                  <div>{r.text}</div>
                </div>
              ))}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-piggy-dynamics"
            title="Динамика по дням форума"
            note="Охват, доля вернувшихся и доля заметок с действием. Объём записей в динамику не идёт."
          >
            <DashCard>
              <div className="adm-day-results-dyn">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
                  const pt = data.daySeries.find(s => s.day === d);
                  const cov = pt?.coveragePct;
                  const h = cov != null ? Math.max(6, Math.round((cov / 40) * 120)) : 6;
                  return (
                    <div key={d} className="adm-day-results-dyn-col">
                      <div
                        className="adm-day-results-dyn-bar"
                        style={{
                          height: h,
                          background: cov != null
                            ? (d === selectedDay ? 'var(--m-accent)' : '#1F3A5F')
                            : 'var(--m-bg)',
                        }}
                      />
                      <div style={{ fontSize: 11, marginTop: 8 }} className={d === selectedDay ? '' : 'adm-muted'}>
                        {cov != null ? `${Math.round(cov)}%` : '—'}
                      </div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>Д{d}</div>
                    </div>
                  );
                })}
              </div>
              <div className="adm-day-results-callout" style={{ borderLeftColor: '#6f7d95' }}>
                Здоровый сценарий: охват растёт первые дни и выходит на плато, доля вернувшихся растёт до конца.
                Если охват стоит на месте к пятому дню — про копилку просто не знают.
              </div>
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'piggybank',
                  label: 'Копилка',
                  path: data.exportPath || '/exports/piggybank?format=xlsx',
                  filename: `piggybank_d${selectedDay}.xlsx`,
                });
              }}
            >
              Скачать XLSX копилки
            </button>
          </div>
        </>
      )}
    </HubLensLayout>
  );
}
