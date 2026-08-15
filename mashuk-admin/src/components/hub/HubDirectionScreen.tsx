import { useEffect, useMemo, useState } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { hubDisplayDay, hubFilterParams, hubDirections, isAllForumDay, isOrganizerDirection } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
  StackBar,
} from './dayResultsUi';
import { HubDirectionDynamics, type SeriesMetric } from './HubDirectionDynamics';
import {
  ConclusionCard,
  dirNarr,
  dirSummary,
  forumAlerts,
  forumConclusions,
  type ActCmpRow,
  type ForumTotals,
  type OverviewRow,
  type StateCmpRow,
} from './directionNarrative';
import { HubLensLayout, type HubNavItem } from './HubSideNav';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

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

const FB_COLORS = ['#57bd9c', '#6f7d95', '#79b8c9', '#e2685e'];
const NEG_EMO = new Set(['Усталость', 'Раздражение', 'Тревога', 'Грусть']);

type ForumLayer = {
  overview: OverviewRow[];
  stateCmp: StateCmpRow[];
  actCmp: ActCmpRow[];
  forum: ForumTotals;
  fbCats: string[];
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
    noText?: number;
    byPhase: Array<{
      phase: string; phaseKey?: string; n: number; dist: number[]; energy: number | null; neg: number | null;
    }>;
    themes: Array<{ name: string; n: number }>;
    emoPhase?: Array<{ emo: string; v: number[] }>;
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
    n: number; points: number; path?: number; exp?: number; exp0: number; today: number; old: number;
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
  instruments: string[];
  series: SeriesMetric[];
  dirColors: Record<string, string>;
  forumLayer?: ForumLayer;
};

function fmt(v: number | null | undefined, unit = ''): string {
  if (v == null) return '—';
  return `${v}${unit}`;
}

function cellBg(tone: number): string {
  if (tone >= 0.62) return `rgba(87, 189, 156, ${(tone - 0.5) * 0.85})`;
  if (tone <= 0.38) return `rgba(226, 104, 94, ${(0.5 - tone) * 0.85})`;
  return 'rgba(111, 125, 149, 0.13)';
}

function heatRank(vals: number[], v: number, up: boolean): string {
  if (!vals.length) return 'transparent';
  const sorted = [...vals].sort((a, b) => (up ? b - a : a - b));
  const idx = sorted.indexOf(v);
  const a = vals.length <= 1 ? 0.5 : 1 - idx / (vals.length - 1);
  if (a > 0.66) return `rgba(87,189,156,${(a - 0.5) * 0.75})`;
  if (a < 0.34) return `rgba(226,104,94,${(0.5 - a) * 0.75})`;
  return 'transparent';
}

const DIR_FORUM_NAV: HubNavItem[] = [
  { id: 'hub-dir-forum-overview', label: 'Обзор' },
  { id: 'hub-dir-forum-matrix', label: 'Матрица' },
  { id: 'hub-dir-forum-feedback', label: 'ОС' },
  { id: 'hub-dir-forum-state', label: 'Состояние' },
  { id: 'hub-dir-forum-mechanics', label: 'Механизмы' },
  { id: 'hub-dir-forum-tools', label: 'Копилка' },
  { id: 'hub-dir-forum-readout', label: 'Вывод' },
  { id: 'hub-dir-forum-actions', label: 'Сегодня' },
  { id: 'hub-dir-forum-dynamics', label: 'Динамика' },
];

const DIR_DETAIL_NAV: HubNavItem[] = [
  { id: 'hub-dir-kpi', label: 'KPI' },
  { id: 'hub-dir-portrait', label: 'Портрет' },
  { id: 'hub-dir-phases', label: 'Фазы' },
  { id: 'hub-dir-emotions', label: 'Эмоции' },
  { id: 'hub-dir-reasons', label: 'Причины' },
  { id: 'hub-dir-after', label: 'После блоков' },
  { id: 'hub-dir-piggy', label: 'Копилка' },
  { id: 'hub-dir-exchange', label: 'Обмен' },
  { id: 'hub-dir-summary', label: 'Итог' },
  { id: 'hub-dir-groups', label: 'Группы' },
  { id: 'hub-dir-rank', label: 'Ранг' },
];

