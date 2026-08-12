import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubDisplayDay, hubFilterParams, isAllForumDay } from './hubQuery';
import type { HubLens } from './HubTab';
import {
  DayResultsSection,
  Flag,
  HBar,
} from './dayResultsUi';
import { HubLensLayout, type HubNavItem } from './HubSideNav';

const ZONE_COLORS: Record<string, string> = {
  'Подъём': '#57bd9c',
  'Включение': '#79b8c9',
  'Нейтраль': '#6f7d95',
  'Усталость': '#e6ae4a',
  'Риск': '#e2685e',
};

type StatsData = {
  meta: {
    day: number;
    now: string;
    nowLabel: string;
    people: number;
    registered: number;
    peoplePct: number;
    answerRows: number;
    perPerson: number;
    empty: number;
    published: number;
    openSlots: number;
    zoneMarks: number;
    riskPct: number;
    fatiguePct: number;
  };
  slots: Array<{ id: number; tool: string; title: string; status: 'ok' | 'empty' | 'wait' }>;
  tools: Array<{
    key: string; name: string; note: string; q: number; a: number; wait: number; empty: number;
  }>;
  zones: Array<{ key: string; name: string; n: number; pct: number }>;
  deadZones: Array<{ name: string; n: number; note: string }>;
  recon: Array<{
    m: string; stat: number; src: number; srcNote: string; diff: number; tone: 'ok' | 'warn' | 'bad';
  }>;
  nav: Array<{ lens: HubLens; title: string; sub: string; metric: string }>;
  worstDir: { dir: string; cov: number; people: number; reg: number } | null;
  gaps: Array<{ title: string; text: string; tone: string }>;
  daySeries: Array<{
    day: number;
    peoplePct: number | null;
    empty: number | null;
    riskFatiguePct: number | null;
  }>;
  callout: string;
  exportPath?: string;
};

/**
 * Линза «Статистика» — пульт дня: всё ли, что открыли, собрало ответы.
 * GET /analytics/hub/stats
 */
const STATS_NAV: HubNavItem[] = [
  { id: 'hub-stats-overview', label: 'Обзор' },
  { id: 'hub-stats-slots', label: 'Слоты' },
  { id: 'hub-stats-zones', label: 'Зоны' },
  { id: 'hub-stats-reconcile', label: 'Сверка' },
  { id: 'hub-stats-next', label: 'Дальше' },
  { id: 'hub-stats-gaps', label: 'Пробелы' },
  { id: 'hub-stats-dynamics', label: 'Динамика' },
];

