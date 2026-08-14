import { useEffect, useMemo, useState, Fragment } from 'react';
import { useInsights } from '../insights/InsightsContext';
import { DashCard, DashScreenTitle } from '../analytics/dashboardUi';
import { HubKpiRow } from './HubKpiRow';
import { downloadHubExport } from './hubExports';
import { hubFilterParams } from './hubQuery';
import {
  DayResultsSection,
  Flag,
  HBar,
  SpineBar,
  SpineLegend,
  heatCellStyle,
  scoreCellStyle,
  lowTone,
} from './dayResultsUi';
import { HubLensLayout, type HubNavItem } from './HubSideNav';
import { QuoteBrowser } from './QuoteBrowser';
import { PracticeRecommendNpsTable } from '../analytics/PracticeRecommendNpsTable';

type Block = { key: string; label: string; n: number; mean: number; dist: number[]; low: number };
type HeatRow = { dir: string; n: number; vals: Array<{ v: number | null; dev: number }>; idx: number; isForum?: boolean };
type DayCell = { filled: number; avg: number | null };
type BlockDayRatings = {
  fieldKey: string;
  fieldLabel: string;
  days: Array<{ day: number; label: string }>;
  rows: Array<{ direction: string; cells: DayCell[] }>;
};
type Quote = { text: string; meta?: string };
type ChoiceDist = {
  key: string;
  label: string;
  kind: string;
  n: number;
  items: Array<{ name: string; n: number; pct: number }>;
};
type TextSection = {
  key: string;
  label: string;
  kind: string;
  n: number;
  clusters: Array<{ name: string; n: number }>;
  quotes: Quote[];
};
type CompactCard = {
  key: string;
  label: string;
  kind: string;
  pct?: number;
  mean?: number;
  sub?: string;
  quotes: Quote[];
};
type Nps = {
  n: number;
  mean: number;
  criticsPct: number;
  passivePct: number;
  promotersPct: number;
  score: number;
  fieldLabel: string;
};

type ForumResultsData = {
  meta: {
    total: number;
    submitted: number;
    submittedPeople?: number;
    drafts: number;
    scaleN: number;
    index: number | null;
    fillRatePct: number;
    attentionBlocks: number;
    formalPct: number;
    questionCount: number;
  };
  blocks: Block[];
  heat: HeatRow[];
  heatForum?: HeatRow | null;
  blockDayRatings: BlockDayRatings[];
  nps: Nps | null;
  choices: ChoiceDist[];
  pointB: ChoiceDist | null;
  pointBBranches: Array<{ title: string; n: number; quotes: Quote[] }>;
  choiceFollowUps?: Record<string, Array<{ title: string; n: number; quotes: Quote[] }>>;
  texts: TextSection[];
  compact: CompactCard[];
  tags: Array<{ word: string; n: number }>;
  practiceRecommendNps?: {
    available?: boolean;
    note?: string;
    byPractice?: Array<{
      practice: string;
      responses: number;
      scores: Record<string, number>;
      nps: number;
    }>;
  };
  diagnostics?: { notes?: string[] };
  exportPath?: string;
};

const NAV: HubNavItem[] = [
  { id: 'hub-forum-pulse', label: 'Пульс' },
  { id: 'hub-forum-spine', label: 'Хребет' },
  { id: 'hub-forum-days', label: 'По дням' },
  { id: 'hub-forum-heatmap', label: 'Теплокарта' },
  { id: 'hub-forum-improve', label: 'Улучшения' },
  { id: 'hub-forum-nps', label: 'NPS' },
  { id: 'hub-forum-practices', label: 'Практики' },
  { id: 'hub-forum-pointb', label: 'Точка Б' },
  { id: 'hub-forum-role', label: 'Роль' },
  { id: 'hub-forum-selfway', label: 'Способ действовать' },
  { id: 'hub-forum-plans', label: 'Планы' },
  { id: 'hub-forum-choices', label: 'Другие вопросы' },
  { id: 'hub-forum-extra', label: 'Сервисы' },
  { id: 'hub-forum-final', label: 'Впечатления' },
];

const ROLE_COLORS = ['#B08D3F', '#1F5C4D', '#6FA98A', '#D98E4C', '#B23B32', '#7A6FB0', '#9A968A'];
const CHOICE_TONES = ['#2E7D53', '#2E7D53', '#1F5C4D', '#B08D3F', '#B08D3F', '#B23B32', '#9A968A'];

