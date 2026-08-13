import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { EmotionDynamicsPanel } from '../analytics/EmotionDynamicsPanel';
import { EmotionPhaseHeatmap } from '../analytics/EmotionPhaseHeatmap';
import { ParticipantPathPanel } from '../analytics/ParticipantPathPanel';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubDisplayDay, hubFilterParams, isAllForumDay } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
  lowTone,
} from './dayResultsUi';
import { HubLensLayout, type HubNavItem } from './HubSideNav';
import { ConclusionCard } from './directionNarrative';
import { stateNarr } from './hubNarrative';

const ZONE_COLORS: Record<string, string> = {
  'Подъём': '#57bd9c',
  'Включение': '#79b8c9',
  'Нейтраль': '#6f7d95',
  'Усталость': '#e6ae4a',
  'Риск': '#e2685e',
};

const QUOTE_ZONE_ORDER = ['Подъём', 'Включение', 'Нейтраль', 'Усталость', 'Риск'] as const;

type StateData = {
  meta: {
    day: number;
    answers: number;
    participants: number;
    registered: number;
    reasons: number;
    attentionGroups: number;
    currentPhase: string;
    currentNeg: number;
    prevNeg: number | null;
    psychoCount: number;
    coveragePct: number;
    reasonCoveragePct?: number;
    noReasonPct?: number;
  };
  zones: string[];
  zoneByPhase: Array<{
    phase: string;
    phaseKey: string;
    dist: number[];
    n: number;
    energy: number | null;
    neg: number | null;
  }>;
  dirs: Array<{
    dir: string; n: number; people: number; registered: number; cov: number;
    risk: number; tired: number; up: number; reason: number;
  }>;
  groups: Array<{
    group: string; n: number; dir: string; neg: number; energy: number;
    cells: Array<{ n: number; neg: number | null }>;
  }>;
  themesNeg: Array<{ name: string; n: number }>;
  themesPos: Array<{ name: string; n: number }>;
  negCount: number;
  posCount?: number;
  quotes: Array<{
    text: string;
    meta: string;
    phase?: string;
    phaseKey?: 'morning' | 'day' | 'evening';
    zone?: string;
    zoneKey?: string | null;
    dir?: string;
    polarity?: 'pos' | 'neg' | 'neu';
  }>;
  quotesTotal?: number;
  energyHist: Array<{ v: number; n: number }>;
  energyMedian: number | null;
  transition: { n: number; m: number[][] };
  coverage: Array<{ k: number; n: number }>;
  daySeries: Array<{
    day: number; coveragePct: number | null; eveningNeg: number | null;
    answers: number; participants: number;
  }>;
  protocol: Array<{ when: string; what: string }>;
  exportPath?: string;
  participantPath?: {
    path?: unknown;
    pathShift?: unknown;
    emotionDynamics?: unknown;
    energyDynamics?: unknown;
  };
};

function covTone(cov: number): 'bad' | 'warn' | 'ok' {
  if (cov < 65) return 'bad';
  if (cov < 75) return 'warn';
  return 'ok';
}

function negCellStyle(neg: number | null, _n: number): CSSProperties {
  if (neg == null) {
    return { background: 'var(--m-bg)', color: 'var(--m-text-secondary)' };
  }
  const a = Math.min(neg / 50, 1);
  return {
    background: `rgba(226, 104, 94, ${(a * 0.5).toFixed(2)})`,
    color: neg >= 30 ? '#b91c1c' : 'var(--m-text)',
  };
}

type QuotePhase = 'all' | 'morning' | 'day' | 'evening';
type QuoteDayPart = 'morning' | 'day' | 'evening';
type StateQuote = StateData['quotes'][number];

const ZONE_FROM_KEY: Record<string, string> = {
  lift: 'Подъём',
  engagement: 'Включение',
  neutral: 'Нейтраль',
  fatigue: 'Усталость',
  risk: 'Риск',
};

function quotePhaseKey(q: StateQuote): QuoteDayPart | 'other' {
  if (q.phaseKey === 'morning' || q.phaseKey === 'day' || q.phaseKey === 'evening') return q.phaseKey;
  const src = `${q.phase || ''} ${q.meta || ''}`.toLowerCase();
  if (src.includes('вечер')) return 'evening';
  if (src.includes('утро')) return 'morning';
  if (src.includes('день')) return 'day';
  return 'other';
}

