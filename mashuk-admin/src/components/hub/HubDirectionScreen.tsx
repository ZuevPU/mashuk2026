import { useEffect, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { hubFilterParams, hubDirections, isOrganizerDirection } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
  StackBar,
} from './dayResultsUi';

const ZONE_COLORS: Record<string, string> = {
  'Подъём': '#57bd9c',
  'Включение': '#79b8c9',
  'Нейтраль': '#6f7d95',
  'Усталость': '#e6ae4a',
  'Риск': '#e2685e',
};

const LEVEL_COLORS: Record<string, string> = {
  'Перенос в практику': '#57bd9c',
  'Связь с собой': '#79b8c9',
  'Тезис': '#6f7d95',
  'Реакция': '#e6ae4a',
};

const SEG_COLORS: Record<string, string> = {
  'Ядро': '#57bd9c',
  'Слушатели': '#79b8c9',
  'Общительные': '#c98fb0',
  'Тихие': '#e2685e',
};

type DirData = {
  meta: {
    day: number;
    selectedDir: string | null;
    registered: number;
    dirs: number;
    forumRegistered: number;
    smallNote: string | null;
  };
  dirs: Array<{ dir: string; registered: number }>;
  zones: string[];
  levels: string[];
  forum: {
    idx: number | null;
    neg: number;
    own: number;
    points: number;
    kopCov: number;
    exCov: number;
    stCov: number;
    rfCov: number;
    blocks: Array<{ key: string; label: string; mean: number | null; low: number }>;
  };
  profile: Array<{
    key: string; name: string; unit: string; up: boolean;
    v: number | null; forum: number | null; dev: number | null; good: boolean | null;
  }>;
  kpis: Array<{ label: string; value: string; sub: string }>;
  state: {
    n: number; people: number; cov: number; neg: number; reasons: number;
    byPhase: Array<{
      phase: string; n: number; dist: number[]; energy: number | null; neg: number | null;
    }>;
    themes: Array<{ name: string; n: number }>;
  };
  emotions: Array<{ name: string; n: number; pct: number; forumPct: number; deltaPp: number }>;
  evening: {
    n: number; idx: number | null; drafts: number;
    blocks: Array<{ key: string; label: string; mean: number | null; low: number; n: number }>;
    roles: Array<{ name: string; n: number }>;
    experiment: Array<{ name: string; n: number }>;
  };
  refl: {
    n: number; people: number; cov: number; dist: number[]; own: number; med: number;
    byEvent: Array<{ ev: string; n: number; own: number }>;
  };
  exch: {
    q: number; a: number; people: number; cov: number; medA: number; short: number;
    cats: Array<{ name: string; n: number }>;
  };
  kop: {
    n: number; auto: number; people: number; cov: number; act: number;
    tags: Array<{ tag: string; n: number }>;
    sources: Array<{ name: string; n: number }>;
  };
  act: {
    n: number; points: number; exp0: number; today: number; old: number;
    segs: Array<{ name: string; n: number }>;
  };
  groups: Array<{ g: string; n: number; idx: number | null; neg: number | null; pts: number | null }>;
  matrix: {
    keys: Array<{ key: string; name: string; up: boolean; unit: string }>;
    rows: Array<{
      dir: string; registered: number;
      cells: Array<{ key: string; v: number | null; rank: number; tone: number }>;
    }>;
  };
  daySeries: Array<{
    day: number; idx: number | null; neg: number | null; own: number | null;
    points: number | null; exQ: number | null;
  }>;
  timelines: Array<{
    dir: string; registered: number;
    cards: Array<{ day: number; main: { v: number | string; label: string } | null; tools: string[] }>;
  }>;
};

function fmt(v: number | null | undefined, unit = ''): string {
  if (v == null) return '—';
  return `${v}${unit}`;
}

function cellBg(tone: number, up: boolean): string {
  // tone 1 = best (green), 0 = worst (coral)
  const t = up ? tone : tone;
  if (t >= 0.62) return `rgba(87, 189, 156, ${(t - 0.5) * 0.85})`;
  if (t <= 0.38) return `rgba(226, 104, 94, ${(0.5 - t) * 0.85})`;
  return 'rgba(111, 125, 149, 0.13)';
}

/**
 * Линза «Направление» — сводный портрет по всем инструментам.
 * GET /analytics/hub/direction. Старый детальный разбор — внизу.
 */