/**
 * Штаб · Направления — два слоя:
 * 1) форум · сравнение
 * 2) направление · точечный разбор + narrative engine
 */
export function HubDirectionScreen() {
  const {
    adminFetch, direction, setDirection, forumDay, setForumDay, meta, ageCategory, activity, organizers,
  } = useInsights();
  const [data, setData] = useState<DirData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [layer, setLayer] = useState<'forum' | 'dir'>('forum');

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const params = hubFilterParams({
      mode: 'day',
      forumDay,
      direction: !organizers && isOrganizerDirection(direction) ? '' : direction,
      group: '',
      ageCategory,
      activity,
      organizers,
    });
    adminFetch(`/analytics/hub/direction?${params.toString()}`)
      .then(res => setData(res as DirData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить направление');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, ageCategory, activity, organizers]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const cur = data?.meta.selectedDir || direction || '—';
  const m = data?.meta;
  const fl = data?.forumLayer;
  const themeMax = Math.max(...(data?.state.themes.map(t => t.n) ?? [1]), 1);
  const tagMax = Math.max(...(data?.kop.tags.map(t => t.n) ?? [1]), 1);
  const srcMax = Math.max(...(data?.kop.sources.map(s => s.n) ?? [1]), 1);
  const catMax = Math.max(...(data?.exch.cats.map(c => c.n) ?? [1]), 1);

  const conclusions = useMemo(
    () => (fl ? forumConclusions(fl.overview, fl.stateCmp, fl.actCmp) : []),
    [fl],
  );
  const alerts = useMemo(
    () => (fl ? forumAlerts(fl.overview, fl.forum.points) : []),
    [fl],
  );

  const narr = useMemo(() => {
    if (!data || !fl || cur === '—') return null;
    const ov = fl.overview.find(r => r.dir === cur);
    const sc = fl.stateCmp.find(r => r.dir === cur);
    if (!ov || !sc) return null;
    return dirNarr({
      dir: cur,
      reg: data.meta.registered || ov.reg,
      state: {
        n: data.state.n,
        byPhase: data.state.byPhase,
        emoPhase: data.state.emoPhase ?? [],
        themes: data.state.themes,
      },
      refl: data.refl,
      fbDist: ov.fbDist,
      kop: data.kop,
      exch: data.exch,
      overview: ov,
      stateCmp: sc,
      forum: fl.forum,
    });
  }, [data, fl, cur]);

  const summary = narr ? dirSummary(narr) : null;
  const dirNavItems = layer === 'forum' ? DIR_FORUM_NAV : DIR_DETAIL_NAV;

  return (
    <HubLensLayout className="adm-day-results" items={dirNavItems} navLabel="Разделы направлений">
      <DashScreenTitle
        title={layer === 'forum' ? 'Штаб · Сравнение направлений' : cur !== '—' ? `Направление «${cur}»` : 'Направление'}
        hint={
          m
            ? layer === 'forum'
              ? `День ${m.day} · ${m.dirs} направлений · ${m.forumRegistered} участников`
              : `${m.registered} зарегистрировано · день ${m.day} · точечный разбор`
            : 'Сравнение направлений и точечный разбор с выводами'
        }
      />

      <div className="adm-dir-layers" role="tablist" aria-label="Слой аналитики">
        <button
          type="button"
          role="tab"
          className={`adm-dir-layer ${layer === 'forum' ? 'is-on' : ''}`}
          aria-selected={layer === 'forum'}
          onClick={() => setLayer('forum')}
        >
          Форум · сравнение направлений
        </button>
        <button
          type="button"
          role="tab"
          className={`adm-dir-layer ${layer === 'dir' ? 'is-on' : ''}`}
          aria-selected={layer === 'dir'}
          onClick={() => setLayer('dir')}
        >
          Направление · точечный разбор
        </button>
      </div>

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

      <div className="adm-dir-picker" aria-label="Направления">
        {(data?.dirs ?? hubDirections(meta?.filters?.directions).map(d => ({ dir: d, registered: 0 }))).map(d => (
          <button
            key={d.dir}
            type="button"
            className={`adm-dir-chip ${d.dir === cur ? 'is-on' : ''}`}
            onClick={() => {
              setDirection(d.dir);
              setLayer('dir');
            }}
          >
            {d.dir}
            {d.registered > 0 && <span className="adm-dir-chip-c">{d.registered}</span>}
          </button>
        ))}
      </div>

      {loading && !data && <p className="adm-muted">Загрузка…</p>}
      {loading && !!data && <p className="adm-muted" style={{ fontSize: 12 }}>Обновление…</p>}
      {err && <p className="adm-error">{err}</p>}

      {data && layer === 'forum' && !fl && (
        <p className="adm-muted">Нет данных слоя сравнения — обновите backend (Redeploy).</p>
      )}

      {data && layer === 'forum' && fl && (
        <>
          <DayResultsSection
            id="hub-dir-forum-overview"
            title="Что собрано за день"
            note="Строка «на человека» важнее абсолютных чисел: она показывает, живёт ли инструмент в направлении."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: String(fl.forum.state),
                  label: 'Замеров состояния',
                  sub: `${(fl.forum.state / Math.max(fl.forum.reg, 1)).toFixed(1)} на участника`,
                },
                {
                  value: String(fl.forum.fb),
                  label: 'Комментариев после блоков',
                  sub: `${(fl.forum.fb / Math.max(fl.forum.reg, 1)).toFixed(1)} на участника`,
                },
                {
                  value: String(fl.forum.kop),
                  label: 'Записей в копилку',
                  sub: `${(fl.forum.kop / Math.max(fl.forum.reg, 1)).toFixed(2)} на участника`,
                },
                {
                  value: String(fl.forum.q),
                  label: 'Вопросов в обмене',
                  sub: `${(fl.forum.q / Math.max(fl.forum.reg, 1)).toFixed(2)} на участника`,
                },
                {
                  value: `${fl.forum.negDay}%`,
                  label: 'В риске и усталости днём',
                  sub: 'по всему форуму',
                },
              ]}
            />
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-forum-matrix"
            title="Сводная матрица направлений"
            note="Цвет — место в ряду, не абсолютное значение. Объёмы нормированы на зарегистрированных."
          >
            <DashCard>
              <div className="adm-day-results-scroll">
                <table className="adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      {[
                        ['state', 'Замеров / чел.', true],
                        ['fb', 'Коммент. / чел.', true],
                        ['kop', 'Копилка / чел.', true],
                        ['q', 'Вопросов / чел.', true],
                        ['eMorn', 'Энергия утро', true],
                        ['eDay', 'Энергия день', true],
                        ['negDay', 'Риск днём %', false],
                        ['points', 'Точки', true],
                        ['exp', 'Балл «Опыт»', true],
                      ].map(([k, label]) => (
                        <th key={String(k)} style={{ textAlign: 'center', maxWidth: 76, whiteSpace: 'normal' }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fl.overview.map(r => {
                      const cols: Array<{ key: string; v: number | null; up: boolean }> = [
                        { key: 'state', v: +(r.state / Math.max(r.reg, 1)).toFixed(2), up: true },
                        { key: 'fb', v: +(r.fb / Math.max(r.reg, 1)).toFixed(2), up: true },
                        { key: 'kop', v: +(r.kop / Math.max(r.reg, 1)).toFixed(2), up: true },
                        { key: 'q', v: +(r.q / Math.max(r.reg, 1)).toFixed(2), up: true },
                        { key: 'eMorn', v: r.eMorn, up: true },
                        { key: 'eDay', v: r.eDay, up: true },
                        { key: 'negDay', v: r.negDay, up: false },
                        { key: 'points', v: r.points, up: true },
                        { key: 'exp', v: r.exp, up: true },
                      ];
                      return (
                        <tr key={r.dir} className={r.dir === cur ? 'adm-dir-row-me' : undefined}>
                          <td>
                            {r.dir}
                            <div className="adm-muted" style={{ fontSize: 11 }}>{r.reg} чел.</div>
                          </td>
                          {cols.map(c => {
                            const vals = fl.overview
                              .map(o => {
                                if (c.key === 'state') return +(o.state / Math.max(o.reg, 1)).toFixed(2);
                                if (c.key === 'fb') return +(o.fb / Math.max(o.reg, 1)).toFixed(2);
                                if (c.key === 'kop') return +(o.kop / Math.max(o.reg, 1)).toFixed(2);
                                if (c.key === 'q') return +(o.q / Math.max(o.reg, 1)).toFixed(2);
                                if (c.key === 'eMorn') return o.eMorn;
                                if (c.key === 'eDay') return o.eDay;
                                if (c.key === 'negDay') return o.negDay;
                                if (c.key === 'points') return o.points;
                                return o.exp;
                              })
                              .filter((v): v is number => v != null);
                            return (
                              <td key={c.key} style={{ textAlign: 'center', padding: 4 }}>
                                {c.v == null ? (
                                  <span className="adm-muted">—</span>
                                ) : (
                                  <span
                                    className="adm-day-results-cell"
                                    style={{ background: heatRank(vals, c.v, c.up) }}
                                  >
                                    {c.v}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-forum-feedback"
            title="Характер обратной связи"
            note="Важно соотношение «содержательное к пустому»: работает ли вопрос после блока или собирает отписки."
          >
            <DashCard>
              {fl.overview.map(r => {
                const tot = r.fbDist.reduce((a, b) => a + b, 0) || 1;
                const sub = Math.round(((r.fbDist[2] ?? 0) / tot) * 100);
                return (
                  <div key={r.dir} style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                      <span style={{ fontSize: 13.5 }}>{r.dir}</span>
                      <span className="adm-muted" style={{ fontSize: 12.5 }}>
                        {tot} · содержательных {sub}%
                      </span>
                    </div>
                    <StackBar
                      items={fl.fbCats.map((name, i) => ({ name, n: r.fbDist[i] ?? 0 }))}
                      colors={FB_COLORS}
                    />
                  </div>
                );
              })}
              <div className="adm-day-results-legend" style={{ marginTop: 12 }}>
                {fl.fbCats.map((c, i) => (
                  <span key={c}><i style={{ background: FB_COLORS[i] }} />{c}</span>
                ))}
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-forum-state"
            title="Состояние и энергия"
            note="Опираться на долю риска и топ-эмоцию. Энергию читать только как направление сдвига."
          >
            <div className="adm-dir-grid2">
              <DashCard title="Доля в риске и усталости днём">
                {[...fl.overview].sort((a, b) => b.negDay - a.negDay).map(r => {
                  const nm = Math.max(...fl.overview.map(x => x.negDay || 0), 1);
                  return (
                    <div key={r.dir} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{r.dir}</div>
                        <HBar
                          widthPct={(r.negDay / nm) * 100}
                          color={r.negDay >= 30 ? '#e2685e' : r.negDay >= 20 ? '#e6ae4a' : '#6f7d95'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{r.negDay}%</div>
                    </div>
                  );
                })}
              </DashCard>
              <DashCard title="Топ-эмоция дня и динамика энергии">
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <tbody>
                      {fl.overview.map(r => {
                        const dz = r.eDay != null && r.eMorn != null ? +(r.eDay - r.eMorn).toFixed(1) : null;
                        const warn = r.topEmoDay ? NEG_EMO.has(r.topEmoDay) : false;
                        return (
                          <tr key={r.dir}>
                            <td>{r.dir}</td>
                            <td className="adm-muted" style={{ textAlign: 'center' }}>
                              {r.eMorn ?? '—'} → {r.eDay ?? '—'}
                            </td>
                            <td style={{ textAlign: 'center', color: dz == null ? undefined : dz > 0 ? '#0f766e' : dz < 0 ? '#b91c1c' : undefined }}>
                              {dz == null ? '—' : `${dz > 0 ? '+' : ''}${dz}`}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {r.topEmoDay && <Flag tone={warn ? 'warn' : 'ok'}>{r.topEmoDay}</Flag>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-forum-mechanics"
            title="Программа и обмен: два механизма"
            note="«Путь» — прохождение программы. «Опыт» — добровольное участие в обмене. Сводить в один балл нельзя."
          >
            <DashCard>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={[...fl.actCmp].sort((a, b) => b.exp - a.exp)}
                    margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(111,125,149,0.25)" />
                    <XAxis dataKey="dir" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="path" name="Путь" fill="#6f7d95" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="exp" name="Опыт" fill="#e6ae4a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-forum-tools"
            title="Копилка и обмен опытом"
            note="Здесь измеряется не объём, а намерение: какой тег преобладает и какая доля вопросов без рубрики."
          >
            <div className="adm-dir-grid2">
              <DashCard title="Копилка">
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Направление</th>
                        <th style={{ textAlign: 'center' }}>Записей</th>
                        <th style={{ textAlign: 'center' }}>На чел.</th>
                        <th style={{ textAlign: 'right' }}>Преобладает</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fl.overview.map(r => (
                        <tr key={r.dir}>
                          <td>{r.dir}</td>
                          <td style={{ textAlign: 'center' }}>{r.kop}</td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">
                            {(r.kop / Math.max(r.reg, 1)).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {r.kopTop ? (
                              <Flag tone={['в работу', 'идея'].includes(r.kopTop) ? 'ok' : 'warn'}>
                                {r.kopTop} · {r.kopTopN}
                              </Flag>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashCard>
              <DashCard title="Обмен опытом">
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Направление</th>
                        <th style={{ textAlign: 'center' }}>Вопросов</th>
                        <th style={{ textAlign: 'center' }}>На 100</th>
                        <th style={{ textAlign: 'center' }}>Без рубрики</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fl.overview.map(r => (
                        <tr key={r.dir}>
                          <td>{r.dir}</td>
                          <td style={{ textAlign: 'center' }}>{r.q}</td>
                          <td style={{ textAlign: 'center' }} className="adm-muted">
                            {Math.round((r.q / Math.max(r.reg, 1)) * 100)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Flag tone={r.qOther >= 60 ? 'bad' : r.qOther >= 30 ? 'warn' : 'ok'}>
                              {r.qOther}%
                            </Flag>
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
            id="hub-dir-forum-readout"
            title="Что это значит · читаемый вывод"
            note="Текст собирается из тех же чисел, что и графики: пороги и сравнения заданы правилами."
          >
            <DashCard>
              {conclusions.map((c, i) => (
                <ConclusionCard key={c.h} c={c} index={i} />
              ))}
              <p className="adm-day-results-callout">
                Выводы пересобираются при каждом обновлении данных. Если формулировка перестала соответствовать
                реальности — значит, изменились числа: смотрите на блок, из которого вывод собран.
              </p>
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-forum-actions"
            title="Куда идти сегодня"
            note="Направление попадает в список, если набрало минимум два сигнала: нагрузка, отдача или вовлечённость."
          >
            <DashCard>
              {alerts.length === 0 ? (
                <p className="adm-muted">Сегодня ни одно направление не набрало двух сигналов сразу.</p>
              ) : alerts.map(a => (
                <div key={a.dir} className="adm-narr-alert">
                  <div className="adm-narr-alert-d">{a.dir}</div>
                  <div className="adm-muted">{a.sig.join(' · ')}</div>
                </div>
              ))}
            </DashCard>
          </DayResultsSection>

          {data.series.length > 0 && (
            <DayResultsSection id="hub-dir-forum-dynamics" title="Динамика по дням" note="Сравнение направлений по выбранному инструменту.">
              <HubDirectionDynamics
                series={data.series}
                instruments={data.instruments}
                dirs={data.dirs.map(d => d.dir)}
                dirColors={data.dirColors}
                selectedDir={cur !== '—' ? cur : null}
              />
            </DayResultsSection>
          )}
        </>
      )}

      {data && layer === 'dir' && (
        <>
          <DayResultsSection
            id="hub-dir-kpi"
            title="Ключевые показатели"
            note="Число само по себе ничего не значит: важно, больше или меньше оно ожидаемого для размера направления."
          >
            <HubKpiRow
              cols={4}
              items={(() => {
                const ov = fl?.overview.find(r => r.dir === cur);
                const reg = Math.max(m?.registered || ov?.reg || 1, 1);
                const freg = Math.max(fl?.forum.reg || data.meta.forumRegistered || 1, 1);
                const rows: Array<[string, number, number]> = [
                  ['Отметок состояния', data.state.n, fl?.forum.state ?? 0],
                  ['Комментариев после блоков', data.refl.n, fl?.forum.fb ?? 0],
                  ['Записей в копилке', data.kop.n, fl?.forum.kop ?? 0],
                  ['Вопросов в обмене', data.exch.q, fl?.forum.q ?? 0],
                ];
                return [
                  ...rows.map(([label, v, f]) => {
                    const p = +(v / reg).toFixed(2);
                    const fp = +(f / freg).toFixed(2);
                    return {
                      value: String(v),
                      label,
                      sub: `${p} на чел. · ${p >= fp ? 'выше' : 'ниже'} форума (${fp})`,
                    };
                  }),
                  {
                    value: `${ov?.negDay ?? data.state.neg}%`,
                    label: 'Риск и усталость днём',
                    sub: `по форуму ${fl?.forum.negDay ?? data.forum.neg}%`,
                  },
                ];
              })()}
            />
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-portrait"
            title="Портрет относительно форума"
            note="Отклонение от среднего по форуму. Зелёный — направление сильнее форума (для усталости — меньше)."
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
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-phases"
            title="Состояние по фазам"
            note="Зоны внутри каждой проверки. Медиана энергии — справочно; картину задают зоны."
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
                            <div key={z} style={{ height: `${pc}%`, background: ZONE_COLORS[z] }}>
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
                  <span key={z}><i style={{ background: ZONE_COLORS[z] }} />{z}</span>
                ))}
              </div>
            </DashCard>
            {narr?.state && <ConclusionCard c={narr.state} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-emotions"
            title="Эмоции по фазам"
            note="Одна и та же эмоция в разное время означает разное: усталость утром — про сон, днём — про нагрузку блока."
          >
            <DashCard>
              {(data.state.emoPhase ?? []).length === 0 ? (
                <p className="adm-muted">Нет отметок эмоций в срезе</p>
              ) : (
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Эмоция</th>
                        <th style={{ textAlign: 'center' }}>Утро</th>
                        <th style={{ textAlign: 'center' }}>День</th>
                        <th style={{ textAlign: 'center' }}>Вечер</th>
                        <th style={{ textAlign: 'center' }}>Всего</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(data.state.emoPhase ?? [])]
                        .sort((a, b) => (b.v[0]! + b.v[1]! + b.v[2]!) - (a.v[0]! + a.v[1]! + a.v[2]!))
                        .map(e => {
                          const tot = e.v.reduce((a, b) => a + b, 0);
                          const neg = NEG_EMO.has(e.emo);
                          const mx = Math.max(...(data.state.emoPhase ?? []).flatMap(x => x.v), 1);
                          return (
                            <tr key={e.emo}>
                              <td style={{ color: neg ? '#b45309' : undefined }}>{e.emo}</td>
                              {e.v.map((v, i) => (
                                <td key={i} style={{ textAlign: 'center', padding: 4 }}>
                                  <span
                                    className="adm-day-results-cell"
                                    style={{
                                      background: v
                                        ? `rgba(${neg ? '226,104,94' : '87,189,156'},${Math.min(v / mx, 1) * 0.5})`
                                        : 'transparent',
                                    }}
                                  >
                                    {v || '·'}
                                  </span>
                                </td>
                              ))}
                              <td style={{ textAlign: 'center' }} className="adm-muted"><b>{tot}</b></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="adm-muted" style={{ marginTop: 14, fontSize: 12 }}>
                Сравнение с форумом · {data.state.n} отметок
              </div>
              {data.emotions.slice(0, 6).map(e => (
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
            {narr?.emo && <ConclusionCard c={narr.emo} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-reasons"
            title="Причины состояния"
            note="Категории по тексту пояснения. Это то, что штаб может изменить завтра."
          >
            <DashCard>
              {data.state.themes.map(t => (
                <div key={t.name} className="adm-day-results-row">
                  <div>
                    <div className="adm-day-results-lb">{t.name}</div>
                    <HBar
                      widthPct={(t.n / themeMax) * 100}
                      color={t.name === 'Без пояснения' ? '#6f7d95' : '#e6ae4a'}
                    />
                  </div>
                  <div className="adm-day-results-nb">{t.n}</div>
                </div>
              ))}
            </DashCard>
            {narr?.reason && <ConclusionCard c={narr.reason} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-after"
            title="Обратная связь после блоков"
            note="Содержательность важнее объёма. Дефект чаще в вопросе, а не в участниках."
          >
            <DashCard>
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
              <p className="adm-muted" style={{ marginTop: 12, fontSize: 12 }}>
                {data.refl.n} текстов · присвоение {data.refl.own}% · охват {data.refl.cov}%
              </p>
            </DashCard>
            {narr?.fb && <ConclusionCard c={narr.fb} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-piggy"
            title="Копилка"
            note="Тег показывает, доходит ли запись до намерения."
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
                {data.kop.tags.filter(t => t.n > 0).map(t => (
                  <div key={t.tag} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{t.tag}</div>
                      <HBar
                        widthPct={(t.n / tagMax) * 100}
                        color={['в работу', 'на будущее', 'идея'].includes(t.tag) ? '#57bd9c' : '#6f7d95'}
                      />
                    </div>
                    <div className="adm-day-results-nb">{t.n}</div>
                  </div>
                ))}
              </DashCard>
              <DashCard title="Откуда приходит материал">
                {data.kop.sources.length === 0 ? (
                  <p className="adm-muted">Нет записей</p>
                ) : data.kop.sources.map(s => (
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
            {narr?.kop && <ConclusionCard c={narr.kop} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-dir-exchange"
            title="Обмен опытом"
            note="Спрашивать и отвечать — разные роли."
          >
            <DashCard>
              <div className="adm-dir-mini-kpis">
                <div><div className="v">{data.exch.q}</div><div className="l">вопросов</div></div>
                <div><div className="v">{data.exch.a}</div><div className="l">ответов</div></div>
                <div><div className="v">{data.exch.cov}%</div><div className="l">охват</div></div>
              </div>
              {data.exch.cats.length === 0 ? (
                <p className="adm-muted" style={{ marginTop: 12 }}>Вопросов от направления нет</p>
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
            </DashCard>
            {narr?.q && <ConclusionCard c={narr.q} />}
          </DayResultsSection>

          {summary && (
            <DayResultsSection
              id="hub-dir-summary"
              title="Итог для утреннего штаба"
              note="Заголовки шести выводов и три первых действия — то, что куратор говорит за тридцать секунд."
            >
              <DashCard>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{summary.titles}</p>
                <ol className="adm-narr-actions">
                  {summary.actions.map(a => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </DashCard>
            </DayResultsSection>
          )}

          {data.groups.length > 0 && (
            <DayResultsSection
              id="hub-dir-groups"
              title="Группы направления"
              note="Рабочий список: где проседает индекс или точки осмысления."
            >
              <DashCard>
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Группа</th>
                        <th style={{ textAlign: 'center' }}>N</th>
                        <th style={{ textAlign: 'center' }}>Индекс</th>
                        <th style={{ textAlign: 'center' }}>Риск %</th>
                        <th style={{ textAlign: 'center' }}>Точки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.groups.map(g => (
                        <tr key={g.g}>
                          <td>{g.g}</td>
                          <td style={{ textAlign: 'center' }}>{g.n}</td>
                          <td style={{ textAlign: 'center' }}>{fmt(g.idx)}</td>
                          <td style={{ textAlign: 'center' }}>{fmt(g.neg)}</td>
                          <td style={{ textAlign: 'center' }}>{fmt(g.pts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashCard>
            </DayResultsSection>
          )}

          {data.matrix.rows.length > 0 && (
            <DayResultsSection id="hub-dir-rank" title="Место в ряду направлений" note="Цвет — ранг среди направлений по метрике.">
              <DashCard>
                <div className="adm-day-results-scroll">
                  <table className="adm-day-results-table">
                    <thead>
                      <tr>
                        <th>Направление</th>
                        {data.matrix.keys.map(k => (
                          <th key={k.key} style={{ textAlign: 'center' }}>{k.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrix.rows.map(row => (
                        <tr key={row.dir} className={row.dir === cur ? 'adm-dir-row-me' : undefined}>
                          <td>{row.dir}</td>
                          {row.cells.map(c => (
                            <td key={c.key} style={{ textAlign: 'center', padding: 4 }}>
                              <span
                                className="adm-day-results-cell"
                                style={{ background: cellBg(c.tone) }}
                              >
                                {fmt(c.v)}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashCard>
            </DayResultsSection>
          )}
        </>
      )}
    </HubLensLayout>
  );
}