function quoteZoneLabel(q: StateQuote): string {
  if (q.zone && q.zone !== '—') return q.zone;
  if (q.zoneKey && ZONE_FROM_KEY[q.zoneKey]) return ZONE_FROM_KEY[q.zoneKey];
  const fromMeta = (q.meta.split(' · ')[1] || '').trim();
  return fromMeta || '—';
}

function quoteTone(q: StateQuote): 'pos' | 'neg' | 'neu' {
  if (q.polarity === 'pos' || q.polarity === 'neg' || q.polarity === 'neu') return q.polarity;
  const zone = quoteZoneLabel(q);
  if (zone === 'Риск' || zone === 'Усталость') return 'neg';
  if (zone === 'Подъём' || zone === 'Включение') return 'pos';
  return 'neu';
}

function quoteDir(q: StateQuote): string {
  if (q.dir) return q.dir;
  const parts = q.meta.split(' · ');
  return (parts[2] || '').trim();
}

/**
 * Линза «Состояние» — пульт проверок состояния для штаба.
 * GET /analytics/hub/state
 */
const STATE_NAV: HubNavItem[] = [
  { id: 'hub-state-now', label: 'Сейчас' },
  { id: 'hub-state-phases', label: 'Срез' },
  { id: 'hub-state-dirs', label: 'Направления' },
  { id: 'hub-state-groups', label: 'Группы' },
  { id: 'hub-state-reasons', label: 'Причины' },
  { id: 'hub-state-energy', label: 'Энергия' },
  { id: 'hub-state-traj', label: 'Траектории' },
  { id: 'hub-state-dynamics', label: 'Динамика' },
  { id: 'hub-state-path', label: 'Путь' },
  { id: 'hub-state-emo-dyn', label: 'Эмоции' },
  { id: 'hub-state-emo-heat', label: 'Теплокарта' },
  { id: 'hub-state-protocol', label: 'Протокол' },
];