function barColor(kind: string, i: number, pct: number): string {
  if (kind === 'role') return ROLE_COLORS[i % ROLE_COLORS.length];
  if (kind === 'plan_when') {
    if (pct >= 30) return '#2E7D53';
    if (pct >= 15) return '#B7791F';
    return '#9A968A';
  }
  return CHOICE_TONES[i % CHOICE_TONES.length];
}

function drilldownInsight(block: BlockDayRatings | undefined): string {
  if (!block?.rows.length) return '';
  let worstDir = '';
  let worstVal = 99;
  let bestDir = '';
  let bestVal = 0;
  const dirMeans: Array<{ dir: string; mean: number }> = [];
  for (const row of block.rows) {
    const vals = row.cells.map(c => c.avg).filter((v): v is number => v != null);
    if (!vals.length) continue;
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    dirMeans.push({ dir: row.direction, mean: m });
    if (m < worstVal) { worstVal = m; worstDir = row.direction; }
    if (m > bestVal) { bestVal = m; bestDir = row.direction; }
  }
  if (!worstDir || !bestDir) return '';
  const forumMean = dirMeans.reduce((a, r) => a + r.mean, 0) / dirMeans.length;
  const delta = (forumMean - worstVal).toFixed(2);
  return `Автоматически по блоку «${block.fieldLabel}»: ниже всего оценивают «${worstDir}» — ${worstVal.toFixed(2)} (на ${delta} ниже среднего по форуму, ${forumMean.toFixed(2)}). Выше всего — «${bestDir}», ${bestVal.toFixed(2)}.`;
}

