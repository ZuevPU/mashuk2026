import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubFilterParams } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
  StackBar,
} from './dayResultsUi';

const SEG_COLORS: Record<string, string> = {
  'Ядро': '#57bd9c',
  'Слушатели': '#79b8c9',
  'Общительные': '#c98fb0',
  'Тихие': '#e2685e',
};
const SEG_ORDER = ['Ядро', 'Слушатели', 'Общительные', 'Тихие'] as const;

type ActivityData = {
  meta: {
    day: number;
    people: number;
    today: number;
    yest: number;
    old: number;
    zeroExp: number;
    maxPoints: number;
    medPoints: number;
    todayPct: number;
    zeroExpPct: number;
  };
  segments: Array<{
    name: string; desc: string; n: number; points: number; exp: number; old: number;
  }>;
  pointsDist: Array<{ v: number; n: number }>;
  expDist: Array<{ name: string; n: number }>;
  gini: { path: number; exp: number; points: number };
  expTop: { top10: number; top25: number };
  dirs: Array<{
    dir: string; n: number; points: number; old: number;
    today: number; zeroExp: number; segs: number[];
  }>;
  groupsLow: Array<{
    group: string; n: number; dir: string; points: number; today: number; old: number;
  }>;
  groupsHigh: Array<{
    group: string; n: number; dir: string; points: number; today: number; old: number;
  }>;
  hours: Array<{ h: number; n: number }>;
  daySeries: Array<{
    day: number; todayPct: number | null; old: number | null; zeroExpPct: number | null;
  }>;
  limits: Array<{ title: string; text: string }>;
  exportPath?: string;
};

/**
 * Линза «Активность» — вовлечённость, сегменты, выпадение.
 * GET /analytics/hub/activity
 */