export function HubStateScreen() {
  const {
    adminFetch, forumDay, setForumDay, meta, ageCategory, activity, direction, group,
  } = useInsights();
  const [data, setData] = useState<StateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quoteLimit, setQuoteLimit] = useState(24);
  const [quotePhase, setQuotePhase] = useState<QuotePhase>('all');
  const [quoteZones, setQuoteZones] = useState<string[]>([]);
  const [quoteDirFilter, setQuoteDirFilter] = useState('');
  const [quoteSort, setQuoteSort] = useState<'neg' | 'pos'>('neg');

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
    adminFetch(`/analytics/hub/state?${params.toString()}`)
      .then(res => setData(res as StateData))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить состояние');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, forumDay, direction, group, ageCategory, activity]);

  useEffect(() => {
    setQuoteLimit(24);
  }, [quotePhase, quoteZones, quoteDirFilter, quoteSort, forumDay, direction, group]);

  const allForum = isAllForumDay(forumDay);
  const selectedDay = hubDisplayDay(forumDay, meta?.currentForumDay || 1);
  const m = data?.meta;

  const reasonConclusion = useMemo(() => {
    if (!data || !m) return null;
    return stateNarr({
      answers: m.answers,
      reasons: m.reasons,
      reasonCoveragePct: m.reasonCoveragePct
        ?? (m.answers ? Math.round((m.reasons / m.answers) * 100) : 0),
      noReasonPct: m.noReasonPct
        ?? (m.answers ? Math.round(((m.answers - m.reasons) / m.answers) * 100) : 0),
      currentNeg: m.currentNeg,
      negCount: data.negCount,
      themesNeg: data.themesNeg,
      psychoCount: m.psychoCount,
    });
  }, [data, m]);

  const quoteDirs = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.quotes.map(quoteDir).filter(d => d && d !== '—'))].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [data]);

  const filteredQuotes = useMemo(() => {
    if (!data) return [];
    const zoneSet = new Set(quoteZones);
    const list = data.quotes.filter(q => {
      if (quotePhase !== 'all' && quotePhaseKey(q) !== quotePhase) return false;
      if (zoneSet.size > 0 && !zoneSet.has(quoteZoneLabel(q))) return false;
      if (quoteDirFilter && quoteDir(q) !== quoteDirFilter) return false;
      return true;
    });
    const rank = (q: StateQuote) => {
      const t = quoteTone(q);
      if (quoteSort === 'neg') return t === 'neg' ? 0 : t === 'neu' ? 1 : 2;
      return t === 'pos' ? 0 : t === 'neu' ? 1 : 2;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [data, quotePhase, quoteZones, quoteDirFilter, quoteSort]);

  const quoteCounts = useMemo(() => {
    const phases = { morning: 0, day: 0, evening: 0 };
    const zones: Record<string, number> = {
      'Подъём': 0, 'Включение': 0, 'Нейтраль': 0, 'Усталость': 0, 'Риск': 0, '—': 0,
    };
    if (!data) return { phases, zones };
    for (const q of data.quotes) {
      const p = quotePhaseKey(q);
      if (p === 'morning' || p === 'day' || p === 'evening') phases[p] += 1;
      const z = quoteZoneLabel(q);
      zones[z] = (zones[z] || 0) + 1;
    }
    return { phases, zones };
  }, [data]);

  return (
    <HubLensLayout className="adm-day-results" items={STATE_NAV} navLabel="Разделы состояния">
      <DashScreenTitle
        title="Состояние участников"
        hint={
          m
            ? `День ${m.day} · ${m.answers} ответов · ${m.participants} участников · охват ${m.coveragePct}%`
            : 'Пульт проверок состояния: куда идти в ближайший час'
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
            id="hub-state-now"
            title="Сейчас"
            note="Панель отвечает на один вопрос: куда идти в ближайший час."
          >
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: `${m.coveragePct}%`,
                  label: 'Охват проверок состояния',
                  sub: `${m.participants} из ${m.registered} зарегистрированных`,
                },
                {
                  value: `${m.currentNeg}%`,
                  label: `Усталость и риск · ${m.currentPhase.toLowerCase()}`,
                  sub: m.prevNeg != null ? `ранее ${m.prevNeg}%` : 'нет предыдущей фазы',
                  accent: m.currentNeg > 25 ? '#b91c1c' : undefined,
                },
                {
                  value: m.attentionGroups,
                  label: 'Групп в зоне внимания',
                  sub: 'четверть и больше ответов в минусе',
                },
                {
                  value: m.reasons,
                  label: 'Текстовых причин за день',
                  sub: m.answers
                    ? `${Math.round((m.reasons / m.answers) * 100)}% ответов с пояснением`
                    : undefined,
                },
              ]}
            />
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-phases"
            title="Срез дня по трём точкам"
            note="Утро, день и вечер — три независимых замера: состав отвечающих разный. Сравнивать можно доли внутри фазы."
          >
            <div className="adm-state-phases">
              {data.zoneByPhase.map(z => {
                const tot = z.dist.reduce((a, b) => a + b, 0) || 1;
                return (
                  <div key={z.phase} className="adm-state-phase">
                    <h3>{z.phase}</h3>
                    <div className="adm-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                      {z.n} ответов
                      {z.energy != null ? ` · энергия ${z.energy}` : ''}
                      {z.neg != null ? ` · минус ${z.neg}%` : ''}
                    </div>
                    <div className="adm-state-col">
                      {data.zones.map((zn, i) => {
                        const p = (z.dist[i] / tot) * 100;
                        return (
                          <div
                            key={zn}
                            style={{ height: `${p}%`, background: ZONE_COLORS[zn] || '#6f7d95' }}
                          >
                            {p >= 7 ? `${Math.round(p)}%` : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="adm-day-results-legend" style={{ marginTop: 12 }}>
              {data.zones.map(z => (
                <span key={z}><i style={{ background: ZONE_COLORS[z] }} />{z}</span>
              ))}
            </div>
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-dirs"
            title="Направления"
            note="Охват важнее среднего: направление, которое перестало отвечать, опаснее направления с низкой энергией."
          >
            <DashCard className="adm-day-results-scroll">
              {data.dirs.length === 0 ? (
                <p className="adm-muted">Нет данных по направлениям.</p>
              ) : (
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      <th style={{ textAlign: 'center' }}>Охват</th>
                      <th style={{ textAlign: 'center' }}>Риск</th>
                      <th style={{ textAlign: 'center' }}>Усталость</th>
                      <th style={{ textAlign: 'center' }}>Подъём</th>
                      <th style={{ textAlign: 'center' }}>С причиной</th>
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
                        <td style={{ textAlign: 'center', color: d.risk >= 7.5 ? '#b91c1c' : undefined }}>
                          {d.risk}%
                        </td>
                        <td style={{ textAlign: 'center', color: d.tired >= 15 ? '#b45309' : undefined }}>
                          {d.tired}%
                        </td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{d.up}%</td>
                        <td style={{ textAlign: 'center' }} className="adm-muted">{d.reason}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-groups"
            title="Группы: карта обхода"
            note="Серая клетка — меньше 5 ответов в фазе. Строки только от 15 ответов за день."
          >
            <DashCard className="adm-day-results-scroll">
              {data.groups.length === 0 ? (
                <p className="adm-muted">Нет групп с n ≥ 15.</p>
              ) : (
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Группа</th>
                      <th>Направление</th>
                      <th style={{ textAlign: 'center' }}>Утро</th>
                      <th style={{ textAlign: 'center' }}>День</th>
                      <th style={{ textAlign: 'center' }}>Вечер</th>
                      <th style={{ textAlign: 'center' }}>Энергия</th>
                      <th style={{ textAlign: 'center' }}>Минус за день</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.slice(0, 12).map(r => (
                      <tr key={r.group}>
                        <td style={{ fontWeight: 600 }}>{r.group}</td>
                        <td className="adm-muted">{r.dir}</td>
                        {r.cells.map((c, i) => (
                          <td key={i} style={{ padding: 4 }}>
                            <span className="adm-day-results-cell" style={negCellStyle(c.neg, c.n)}>
                              {c.neg == null ? `n=${c.n}` : `${c.neg}%`}
                            </span>
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }} className="adm-muted">{r.energy}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Flag tone={lowTone(r.neg)}>{r.neg}%</Flag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-reasons"
            title="Причины"
            note="Фильтры только для этой ленты: часть дня и вид состояния (подъём, включение, нейтраль, усталость, риск). Имена скрыты."
          >
            <div className="adm-dash-grid adm-dash-grid-2">
            <DashCard title={`Темы негативных причин · ${data.negCount}`}>
              {data.themesNeg.length === 0 ? (
                <p className="adm-muted">Нет размеченных тем.</p>
              ) : (
                (() => {
                  const mx = Math.max(...data.themesNeg.map(x => x.n), 1);
                  return data.themesNeg.map(x => (
                    <div key={x.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.name}</div>
                        <HBar
                          widthPct={(x.n / mx) * 100}
                          color={x.n / mx > 0.5 ? '#e2685e' : '#e6ae4a'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{x.n}</div>
                    </div>
                  ));
                })()
              )}
              {m.psychoCount > 0 && (
                <p className="adm-day-results-callout">
                  {m.psychoCount} ответов помечены как внешние/личные — не в общей ленте.
                </p>
              )}
            </DashCard>
            <DashCard title={`Темы положительных причин · ${data.posCount ?? 0}`}>
              {data.themesPos.length === 0 ? (
                <p className="adm-muted">Нет размеченных тем.</p>
              ) : (
                (() => {
                  const mx = Math.max(...data.themesPos.map(x => x.n), 1);
                  return data.themesPos.map(x => (
                    <div key={x.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{x.name}</div>
                        <HBar
                          widthPct={(x.n / mx) * 100}
                          color="#57bd9c"
                        />
                      </div>
                      <div className="adm-day-results-nb">{x.n}</div>
                    </div>
                  ));
                })()
              )}
            </DashCard>
            </div>
            <DashCard
              title={`Комментарии участников · ${filteredQuotes.length}${
                filteredQuotes.length !== (data.quotesTotal ?? data.quotes.length)
                  ? ` из ${data.quotesTotal ?? data.quotes.length}`
                  : ''
              }`}
              className="adm-hub-quotes-card"
            >
              <div className="adm-state-quote-filters">
                <div className="adm-state-quote-filter-row">
                  <span className="adm-state-quote-filter-label">Часть дня</span>
                  <div className="adm-forum-seg" role="group" aria-label="Часть дня">
                    {([
                      ['all', 'Все'],
                      ['morning', `Утро · ${quoteCounts.phases.morning}`],
                      ['day', `День · ${quoteCounts.phases.day}`],
                      ['evening', `Вечер · ${quoteCounts.phases.evening}`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={quotePhase === key ? 'on' : ''}
                        onClick={() => setQuotePhase(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="adm-state-quote-filter-row">
                  <span className="adm-state-quote-filter-label">Состояние</span>
                  <div className="adm-forum-seg" role="group" aria-label="Вид состояния">
                    <button
                      type="button"
                      className={quoteZones.length === 0 ? 'on' : ''}
                      onClick={() => setQuoteZones([])}
                    >
                      Все
                    </button>
                    {QUOTE_ZONE_ORDER.map(zone => (
                      <button
                        key={zone}
                        type="button"
                        className={quoteZones.includes(zone) ? 'on' : ''}
                        onClick={() => setQuoteZones(prev => (
                          prev.includes(zone) ? prev.filter(z => z !== zone) : [...prev, zone]
                        ))}
                      >
                        <i
                          className="adm-state-quote-zone-dot"
                          style={{ background: ZONE_COLORS[zone] }}
                          aria-hidden
                        />
                        {zone} · {quoteCounts.zones[zone] || 0}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="adm-state-quote-filter-row">
                  <span className="adm-state-quote-filter-label">Сортировка</span>
                  <div className="adm-forum-seg" role="group" aria-label="Сортировка">
                    <button
                      type="button"
                      className={quoteSort === 'neg' ? 'on' : ''}
                      onClick={() => setQuoteSort('neg')}
                    >
                      Сначала минус
                    </button>
                    <button
                      type="button"
                      className={quoteSort === 'pos' ? 'on' : ''}
                      onClick={() => setQuoteSort('pos')}
                    >
                      Сначала плюс
                    </button>
                  </div>
                  <label className="adm-insights-filter">
                    Направление
                    <select
                      className="adm-input"
                      value={quoteDirFilter}
                      onChange={e => setQuoteDirFilter(e.target.value)}
                    >
                      <option value="">Все направления</option>
                      {quoteDirs.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {filteredQuotes.length === 0 ? (
                <p className="adm-muted">Нет комментариев по выбранным фильтрам.</p>
              ) : (
                <>
                  {filteredQuotes.slice(0, quoteLimit).map((q, i) => {
                    const zone = quoteZoneLabel(q);
                    return (
                      <div
                        key={i}
                        className={`adm-state-quote is-${quoteTone(q)}`}
                        style={{ borderLeftColor: ZONE_COLORS[zone] || '#6f7d95' }}
                      >
                        {q.text}
                        <span className="adm-state-quote-m">{q.meta}</span>
                      </div>
                    );
                  })}
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
            </DashCard>
            {reasonConclusion && <ConclusionCard c={reasonConclusion} />}
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-energy"
            title="Шкала энергии: осторожно"
            note="Среднюю энергии на решения не выносим: 5 и 10 часто артефакты ползунка."
          >
            <DashCard>
              {(() => {
                const mx = Math.max(...data.energyHist.map(x => x.n), 1);
                const anomN = (data.energyHist[5]?.n ?? 0) + (data.energyHist[10]?.n ?? 0);
                const tot = data.energyHist.reduce((a, x) => a + x.n, 0) || 1;
                return (
                  <>
                    <div className="adm-state-hist">
                      {data.energyHist.map(x => {
                        const anom = x.v === 5 || x.v === 10;
                        return (
                          <div key={x.v}>
                            <div
                              className="adm-state-hist-b"
                              style={{
                                height: `${(x.n / mx) * 100}%`,
                                background: anom ? '#e2685e' : '#6f7d95',
                              }}
                            />
                            <div className="adm-state-hist-x">{x.v}</div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="adm-day-results-callout">
                      На «5» и «10» вместе {Math.round((anomN / tot) * 100)}% замеров.
                      {m && data.energyMedian != null ? ` Медиана: ${data.energyMedian}.` : ''}
                    </p>
                  </>
                );
              })()}
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-traj"
            title="Траектории и охват"
            note="Переходы только по тем, кто отметился утром и вечером."
          >
            <div className="adm-dash-grid adm-dash-grid-2">
              <DashCard title={`Утро → вечер, ${data.transition.n} участников`}>
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Утро \ Вечер</th>
                      {data.zones.map(z => (
                        <th key={z} style={{ textAlign: 'center', fontSize: 10.5 }}>{z}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.transition.m.map((row, i) => {
                      const rs = row.reduce((a, b) => a + b, 0) || 1;
                      return (
                        <tr key={data.zones[i]}>
                          <td style={{ color: ZONE_COLORS[data.zones[i]] }}>{data.zones[i]}</td>
                          {row.map((v, j) => (
                            <td key={j} style={{ padding: 3 }}>
                              <span
                                className="adm-day-results-cell"
                                style={{
                                  background: `rgba(111,125,149,${(v / rs) * 0.75})`,
                                  color: v ? 'var(--m-text)' : 'var(--m-text-secondary)',
                                }}
                              >
                                {v || '·'}
                              </span>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DashCard>
              <DashCard title="Сколько проверок проходит участник">
                {(() => {
                  const mx = Math.max(...data.coverage.map(c => c.n), 1);
                  return data.coverage.map(c => (
                    <div key={c.k} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">
                          {c.k} {c.k === 1 ? 'проверка' : 'проверки'} из 3
                        </div>
                        <HBar
                          widthPct={(c.n / mx) * 100}
                          color={c.k === 3 ? '#57bd9c' : c.k === 1 ? '#e6ae4a' : '#6f7d95'}
                        />
                      </div>
                      <div className="adm-day-results-nb">{c.n}</div>
                    </div>
                  ));
                })()}
              </DashCard>
            </div>
          </DayResultsSection>

          <DayResultsSection id="hub-state-dynamics" title="Динамика по дням" note="Охват проверок состояния по дням форума.">
            <DashCard>
              <div className="adm-day-results-dyn">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(d => {
                  const pt = data.daySeries.find(s => s.day === d);
                  const cov = pt?.coveragePct;
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
            </DashCard>
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-path"
            title="Путь участника"
            note="Средние эмоция и энергия по проверкам состояния: утро → день → вечер за всю смену."
          >
            <ParticipantPathPanel
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={(data.participantPath?.pathShift ?? data.participantPath?.path) as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              energyDynamics={data.participantPath?.energyDynamics as any}
            />
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-emo-dyn"
            title="Динамика эмоций по смене"
            note="Отметьте эмоции — линии на обоих графиках. Глобальные фильтры штаба (дата / направление) применяются к данным."
          >
            <EmotionDynamicsPanel
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              intraDay={(data.participantPath?.pathShift as any)?.emotionSeries
                ?? (data.participantPath?.path as any)?.emotionSeries}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dynamics={data.participantPath?.emotionDynamics as any}
            />
          </DayResultsSection>

          <DayResultsSection
            id="hub-state-emo-heat"
            title="Тепловая карта эмоций"
            note="Доля каждой эмоции по фазам утро / день / вечер за все дни смены."
          >
            <EmotionPhaseHeatmap
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dynamics={data.participantPath?.emotionDynamics as any}
            />
          </DayResultsSection>

          <DayResultsSection id="hub-state-protocol" title="Протокол реагирования">
            <DashCard>
              {data.protocol.map(r => (
                <div key={r.when} className="adm-state-rule">
                  <div className="adm-state-rule-w">{r.when}</div>
                  <div>{r.what}</div>
                </div>
              ))}
            </DashCard>
          </DayResultsSection>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'state-checks',
                  label: 'Проверки состояния',
                  path: data.exportPath || `/exports/state-checks?mode=day&day=${selectedDay}`,
                  filename: `state_checks_d${selectedDay}.xlsx`,
                });
              }}
            >
              Скачать XLSX проверок состояния
            </button>
          </div>
        </>
      )}
    </HubLensLayout>
  );
}