export function HubDirectionScreen() {
  const {
    adminFetch, direction, setDirection, forumDay, setForumDay, meta, ageCategory, activity,
  } = useInsights();
  const [data, setData] = useState<DirData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction: isOrganizerDirection(direction) ? '' : direction,
      group: '',
      ageCategory,
      activity,
    });
    adminFetch(`/analytics/hub/direction?${params.toString()}`)
      .then(res => setData(res as DirData))
      .catch((e: unknown) => {
        setData(null);
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить направление');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, ageCategory, activity]);

  const selectedDay = Number(forumDay) || meta?.currentForumDay || 1;
  const cur = data?.meta.selectedDir || direction || '—';
  const m = data?.meta;
  const themeMax = Math.max(...(data?.state.themes.map(t => t.n) ?? [1]), 1);
  const roleMax = Math.max(...(data?.evening.roles.map(r => r.n) ?? [1]), 1);
  const tagMax = Math.max(...(data?.kop.tags.map(t => t.n) ?? [1]), 1);
  const srcMax = Math.max(...(data?.kop.sources.map(s => s.n) ?? [1]), 1);
  const catMax = Math.max(...(data?.exch.cats.map(c => c.n) ?? [1]), 1);
  const eventOwnMax = Math.max(...(data?.refl.byEvent.map(e => e.own) ?? [1]), 1);

  return (
    <div className="adm-day-results">
      <DashScreenTitle
        title={cur !== '—' ? cur : 'Направление'}
        hint={
          m
            ? `${m.registered} зарегистрировано · день ${m.day} · сводка по всем инструментам`
            : 'Портрет направления: отклонения от форума и рабочие списки групп'
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

      <div className="adm-dir-picker" aria-label="Направления">
        {(data?.dirs ?? hubDirections(meta?.filters?.directions).map(d => ({ dir: d, registered: 0 }))).map(d => (
          <button
            key={d.dir}
            type="button"
            className={`adm-dir-chip ${d.dir === cur ? 'is-on' : ''}`}
            onClick={() => setDirection(d.dir)}
          >
            {d.dir}
            {d.registered > 0 && <span className="adm-dir-chip-c">{d.registered}</span>}
          </button>
        ))}
      </div>

      {loading && <p className="adm-muted">Загрузка…</p>}
      {err && <p className="adm-error">{err}</p>}

      {data && (
        <>
          <DayResultsSection
            title="Портрет направления"
            note="Отклонение от среднего по форуму в процентах. Зелёный — направление сильнее форума; для усталости, черновиков и «без обмена» сильнее значит меньше."
          >
            <DashCard>
              {data.profile.map(p => {
                const w = p.dev == null ? 0 : Math.min(Math.abs(p.dev), 60) / 60 * 50;
                const col = p.dev == null ? '#6f7d95' : (p.good ? '#57bd9c' : '#e2685e');
                return (
                  <div key={p.key} className="adm-dir-prof">
                    <div className="adm-dir-prof-nm">{p.name}</div>
                    <div className="adm-dir-pbar">
                      {p.dev != null && (
                        <div
                          className="adm-dir-pbar-f"
                          style={{
                            ...(p.dev >= 0 ? { left: '50%' } : { right: '50%' }),
                            width: `${w}%`,
                            background: col,
                          }}
                        />
                      )}
                      <div className="adm-dir-pbar-z" />
                    </div>
                    <div className="adm-dir-prof-vl">
                      <b>{fmt(p.v, p.unit)}</b>
                      <span>
                        {p.dev == null
                          ? 'нет базы'
                          : `${p.dev >= 0 ? '+' : ''}${Math.round(p.dev)}% к форуму`}
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="adm-day-results-callout adm-day-results-callout-amber">
                Профиль читается как форма: провал слева по состоянию и подъём справа по охватам —
                «выгорающие активные», работать с ними иначе, чем с ровно тихим направлением.
              </p>
            </DashCard>
          </DayResultsSection>

          <HubKpiRow
            cols={4}
            items={data.kpis.map(k => ({ value: k.value, label: k.label, sub: k.sub }))}
          />

          <DayResultsSection
            title="Состояние по фазам дня"
            note="Доли считаются внутри фазы. Энергия — медиана."
          >
            <DashCard>
              <div className="adm-dir-grid3">
                {data.state.byPhase.map(p => {
                  const tot = p.dist.reduce((a, b) => a + b, 0) || 1;
                  return (
                    <div key={p.phase} className="adm-dir-ph">
                      <h3>{p.phase}</h3>
                      <div className="adm-dir-ph-meta">
                        {p.n} отметок · энергия {p.energy ?? '—'}
                        {p.neg != null ? ` · минус ${p.neg}%` : ''}
                      </div>
                      <div className="adm-dir-col">
                        {data.zones.map((z, i) => {
                          const pc = ((p.dist[i] ?? 0) / tot) * 100;
                          return (
                            <div
                              key={z}
                              style={{ height: `${pc}%`, background: ZONE_COLORS[z] }}
                            >
                              {pc >= 9 ? `${Math.round(pc)}%` : ''}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="adm-day-results-legend">
                {data.zones.map(z => (
                  <span key={z}>
                    <i style={{ background: ZONE_COLORS[z] }} />
                    {z}
                  </span>
                ))}
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Настроение и его причины"
            note="Важно не то, каких эмоций больше, а какие встречаются чаще, чем у всех."
          >
            <div className="adm-dir-grid2">
              <DashCard title={`Эмоции · ${data.state.n} отметок`}>
                {data.emotions.map(e => (
                  <div key={e.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">
                        {e.name}
                        {Math.abs(e.deltaPp) >= 2 && (
                          <Flag tone={e.deltaPp > 0 ? 'warn' : 'ok'}>
                            {e.deltaPp > 0 ? '+' : ''}{e.deltaPp} п.п.
                          </Flag>
                        )}
                      </div>
                      <HBar widthPct={e.pct} color="#e6ae4a" />
                    </div>
                    <div className="adm-day-results-nb">{e.pct}%</div>
                  </div>
                ))}
              </DashCard>
              <DashCard title={`Темы причин · ${data.state.reasons} пояснений`}>
                {data.state.themes.map(t => (
                  <div key={t.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{t.name}</div>
                      <HBar widthPct={(t.n / themeMax) * 100} />
                    </div>
                    <div className="adm-day-results-nb">{t.n}</div>
                  </div>
                ))}
                <p className="adm-day-results-callout">
                  Тема с наибольшим весом — то, что штаб может изменить завтра.
                </p>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Оценки дня по блокам программы"
            note="Точка — направление, штрих — форум. Справа доля оценок ниже четырёх."
          >
            <DashCard>
              {data.evening.blocks.map(b => {
                const f = data.forum.blocks.find(x => x.key === b.key);
                const v = b.mean ?? 0;
                const fv = f?.mean ?? v;
                const pos = ((v - 3.5) / 1.5) * 100;
                const fpos = ((fv - 3.5) / 1.5) * 100;
                return (
                  <div key={b.key} className="adm-dir-prof">
                    <div className="adm-dir-prof-nm">{b.label}</div>
                    <div className="adm-dir-pbar">
                      <div
                        className="adm-dir-block-forum"
                        style={{ left: `${Math.max(0, Math.min(100, fpos))}%` }}
                      />
                      <div
                        className="adm-dir-block-dot"
                        style={{
                          left: `${Math.max(0, Math.min(100, pos))}%`,
                          background: v >= fv ? '#57bd9c' : '#e2685e',
                        }}
                      />
                    </div>
                    <div className="adm-dir-prof-vl">
                      <b>{fmt(b.mean)}</b>
                      <span style={{ color: b.low >= 12 ? '#b91c1c' : undefined }}>
                        {b.low}% ниже 4
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="adm-day-results-callout">
                Индекс дня — <b>{fmt(data.evening.idx)}</b> при {fmt(data.forum.idx)} по форуму.
                Черновиков {data.evening.drafts}%.
              </p>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Как отвечали: глубина и обмен"
            note="Спрашивать и отвечать — разные роли."
          >
            <div className="adm-dir-grid2">
              <DashCard title={`Уровни осмысления · ${data.refl.n} текстов`}>
                <StackBar
                  items={data.levels.map((l, i) => ({
                    name: l,
                    n: data.refl.dist[i] ?? 0,
                  }))}
                  colors={data.levels.map(l => LEVEL_COLORS[l])}
                />
                <div className="adm-day-results-legend" style={{ marginTop: 10 }}>
                  {data.levels.map(l => (
                    <span key={l}><i style={{ background: LEVEL_COLORS[l] }} />{l}</span>
                  ))}
                </div>
                <div className="adm-muted" style={{ marginTop: 14, fontSize: 12 }}>
                  Присвоение по событиям · {data.refl.own}% общее
                </div>
                {data.refl.byEvent.map(e => (
                  <div key={e.ev} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{e.ev}</div>
                      <HBar
                        widthPct={(e.own / Math.max(eventOwnMax, 1)) * 100}
                        color={e.own >= 12 ? '#57bd9c' : '#6f7d95'}
                      />
                    </div>
                    <div className="adm-day-results-nb">
                      {e.own}%
                      <div style={{ fontSize: 10.5 }} className="adm-muted">n={e.n}</div>
                    </div>
                  </div>
                ))}
              </DashCard>
              <DashCard title="Обмен опытом">
                <div className="adm-dir-mini-kpis">
                  <div><div className="v">{data.exch.q}</div><div className="l">вопросов</div></div>
                  <div><div className="v">{data.exch.a}</div><div className="l">ответов</div></div>
                  <div><div className="v">{data.exch.cov}%</div><div className="l">охват</div></div>
                </div>
                <div className="adm-muted" style={{ marginTop: 14, fontSize: 12 }}>О чём спрашивают</div>
                {data.exch.cats.length === 0 ? (
                  <p className="adm-muted">Вопросов от направления нет</p>
                ) : data.exch.cats.map(c => (
                  <div key={c.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{c.name}</div>
                      <HBar
                        widthPct={(c.n / catMax) * 100}
                        color={c.name === 'Не размечено' ? '#6f7d95' : '#e6ae4a'}
                      />
                    </div>
                    <div className="adm-day-results-nb">{c.n}</div>
                  </div>
                ))}
                <p className="adm-day-results-callout">
                  Медиана ответа {data.exch.medA} знаков, коротких реплик {data.exch.short}%.
                </p>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Как складывали в копилку"
            note="Автосохранённые материалы отделены от собственных заметок. Тег «контакт» — только счётчик."
          >
            <div className="adm-dir-grid2">
              <DashCard>
                <div className="adm-dir-mini-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div>
                    <div className="v">{data.kop.cov}%</div>
                    <div className="l">охват · форум {data.forum.kopCov}%</div>
                  </div>
                  <div>
                    <div className="v">{data.kop.act}%</div>
                    <div className="l">заметок с действием</div>
                  </div>
                </div>
                <div className="adm-muted" style={{ marginTop: 14, fontSize: 12 }}>
                  Теги · {data.kop.n} заметок + {data.kop.auto} авто
                </div>
                {data.kop.tags.filter(t => t.n > 0).map(t => (
                  <div key={t.tag} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{t.tag}</div>
                      <HBar
                        widthPct={(t.n / tagMax) * 100}
                        color={['в работу', 'на будущее'].includes(t.tag) ? '#57bd9c' : t.tag === 'контакт' ? '#c98fb0' : '#6f7d95'}
                      />
                    </div>
                    <div className="adm-day-results-nb">{t.n}</div>
                  </div>
                ))}
              </DashCard>
              <DashCard title="Откуда приходит материал">
                {data.kop.sources.map(s => (
                  <div key={s.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{s.name}</div>
                      <HBar widthPct={(s.n / srcMax) * 100} />
                    </div>
                    <div className="adm-day-results-nb">{s.n}</div>
                  </div>
                ))}
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Роли и ролевой эксперимент"
            note="Единственный индикатор движения, а не удовлетворённости."
          >
            <div className="adm-dir-grid2">
              <DashCard title={`Ролевой эксперимент · ${data.evening.experiment.reduce((a, x) => a + x.n, 0)} ответов`}>
                {data.evening.experiment.length === 0 ? (
                  <p className="adm-muted">Нет ответов по эксперименту в срезе</p>
                ) : data.evening.experiment.map(e => (
                  <div key={e.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{e.name}</div>
                      <HBar
                        widthPct={(e.n / Math.max(...data.evening.experiment.map(x => x.n), 1)) * 100}
                        color="#e6ae4a"
                      />
                    </div>
                    <div className="adm-day-results-nb">{e.n}</div>
                  </div>
                ))}
              </DashCard>
              <DashCard title="Роль на завтра">
                {data.evening.roles.map(r => {
                  const tot = data.evening.roles.reduce((a, x) => a + x.n, 0) || 1;
                  return (
                    <div key={r.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{r.name}</div>
                        <HBar widthPct={(r.n / roleMax) * 100} color="#6f7d95" />
                      </div>
                      <div className="adm-day-results-nb">{Math.round((r.n / tot) * 100)}%</div>
                    </div>
                  );
                })}
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="Состав участия и группы"
            note="Группы от 8 человек. Строка, красная во всех трёх колонках — повод идти сегодня."
          >
            <div className="adm-dir-grid2">
              <DashCard title="Типы участия">
                <StackBar
                  items={data.act.segs.map(s => ({ name: s.name, n: s.n }))}
                  colors={data.act.segs.map(s => SEG_COLORS[s.name] || '#6f7d95')}
                />
                <div className="adm-day-results-legend" style={{ marginTop: 10 }}>
                  {data.act.segs.map(s => (
                    <span key={s.name}>
                      <i style={{ background: SEG_COLORS[s.name] }} />
                      {s.name} — {s.n}
                    </span>
                  ))}
                </div>
                <p className="adm-day-results-callout">
                  Точек в среднем {data.act.points} против {data.forum.points} по форуму.
                  Без обмена {data.act.exp0}%. Выпавших 2+ дня — {data.act.old}.
                </p>
              </DashCard>
              <DashCard>
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Группа</th>
                        <th style={{ textAlign: 'center' }}>Чел.</th>
                        <th style={{ textAlign: 'center' }}>Индекс</th>
                        <th style={{ textAlign: 'center' }}>Минус</th>
                        <th style={{ textAlign: 'center' }}>Точки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.groups.map(g => (
                        <tr key={g.g}>
                          <td style={{ fontWeight: 600 }}>{g.g}</td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">{g.n}</td>
                          <td style={{ textAlign: 'center' }}>
                            {g.idx != null ? (
                              <Flag tone={g.idx < 4.45 ? 'bad' : g.idx < 4.65 ? 'warn' : 'ok'}>{g.idx}</Flag>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign: 'center', color: (g.neg ?? 0) >= 30 ? '#b91c1c' : undefined }}>
                            {g.neg != null ? `${g.neg}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', color: (g.pts ?? 99) < 7.5 ? '#b91c1c' : undefined }}>
                            {g.pts != null ? g.pts : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            title="По дням"
            note="Чем закрыт каждый день и ключевое число выбранного направления."
          >
            <DashCard>
              <div className="adm-dir-tl">
                {data.daySeries.map(d => {
                  const on = d.day === selectedDay;
                  let main: string | null = null;
                  let sub = '';
                  if (d.idx != null) { main = String(d.idx); sub = 'индекс дня'; }
                  else if (d.neg != null) { main = `${d.neg}%`; sub = 'усталость и риск'; }
                  else if (d.own != null) { main = `${d.own}%`; sub = 'присвоение'; }
                  else if (d.exQ != null && d.exQ > 0) { main = String(d.exQ); sub = 'вопросов в обмене'; }
                  return (
                    <button
                      key={d.day}
                      type="button"
                      className={`adm-dir-tlc ${main ? 'has' : ''} ${on ? 'is-on' : ''}`}
                      onClick={() => setForumDay(String(d.day))}
                    >
                      <div className="d">День {d.day}</div>
                      {main ? (
                        <>
                          <div className="k">{main}</div>
                          <div className="s">{sub}</div>
                        </>
                      ) : (
                        <div className="s" style={{ marginTop: 16 }}>нет данных</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Сравнение направлений"
            note="Цвет кодирует место в ряду, а не абсолют. Текущее направление подсвечено."
          >
            <DashCard>
              {m?.smallNote && (
                <p className="adm-muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 12 }}>
                  {m.smallNote}
                </p>
              )}
              <div className="adm-day-results-scroll">
                <table className="adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      {data.matrix.keys.map(k => (
                        <th key={k.key} style={{ textAlign: 'center', maxWidth: 72, whiteSpace: 'normal' }}>
                          {k.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.matrix.rows.map(row => (
                      <tr key={row.dir} className={row.dir === cur ? 'adm-dir-me' : undefined}>
                        <td style={{ fontWeight: 600 }}>
                          {row.dir}
                          <div className="adm-muted" style={{ fontSize: 11 }}>{row.registered}</div>
                        </td>
                        {row.cells.map((c, i) => {
                          const keyMeta = data.matrix.keys[i];
                          return (
                            <td key={c.key} style={{ padding: 4 }}>
                              <span
                                className="adm-dir-cell"
                                style={{ background: cellBg(c.tone, keyMeta.up) }}
                              >
                                {c.v == null ? '—' : `${c.v}${keyMeta.unit}`}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            title="Ленты всех направлений"
            note="Одна лента на трек — без переключений видно, чем закрыт каждый день."
          >
            {data.timelines.map(t => (
              <DashCard key={t.dir} title={`${t.dir} · ${t.registered}`}>
                <div className="adm-dir-tl">
                  {t.cards.map(c => (
                    <div key={c.day} className={`adm-dir-tlc ${c.main ? 'has' : ''}`}>
                      <div className="d">День {c.day}</div>
                      {c.main ? (
                        <>
                          <div className="k">{c.main.v}</div>
                          <div className="s">{c.main.label}</div>
                        </>
                      ) : (
                        <div className="s" style={{ marginTop: 16 }}>нет данных</div>
                      )}
                      {c.tools.length > 0 && (
                        <div className="s" style={{ marginTop: 6 }}>{c.tools.join(' · ')}</div>
                      )}
                    </div>
                  ))}
                </div>
              </DashCard>
            ))}
          </DayResultsSection>
        </>
      )}
    </div>
  );
}