export function HubForumResultsScreen() {
  const { adminFetch, direction, group, ageCategory, activity } = useInsights();
  const [data, setData] = useState<ForumResultsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blockKey, setBlockKey] = useState('');

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const params = hubFilterParams({
      mode: 'shift',
      forumDay: 'all',
      direction,
      group,
      ageCategory,
      activity,
    });
    adminFetch(`/analytics/hub/forum-results?${params.toString()}`)
      .then(res => {
        const next = res as ForumResultsData;
        setData(next);
        setBlockKey(prev => {
          if (prev && next.blockDayRatings?.some(b => b.fieldKey === prev)) return prev;
          return next.blockDayRatings?.[0]?.fieldKey || next.blocks?.[0]?.key || '';
        });
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Не удалось загрузить итоги форума');
      })
      .finally(() => setLoading(false));
  }, [adminFetch, direction, group, ageCategory, activity]);

  const m = data?.meta;
  const selectedBlock = useMemo(
    () => data?.blockDayRatings?.find(b => b.fieldKey === blockKey) ?? data?.blockDayRatings?.[0],
    [data, blockKey],
  );
  const insight = useMemo(() => drilldownInsight(selectedBlock), [selectedBlock]);

  const improve = data?.texts.find(t => t.kind === 'improve');
  const selfway = data?.texts.find(t => t.kind === 'selfway');
  const nextstep = data?.texts.find(t => t.kind === 'nextstep');
  const finals = data?.texts.filter(t => t.kind === 'final') ?? [];
  const roleChoice = data?.choices.find(c => c.kind === 'role');
  const planWhen = data?.choices.find(c => c.kind === 'plan_when');
  const otherChoices = (data?.choices ?? []).filter(c =>
    c.kind !== 'point_b' && c.kind !== 'role' && c.kind !== 'plan_when',
  );
  const pointB = data?.pointB;

  const nav = useMemo(() => NAV.filter(item => {
    if (item.id === 'hub-forum-spine') return !!data?.blocks.length;
    if (item.id === 'hub-forum-days') return !!data?.blockDayRatings.length;
    if (item.id === 'hub-forum-heatmap') return !!data?.heat.length;
    if (item.id === 'hub-forum-improve') return !!improve;
    if (item.id === 'hub-forum-nps') return !!data?.nps;
    if (item.id === 'hub-forum-practices') {
      return !!(data?.practiceRecommendNps?.byPractice?.length || data?.practiceRecommendNps?.available);
    }
    if (item.id === 'hub-forum-pointb') return !!pointB;
    if (item.id === 'hub-forum-role') return !!roleChoice;
    if (item.id === 'hub-forum-selfway') return !!selfway;
    if (item.id === 'hub-forum-plans') return !!planWhen || !!nextstep;
    if (item.id === 'hub-forum-choices') return otherChoices.length > 0;
    if (item.id === 'hub-forum-extra') return !!data?.compact.length;
    if (item.id === 'hub-forum-final') return finals.length > 0;
    return true;
  }), [data, improve, pointB, roleChoice, selfway, planWhen, nextstep, finals.length, otherChoices.length]);

  return (
    <HubLensLayout className="adm-day-results" items={nav} navLabel="Разделы итогов форума">
      <DashScreenTitle
        title="Итоги форума — итоговая анкета"
        hint={
          m
            ? `Сдано ${m.submitted} анкет · ${m.submittedPeople ?? m.submitted} из ${m.total} участников · ${m.questionCount} итоговых вопросов`
            : 'Только вопросы вечерней анкеты с галочкой «Итоговый вопрос форума»'
        }
      />

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
            id="hub-forum-pulse"
            title="Пульс смены"
            note="Считаются только вопросы вечерней анкеты с галочкой «Итоговый вопрос форума»."
          >
            <HubKpiRow
              cols={2}
              items={[
                {
                  value: m.submitted,
                  label: 'Сдано анкет',
                  sub: `${m.submittedPeople ?? m.submitted} из ${m.total} участников · ${m.fillRatePct}%`,
                },
                {
                  value: data.nps ? data.nps.score : '—',
                  label: 'NPS',
                  sub: data.nps
                    ? `${data.nps.fieldLabel} · n=${data.nps.n} · ср. ${data.nps.mean}`
                    : 'Нет шкалы 1–10 «рекомендовать» среди итоговых вопросов',
                  accent: data.nps
                    ? (data.nps.score >= 0 ? '#2E7D53' : '#B23B32')
                    : undefined,
                },
              ]}
            />
            <HubKpiRow
              cols={4}
              items={[
                {
                  value: m.index == null ? '—' : m.index.toFixed(2),
                  label: 'Индекс форума — среднее по блокам',
                  sub: `шкала 1–5 · n=${m.scaleN}`,
                },
                {
                  value: `${m.fillRatePct}%`,
                  label: 'Сдали анкету',
                  sub: `${m.submittedPeople ?? m.submitted} из ${m.total} · черновиков ${m.drafts}`,
                },
                {
                  value: `${m.attentionBlocks} из ${data.blocks.length}`,
                  label: 'Блока в зоне внимания',
                  sub: 'где ≥10% оценок ниже 4',
                  accent: m.attentionBlocks > 0 ? '#B7791F' : undefined,
                },
                {
                  value: `${m.formalPct}%`,
                  label: 'Формальных ответов в тексте',
                  sub: '«.» · «-» · «всё ок» — качество рефлексии',
                },
              ]}
            />
          </DayResultsSection>

          {data.blocks.length > 0 && (
            <DayResultsSection
              id="hub-forum-spine"
              title="Хребет — распределение оценок по блокам"
              note="Линия — граница внутри полосы: слева оценки «есть претензия» (1–3), справа — «удовлетворён» (4–5). Сортировка по доле хвоста, не по среднему."
            >
              <DashCard>
                <SpineLegend />
                {[...data.blocks].sort((a, b) => b.low - a.low || a.label.localeCompare(b.label, 'ru')).map(b => (
                  <div key={b.key} className="adm-day-results-spine">
                    <div className="adm-day-results-spine-nm">{b.label}</div>
                    {b.n > 0 ? <SpineBar dist={b.dist} /> : <div className="adm-muted" style={{ flex: 1 }}>Нет оценок</div>}
                    <div className="adm-day-results-spine-val">
                      {b.n > 0 ? (
                        <>
                          <b>{b.mean.toFixed(2)}</b>
                          {' · '}
                          <Flag tone={lowTone(b.low)}>{b.low}%</Flag>
                        </>
                      ) : (
                        <span className="adm-muted">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </DashCard>
            </DayResultsSection>
          )}

          {data.blockDayRatings.length > 0 && (
            <DayResultsSection
              id="hub-forum-days"
              title="Заполняемость и оценка по дням — один блок за раз"
              note="Все шкалы с галочкой «Итоговый вопрос форума». Направления × дни, где стоит галочка. «Заполнили» — сколько ответили, «Оценка» — среднее."
            >
              <DashCard className="adm-day-results-scroll">
                <label className="adm-forum-block-picker">
                  <span>Блок</span>
                  <select
                    className="adm-input"
                    value={selectedBlock?.fieldKey || ''}
                    onChange={e => setBlockKey(e.target.value)}
                  >
                    {data.blockDayRatings.map(b => (
                      <option key={b.fieldKey} value={b.fieldKey}>{b.fieldLabel}</option>
                    ))}
                  </select>
                </label>
                {!selectedBlock?.rows.length ? (
                  <p className="adm-muted">Нет оценок по выбранному блоку.</p>
                ) : (
                  <table className="adm-table adm-day-results-table adm-dir-score-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} className="adm-dir-score-stub">Направление</th>
                        {selectedBlock.days.map(d => (
                          <th key={d.day} colSpan={2} className="adm-dir-score-day">{d.label}</th>
                        ))}
                      </tr>
                      <tr>
                        {selectedBlock.days.map(d => (
                          <Fragment key={`sub-${d.day}`}>
                            <th>Заполнили</th>
                            <th>Оценка</th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBlock.rows.map(r => (
                        <tr key={r.direction}>
                          <td className="adm-dir-score-name">{r.direction}</td>
                          {r.cells.map((c, i) => (
                            <Fragment key={`${r.direction}-${selectedBlock.days[i]?.day ?? i}`}>
                              <td className="adm-dir-score-n">
                                {c.filled > 0 ? c.filled : <span className="adm-muted">—</span>}
                              </td>
                              <td>
                                {c.avg == null ? (
                                  <span className="adm-muted">—</span>
                                ) : (
                                  <span className="adm-day-results-cell" style={scoreCellStyle(c.avg)}>
                                    {c.avg.toFixed(2)}
                                  </span>
                                )}
                              </td>
                            </Fragment>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {insight && <p className="adm-forum-autoinsight">{insight}</p>}
              </DashCard>
            </DayResultsSection>
          )}

          {data.heat.length > 0 && data.blocks.some(b => b.n > 0) && (
            <DayResultsSection
              id="hub-forum-heatmap"
              title="Направление × блок — где отклонение от среднего"
              note="Цвет — разница с форумом по этому блоку, не абсолютная оценка. Так «трудный» для всех блок не красит все направления в красный."
            >
              <DashCard className="adm-day-results-scroll">
                <table className="adm-table adm-day-results-table">
                  <thead>
                    <tr>
                      <th>Направление</th>
                      <th style={{ textAlign: 'center' }}>N</th>
                      {data.blocks.map(block => (
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
                        {data.blocks.map((block, i) => {
                          const c = r.vals[i];
                          if (!c || c.v == null) {
                            return (
                              <td key={block.key} style={{ padding: 4, textAlign: 'center' }}>
                                <span className="adm-muted">—</span>
                              </td>
                            );
                          }
                          return (
                            <td key={block.key} style={{ padding: 4 }}>
                              <span className="adm-day-results-cell" style={heatCellStyle(c.dev)}>
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
                        {data.blocks.map((block, i) => {
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
              </DashCard>
            </DayResultsSection>
          )}

          {improve && (
            <DayResultsSection
              id="hub-forum-improve"
              title={improve.label}
              note={`${improve.n} ответов`}
            >
              <DashCard>
                {improve.clusters.length > 0 && improve.clusters.map(c => {
                  const mx = Math.max(...improve.clusters.map(x => x.n), 1);
                  return (
                    <div key={c.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{c.name}</div>
                        <HBar widthPct={(c.n / mx) * 100} color="#B08D3F" />
                      </div>
                      <div className="adm-day-results-nb">{c.n}</div>
                    </div>
                  );
                })}
                <p className="adm-muted" style={{ fontSize: 12, margin: '12px 0 8px' }}>
                  Все ответы, без кластеризации · листай, не скачивая
                </p>
                <QuoteBrowser quotes={improve.quotes} total={improve.n} title={improve.label} />
              </DashCard>
            </DayResultsSection>
          )}

          {(data.practiceRecommendNps?.byPractice?.length || data.practiceRecommendNps?.available) && (
            <DayResultsSection
              id="hub-forum-practices"
              title="Практики и темы программы"
              note="Только поле «Событие / тема из программы», отмеченное как итоговый вопрос форума."
            >
              <PracticeRecommendNpsTable
                data={data.practiceRecommendNps}
                title="Оценки практик из итоговых вопросов"
              />
            </DayResultsSection>
          )}

          {data.nps && (
            <DayResultsSection
              id="hub-forum-nps"
              title="Готовность рекомендовать форум (NPS)"
              note={data.nps.fieldLabel}
            >
              <DashCard>
                <div className="adm-nps-bar">
                  <div style={{ width: `${data.nps.criticsPct}%`, background: '#B23B32' }}>
                    {data.nps.criticsPct >= 8 ? `${data.nps.criticsPct}% критики` : ''}
                  </div>
                  <div style={{ width: `${data.nps.passivePct}%`, background: '#B7791F' }}>
                    {data.nps.passivePct >= 8 ? `${data.nps.passivePct}% нейтральные` : ''}
                  </div>
                  <div style={{ width: `${data.nps.promotersPct}%`, background: '#2E7D53' }}>
                    {data.nps.promotersPct >= 8 ? `${data.nps.promotersPct}% промоутеры` : ''}
                  </div>
                </div>
                <div className="adm-nps-legend">
                  <span><i style={{ background: '#B23B32' }} />Критики, 0–6</span>
                  <span><i style={{ background: '#B7791F' }} />Нейтральные, 7–8</span>
                  <span><i style={{ background: '#2E7D53' }} />Промоутеры, 9–10</span>
                </div>
                <p className="adm-muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                  NPS = {data.nps.promotersPct} − {data.nps.criticsPct} = {data.nps.score}.
                  Средний балл — {data.nps.mean} из 10 · n={data.nps.n}.
                  Для сравнения между сменами смотрите NPS, а не средний балл.
                </p>
              </DashCard>
            </DayResultsSection>
          )}

          {pointB && (
            <DayResultsSection
              id="hub-forum-pointb"
              title="Точка Б — что произошло с целью"
              note={pointB.label}
            >
              <DashCard>
                {pointB.items.map((item, i) => (
                  <div key={item.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{item.name}</div>
                      <HBar widthPct={item.pct} color={barColor('point_b', i, item.pct)} />
                    </div>
                    <div className="adm-day-results-nb">{item.pct}%</div>
                  </div>
                ))}
                {(data.pointBBranches?.length ?? 0) > 0 && (
                  <div className="adm-forum-branchgrid">
                    {data.pointBBranches.map(b => (
                      <div key={b.title} className="adm-forum-branchcard">
                        <div className="adm-forum-branchname">{b.title}</div>
                        <QuoteBrowser quotes={b.quotes} total={b.n} compact title={b.title} />
                      </div>
                    ))}
                  </div>
                )}
              </DashCard>
            </DayResultsSection>
          )}

          {roleChoice && (
            <DayResultsSection
              id="hub-forum-role"
              title="Способы действия — роль на финише смены"
              note={roleChoice.label}
            >
              <DashCard>
                {roleChoice.items.length === 0 ? (
                  <p className="adm-muted">Пока нет ответов на этот вопрос.</p>
                ) : roleChoice.items.map((item, i) => (
                  <div key={item.name} className="adm-day-results-row">
                    <div>
                      <div className="adm-day-results-lb">{item.name}</div>
                      <HBar widthPct={item.pct} color={barColor('role', i, item.pct)} />
                    </div>
                    <div className="adm-day-results-nb">{item.pct}%</div>
                  </div>
                ))}
              </DashCard>
            </DayResultsSection>
          )}

          {selfway && (
            <DayResultsSection
              id="hub-forum-selfway"
              title="Что поняли о своём способе действовать"
              note={`${selfway.label} · ${selfway.n} ответов · листай, не скачивая`}
            >
              <DashCard>
                <QuoteBrowser quotes={selfway.quotes} total={selfway.n} title={selfway.label} />
              </DashCard>
            </DayResultsSection>
          )}

          {otherChoices.length > 0 && (
            <DayResultsSection
              id="hub-forum-choices"
              title="Другие итоговые вопросы с выбором"
              note="Все отмеченные вопросы типа «выбор» и «да/нет», которые не попали в Точку Б, роль и планы"
            >
              {otherChoices.map(ch => (
                <DashCard key={ch.key} title={ch.label}>
                  {ch.items.length === 0 ? (
                    <p className="adm-muted">Пока нет ответов на этот вопрос.</p>
                  ) : ch.items.map((item, i) => (
                    <div key={item.name} className="adm-day-results-row">
                      <div>
                        <div className="adm-day-results-lb">{item.name}</div>
                        <HBar widthPct={item.pct} color={barColor(ch.kind, i, item.pct)} />
                      </div>
                      <div className="adm-day-results-nb">{item.pct}%</div>
                    </div>
                  ))}
                  {(data.choiceFollowUps?.[ch.key]?.length ?? 0) > 0 && (
                    <div className="adm-forum-branchgrid">
                      {data.choiceFollowUps![ch.key].map(b => (
                        <div key={b.title} className="adm-forum-branchcard">
                          <div className="adm-forum-branchname">{b.title}</div>
                          <QuoteBrowser quotes={b.quotes} total={b.n} compact title={b.title} />
                        </div>
                      ))}
                    </div>
                  )}
                </DashCard>
              ))}
            </DayResultsSection>
          )}

          {(planWhen || nextstep) && (
            <DayResultsSection
              id="hub-forum-plans"
              title="Планы после форума"
            >
              <div className="adm-forum-results-two">
                {planWhen && (
                  <DashCard title={planWhen.label}>
                    {planWhen.items.map((item, i) => (
                      <div key={item.name} className="adm-day-results-row">
                        <div>
                          <div className="adm-day-results-lb">{item.name}</div>
                          <HBar widthPct={item.pct} color={barColor('plan_when', i, item.pct)} />
                        </div>
                        <div className="adm-day-results-nb">{item.pct}%</div>
                      </div>
                    ))}
                  </DashCard>
                )}
                {nextstep && (
                  <DashCard title={nextstep.label}>
                    <QuoteBrowser quotes={nextstep.quotes} total={nextstep.n} title={nextstep.label} />
                  </DashCard>
                )}
              </div>
            </DayResultsSection>
          )}

          {data.compact.length > 0 && (
            <DayResultsSection
              id="hub-forum-extra"
              title="Психолог · рейтинг · бот · материалы"
              note="Компактные срезы сервисных вопросов итоговой анкеты."
            >
              <div className="adm-forum-results-four">
                {data.compact.map(card => (
                  <DashCard key={card.key} title={card.label}>
                    <div className="adm-forum-ministat">
                      {card.pct != null && <span className="v">{card.pct}%</span>}
                      {card.mean != null && <span className="v">{card.mean}</span>}
                      {card.sub && <span className="u">{card.sub}</span>}
                    </div>
                    {card.quotes.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <QuoteBrowser quotes={card.quotes} compact title={card.label} />
                      </div>
                    )}
                  </DashCard>
                ))}
              </div>
            </DayResultsSection>
          )}

          {finals.length > 0 && (
            <DayResultsSection
              id="hub-forum-final"
              title="Итоговые впечатления"
              note="Открытые ответы · листай, не скачивая"
            >
              <DashCard>
                {data.tags.length > 0 && (
                  <div className="adm-forum-tagcloud">
                    {data.tags.map((t, i) => (
                      <span key={t.word} style={{ fontSize: `${17 - i}px` }}>{t.word}</span>
                    ))}
                  </div>
                )}
                {finals.map(t => (
                  <div key={t.key} style={{ marginTop: 12 }}>
                    {finals.length > 1 && <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>{t.label}</h4>}
                    <QuoteBrowser quotes={t.quotes} total={t.n} title={t.label} />
                  </div>
                ))}
              </DashCard>
            </DayResultsSection>
          )}

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => {
                void downloadHubExport({
                  id: 'forum-pack',
                  label: 'Итоги форума',
                  path: data.exportPath || '/exports/forum-pack?mode=shift',
                  filename: 'forum_results.xlsx',
                });
              }}
            >
              Скачать пакет выгрузки
            </button>
          </div>
        </>
      )}
    </HubLensLayout>
  );
}