export function HubStatsScreen({
  onLensChange,
}: {
  onLensChange: (l: HubLens) => void;
}) {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<StatsData | null>(null);
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
    adminFetch(`/analytics/hub/stats?${params.toString()}`)
      .then(res => setData(res as StatsData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить статистику дня');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const m = data?.meta;
  const zoneMax = data?.zones.length
    ? Math.max(...data.zones.map(z => z.n), 1)
    : 1;

  return (
    <HubLensLayout className="adm-day-results" items={STATS_NAV} navLabel="Разделы статистики">
      <DashScreenTitle
        title="Статистика дня"
        hint={
          m
            ? `День ${m.day} · срез ${m.nowLabel} · пульт: всё ли, что открыли, собрало ответы`
            : 'Верхний экран Штаба — маршрутизация по инструментам дня'
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
      {err && <p className="adm-error">{err}</p>}

      {m && (
        <>
          <DayResultsSection
            id="hub-stats-overview"
            title="День собран на"
            note="Эта панель отвечает не на вопрос «как прошёл день», а на вопрос «всё ли, что мы открыли, собрало ответы»."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: `${Math.round(m.peoplePct)}%`,
                  label: 'Участников с ответами',
                  sub: `${m.people} из ${m.registered}`,
                },
                {
                  value: m.answerRows.toLocaleString('ru'),
                  label: 'Строк ответов за день',
                  sub: `${m.perPerson} на человека`,
                },
                {
                  value: `${m.empty} из ${m.openSlots}`,
                  label: 'Вопросов без единого ответа',
                  sub: 'на момент среза · серые окна не считаем',
                  accent: m.empty > 4 ? '#e2685e' : undefined,
                },
                {
                  value: String(m.openSlots),
                  label: 'Точек осмысления открыто',
                  sub: `из ${m.published} опубликованных`,
                },
              ]}
            />
            {data?.worstDir && (
              <p className="adm-day-results-callout adm-day-results-callout-amber" style={{ marginTop: 12 }}>
                <b>Худшее направление дня — {data.worstDir.dir}.</b>
                {' '}Охват {data.worstDir.cov}% ({data.worstDir.people} из {data.worstDir.reg}).
              </p>
            )}
          </DayResultsSection>

          <DayResultsSection
            id="hub-stats-slots"
            title="Что открыто и что собрало ответы"
            note="Каждый квадрат — опубликованный вопрос дня. Зелёный собрал ответы, красный — пустой, серый ждёт своего окна."
          >
            <DashCard>
              <div className="adm-stats-slots" aria-label="Сетка слотов">
                {(data?.slots ?? []).map(s => (
                  <div
                    key={s.id}
                    className={`adm-stats-slot adm-stats-slot-${s.status}`}
                    title={`${s.title} · ${s.status === 'ok' ? 'есть ответы' : s.status === 'wait' ? 'ждёт окна' : 'пусто'}`}
                  >
                    {s.status === 'ok' ? '✓' : s.status === 'wait' ? '·' : '—'}
                  </div>
                ))}
              </div>
              {(data?.tools ?? []).map(t => {
                const filled = t.q ? (t.a / t.q) * 100 : 0;
                const rest = 100 - filled;
                return (
                  <div key={t.key} className="adm-stats-tool">
                    <div>
                      <div className="adm-stats-tool-nm">{t.name}</div>
                      <div className="adm-stats-tool-ds">{t.note}</div>
                    </div>
                    <div className="adm-stats-tool-bar">
                      {t.q ? (
                        <>
                          <div style={{ width: `${filled}%`, background: '#57bd9c' }}>
                            {t.a || ''}
                          </div>
                          <div
                            style={{
                              width: `${rest}%`,
                              background: t.wait > 0 ? '#6f7d95' : '#e2685e',
                              opacity: 0.55,
                            }}
                          >
                            {t.q - t.a || ''}
                          </div>
                        </>
                      ) : (
                        <div style={{ width: '100%', background: 'var(--m-bg)' }} />
                      )}
                    </div>
                    <div className="adm-stats-tool-vl">
                      {t.q ? `${t.a} из ${t.q}` : 'не открывали'}
                    </div>
                  </div>
                );
              })}
              {data?.callout && (
                <p className="adm-day-results-callout" style={{ borderLeftColor: '#e2685e' }}>
                  <b>{data.callout}</b>
                  {' '}Пустой вопрос занимает слот в программе и приучает не заходить.
                </p>
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-stats-zones"
            title="Эмоциональные зоны дня"
            note="Пять рабочих зон в долях от всех отметок состояния. Мёртвые счётчики старой модели — отдельно."
          >
            <div className="adm-stats-grid2">
              <DashCard title="Все зоны за день">
                {(data?.zones ?? []).map(z => (
                  <div key={z.key} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">
                        {z.name}
                        <span className="adm-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                          {z.pct}%
                        </span>
                      </div>
                      <HBar widthPct={(z.n / zoneMax) * 100} color={ZONE_COLORS[z.name] || '#6f7d95'} />
                    </div>
                    <div className="adm-day-results-nb">{z.n}</div>
                  </div>
                ))}
                <p className="adm-muted" style={{ marginTop: 10, fontSize: 12 }}>
                  База: {m.zoneMarks} отметок состояния
                </p>
              </DashCard>
              <DashCard title="Мёртвые счётчики">
                {(data?.deadZones ?? []).map(z => (
                  <div key={z.name} className="adm-stats-gap">
                    <div className="adm-stats-gap-w">{z.name}</div>
                    <div>{z.note}. В сводке всегда 0 — в системе таких зон нет.</div>
                  </div>
                ))}
                <p className="adm-day-results-callout adm-day-results-callout-amber" style={{ marginTop: 12 }}>
                  Риск {m.riskPct}% · усталость {m.fatiguePct}% — уже с знаменателем.
                </p>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            id="hub-stats-reconcile"
            title="Сверка с первичными выгрузками"
            note="Сводка и панели должны считать по одному определению — иначе штаб перестанет доверять обоим."
          >
            <DashCard>
              <div className="adm-day-results-scroll">
                <table className="adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Показатель</th>
                      <th style={{ textAlign: 'center' }}>В сводке</th>
                      <th style={{ textAlign: 'center' }}>По источникам</th>
                      <th style={{ textAlign: 'center' }}>Разница</th>
                      <th>Источник</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recon ?? []).map(r => (
                      <tr key={r.m}>
                        <td>{r.m}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          {r.stat.toLocaleString('ru')}
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">
                          {r.src.toLocaleString('ru')}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Flag tone={r.tone}>
                            {r.diff > 0 ? '+' : ''}{r.diff}
                          </Flag>
                        </td>
                        <td className="adm-muted" style={{ fontSize: 12 }}>{r.srcNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-stats-next"
            title="Куда идти дальше"
            note="Каждая плитка ведёт на свою панель с уже наложенным фильтром дня. Числа — из тех же расчётов, что внутри панелей."
          >
            <div className="adm-stats-nav">
              {(data?.nav ?? []).map(n => (
                <button
                  key={n.lens}
                  type="button"
                  className="adm-stats-navc"
                  onClick={() => onLensChange(n.lens)}
                >
                  <div className="adm-stats-navc-t">{n.title}</div>
                  <div className="adm-stats-navc-m">{n.sub}</div>
                  <div className="adm-stats-navc-k">{n.metric}</div>
                </button>
              ))}
            </div>
          </DayResultsSection>

          <DayResultsSection id="hub-stats-gaps" title="Чего не хватает / контроль пробелов">
            <DashCard>
              {(data?.gaps ?? []).map(g => (
                <div key={g.title} className="adm-stats-gap">
                  <div className="adm-stats-gap-w">{g.title}</div>
                  <div>{g.text}</div>
                </div>
              ))}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-stats-dynamics"
            title="Динамика по дням форума"
            note="Доля участников с ответами, число пустых вопросов и доля усталости+риска."
          >
            <DashCard>
              <div className="adm-day-results-dyn">
                {(data?.daySeries ?? []).map(d => {
                  const on = d.day === selectedDay;
                  const h = d.peoplePct != null ? Math.max(6, Math.round((d.peoplePct / 100) * 120)) : 6;
                  return (
                    <button
                      key={d.day}
                      type="button"
                      className="adm-day-results-dyn-col"
                      onClick={() => setForumDay(String(d.day))}
                    >
                      <div
                        className="adm-day-results-dyn-bar"
                        style={{
                          height: h,
                          background: on ? '#e6ae4a' : 'var(--m-bg)',
                        }}
                      />
                      <div style={{ fontSize: 11, marginTop: 8, color: on ? 'var(--m-text)' : 'var(--m-text-secondary)' }}>
                        {d.peoplePct != null ? `${Math.round(d.peoplePct)}%` : '—'}
                      </div>
                      <div className="adm-muted" style={{ fontSize: 11 }}>
                        Д{d.day}
                        {d.empty != null ? ` · пуст. ${d.empty}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="adm-day-results-callout" style={{ borderLeftColor: '#6f7d95' }}>
                Число пустых вопросов — самая полезная метрика этой панели в динамике.
                Если оно растёт, программа публикует больше, чем участники успевают обрабатывать.
              </p>
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'day-stats',
                  label: 'Статистика дня',
                  path: data?.exportPath || `/exports/day/stats?day=${selectedDay}`,
                  filename: `day_stats_d${selectedDay}.xlsx`,
                });
              }}
            >
              Выгрузить статистику дня
            </button>
          </div>
        </>
      )}
    </HubLensLayout>
  );
}