export function HubActivityScreen() {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<ActivityData | null>(null);
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
    adminFetch(`/analytics/hub/activity?${params.toString()}`)
      .then(res => setData(res as ActivityData))
      .catch((e: unknown) => {
        setData(null);
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить активность');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  const selectedDay = Number(forumDay) || meta?.currentForumDay || 1;
  const m = data?.meta;
  const people = Math.max(1, m?.people ?? 1);

  return (
    <div className="adm-day-results">
      <DashScreenTitle
        title="Активность участников"
        hint={
          m
            ? `День ${m.day} · ${m.people} участников · медиана ${m.medPoints} из ${m.maxPoints} точек`
            : 'Кто идёт по программе, кто обменивается опытом, кто выпадает'
        }
      />

      <div className="adm-day-results-days" aria-label="Дни форума">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
          const cls = [
            'adm-day-results-day',
            d === selectedDay ? 'is-on' : '',
            d < selectedDay ? 'is-past' : '',
          ].filter(Boolean).join(' ');
          return (
            <button key={d} type="button" className={cls} onClick={() => setForumDay(String(d))}>
              {d}
            </button>
          );
        })}
      </div>

      {loading && <p className="adm-muted">Загрузка…</p>}
      {err && <p className="adm-muted" style={{ color: '#b91c1c' }}>{err}</p>}

      {data && m && !loading && (
        <>
          <DayResultsSection
            title="Вовлечённость сегодня"
            note="Панель отвечает на вопрос «кто выпадает», а не «кто лучший». Рейтинг участников из этих данных строить нельзя."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: `${Math.round(m.todayPct)}%`,
                  label: 'Заходили сегодня',
                  sub: `${m.today} из ${m.people}`,
                },
                {
                  value: m.old,
                  label: 'Не заходили два дня и дольше',
                  sub: 'единственный жёсткий сигнал выпадения',
                  accent: m.old > 25 ? '#b91c1c' : undefined,
                },
                {
                  value: `${Math.round(m.zeroExpPct)}%`,
                  label: 'Ни разу не участвовали в обмене опытом',
                  sub: `${m.zeroExp} человек с нулевым «Опытом»`,
                  accent: '#b91c1c',
                },
                {
                  value: `${m.medPoints} из ${m.maxPoints}`,
                  label: 'Медиана точек осмысления',
                  sub: 'половина прошла больше, половина меньше',
                },
              ]}
            />
          </DayResultsSection>

          <DayResultsSection
            title="Четыре типа участия"
            note="Две оси: точки выше медианы и есть ли баллы «Опыт». Разные квадранты — разные действия."
          >
            <DashCard>
              <div className="adm-activity-matrix">
                {SEG_ORDER.map(name => {
                  const s = data.segments.find(x => x.name === name);
                  if (!s) return null;
                  const color = SEG_COLORS[name];
                  return (
                    <div
                      key={name}
                      className="adm-activity-qd"
                      style={{ borderColor: `${color}55` }}
                    >
                      <div className="adm-activity-qd-nm" style={{ color }}>{s.name}</div>
                      <div className="adm-muted" style={{ fontSize: 12, marginBottom: 10 }}>{s.desc}</div>
                      <div className="adm-activity-qd-cnt">
                        {s.n}
                        <span className="adm-muted" style={{ fontSize: 14, fontWeight: 400 }}>
                          {' '}чел · {Math.round((s.n / people) * 100)}%
                        </span>
                      </div>
                      <div className="adm-muted" style={{ fontSize: 12, marginTop: 6 }}>
                        точек {s.points} · опыт {s.exp}
                        {s.old ? ` · выпали ${s.old}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="adm-activity-axes">
                <div>вверх — идут по программе</div>
                <div style={{ textAlign: 'right' }}>вправо — участвуют в обмене</div>
              </div>
              {(() => {
                const quiet = data.segments.find(s => s.name === 'Тихие');
                const social = data.segments.find(s => s.name === 'Общительные');
                const listeners = data.segments.find(s => s.name === 'Слушатели');
                const core = data.segments.find(s => s.name === 'Ядро');
                if (!quiet || !social || !listeners || !core) return null;
                return (
                  <div className="adm-day-results-callout adm-day-results-callout-amber">
                    <b>«Тихие» — {quiet.n} человек.</b>
                    {' '}Из них {quiet.old} не заходили два дня и дольше — это список для кураторов.
                    {' '}«Общительные» — {social.n}: точек {social.points} против {core.points} у ядра.
                    {' '}«Слушатели» — {listeners.n}: программу проходят, в обмен не заходят.
                  </div>
                );
              })()}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Прохождение программы"
            note={`Точки осмысления — сколько блоков закрыто рефлексией. Максимум на сегодня — ${m.maxPoints}.`}
          >
            <DashCard>
              {(() => {
                const pmx = Math.max(1, ...data.pointsDist.map(x => x.n));
                return (
                  <div className="adm-state-hist">
                    {data.pointsDist.map(x => {
                      const c = x.v <= 3 ? '#e2685e' : x.v >= 12 ? '#57bd9c' : '#6f7d95';
                      return (
                        <div key={x.v}>
                          <div
                            className="adm-state-hist-b"
                            style={{ height: `${(x.n / pmx) * 100}px`, background: c }}
                            title={`${x.v}: ${x.n}`}
                          />
                          <div className="adm-state-hist-x">{x.v}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="adm-day-results-legend">
                <span><i style={{ background: '#e2685e' }} />0–3 — почти не заходят</span>
                <span><i style={{ background: '#6f7d95' }} />4–11</span>
                <span><i style={{ background: '#57bd9c' }} />12+ — проходят почти всё</span>
              </div>
              <div className="adm-day-results-callout">
                <b>Баллы «Путь» и точки осмысления — одно и то же.</b>
                {' '}В панели остаются точки: они понятны без шкалы начисления.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Обмен опытом"
            note="Распределение принципиально другое: управлять средней величиной нельзя — только долей участвующих."
          >
            <div className="adm-activity-grid2">
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  Баллы «Опыт» по группам значений
                </div>
                {(() => {
                  const emx = Math.max(1, ...data.expDist.map(x => x.n));
                  return data.expDist.map((x, i) => (
                    <div key={x.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.name}</div>
                        <HBar
                          widthPct={(x.n / emx) * 100}
                          color={i === 0 ? '#e2685e' : i >= 3 ? '#57bd9c' : '#6f7d95'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{x.n}</div>
                    </div>
                  ));
                })()}
              </DashCard>
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                  Концентрация: кто создаёт активность
                </div>
                <div className="adm-day-results-row">
                  <div>
                    <div className="adm-day-results-lb">Верхние 10 % участников</div>
                    <HBar widthPct={data.expTop.top10} color="#c98fb0" />
                  </div>
                  <div className="adm-day-results-nb">{data.expTop.top10}%</div>
                </div>
                <div className="adm-day-results-row">
                  <div>
                    <div className="adm-day-results-lb">Верхние 25 %</div>
                    <HBar widthPct={data.expTop.top25} color="#c98fb0" />
                  </div>
                  <div className="adm-day-results-nb">{data.expTop.top25}%</div>
                </div>
                <div className="adm-day-results-row">
                  <div>
                    <div className="adm-day-results-lb">Джини по «Опыту»</div>
                    <HBar widthPct={data.gini.exp * 100} color="#e2685e" />
                  </div>
                  <div className="adm-day-results-nb">{data.gini.exp}</div>
                </div>
                <div className="adm-day-results-row">
                  <div>
                    <div className="adm-day-results-lb">Джини по точкам</div>
                    <HBar widthPct={data.gini.points * 100} color="#57bd9c" />
                  </div>
                  <div className="adm-day-results-nb">{data.gini.points}</div>
                </div>
                <div className="adm-day-results-callout adm-day-results-callout-amber">
                  Программа почти равномерна ({data.gini.points}), обмен — нет ({data.gini.exp}).
                  Средний «Опыт» бессмыслен — считать долю участвующих.
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Направления"
            note="Состав участия важнее среднего: одинаковая средняя может складываться из ядра и тихих либо из ровной середины."
          >
            <DashCard>
              <div className="adm-day-results-scroll">
                <table className="adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      <th style={{ textAlign: 'center' }}>Чел.</th>
                      <th style={{ textAlign: 'center' }}>Точек</th>
                      <th style={{ textAlign: 'center' }}>Без обмена</th>
                      <th style={{ textAlign: 'center' }}>Сегодня</th>
                      <th style={{ textAlign: 'center' }}>Выпали</th>
                      <th style={{ minWidth: 180 }}>Состав</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dirs.map(d => (
                      <tr key={d.dir}>
                        <td>{d.dir}</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{d.n}</td>
                        <td style={{ textAlign: 'center' }}>{d.points}</td>
                        <td style={{
                          textAlign: 'center',
                          color: d.zeroExp >= 50 ? '#b91c1c' : undefined,
                        }}>
                          {d.zeroExp}%
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{d.today}%</td>
                        <td style={{ textAlign: 'center' }}>
                          {d.old
                            ? <Flag tone="bad">{d.old}</Flag>
                            : <span className="adm-muted">0</span>}
                        </td>
                        <td>
                          <StackBar
                            items={SEG_ORDER.map((name, i) => ({ name, n: d.segs[i] ?? 0 }))}
                            colors={SEG_ORDER.map(n => SEG_COLORS[n])}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="adm-day-results-legend">
                {SEG_ORDER.map(n => (
                  <span key={n}><i style={{ background: SEG_COLORS[n] }} />{n}</span>
                ))}
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Группы"
            note="Список для кураторов. Показаны группы от 15 человек."
          >
            <div className="adm-activity-grid2">
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Ниже всех по прохождению программы
                </div>
                <table className="adm-day-results-table">
                  <tbody>
                    {data.groupsLow.map(r => (
                      <tr key={r.group}>
                        <td style={{ fontWeight: 600 }}>{r.group}</td>
                        <td className="adm-muted">{r.dir}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Flag tone={r.points < 7 ? 'bad' : 'warn'}>{r.points} точек</Flag>
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">сегодня {r.today}%</td>
                        <td style={{
                          textAlign: 'right',
                          color: r.old ? '#b91c1c' : undefined,
                        }}
                        className={r.old ? undefined : 'adm-muted'}
                        >
                          выпали {r.old}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DashCard>
              <DashCard>
                <div className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Выше всех
                </div>
                <table className="adm-day-results-table">
                  <tbody>
                    {data.groupsHigh.map(r => (
                      <tr key={r.group}>
                        <td style={{ fontWeight: 600 }}>{r.group}</td>
                        <td className="adm-muted">{r.dir}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Flag tone="ok">{r.points} точек</Flag>
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">сегодня {r.today}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="adm-day-results-callout" style={{ borderLeftColor: '#57bd9c' }}>
                  Сверяйте с «Итогами дня» и «Состоянием»: одни и те же группы часто всплывают во всех панелях.
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Когда были в системе последний раз"
            note="Ритм суток подсказывает, когда напоминание дойдёт."
          >
            <DashCard>
              {(() => {
                const hmx = Math.max(1, ...data.hours.map(h => h.n));
                const hours = Array.from({ length: 24 }, (_, h) => ({
                  h,
                  n: data.hours.find(x => x.h === h)?.n ?? 0,
                }));
                return (
                  <div className="adm-state-hist">
                    {hours.map(h => (
                      <div key={h.h}>
                        <div
                          className="adm-state-hist-b"
                          style={{
                            height: `${(h.n / hmx) * 100}px`,
                            background: h.n / hmx > 0.6 ? '#e6ae4a' : '#6f7d95',
                          }}
                          title={`${String(h.h).padStart(2, '0')}: ${h.n}`}
                        />
                        <div className="adm-state-hist-x">{String(h.h).padStart(2, '0')}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="adm-day-results-callout adm-day-results-callout-amber">
                Обычно два пика: утро (точки и проверки состояния) и вечер (итоговая анкета).
                Днём люди в залах — цифровой контур почти пустой.
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Чего эта панель не делает"
            note="Ограничения важнее графиков: с баллами всегда возникает соблазн построить рейтинг."
          >
            <DashCard>
              {data.limits.map(r => (
                <div key={r.title} className="adm-state-rule">
                  <div className="adm-state-rule-w">{r.title}</div>
                  <div>{r.text}</div>
                </div>
              ))}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Динамика по дням форума"
            note="Доля участников с цифровой активностью за день (ответы, баллы, копилка; сегодня — ещё lastActiveAt). Сравнивать дни лучше по срезу на одно время суток."
          >
            <DashCard>
              <div className="adm-day-results-dyn">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
                  const pt = data.daySeries.find(s => s.day === d);
                  const cov = pt?.todayPct;
                  const h = cov != null ? Math.max(6, Math.round((cov / 100) * 120)) : 6;
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
                Текущий день неполный, если срез не вечерний. Иначе последний день всегда выглядит провальным.
              </div>
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'activity',
                  label: 'Активность',
                  path: data.exportPath || '/exports/activity?format=xlsx',
                  filename: `activity_d${selectedDay}.xlsx`,
                });
              }}
            >
              Скачать XLSX активности
            </button>
          </div>
        </>
      )}
    </div>
  );
}
