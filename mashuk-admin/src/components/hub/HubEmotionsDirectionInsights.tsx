import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashCard } from '../analytics/dashboardUi';
import {
  ChartTooltipRu,
  EMOTION_COLORS,
  EMOTION_LABELS,
  EMOTION_ORDER,
  ZONE_LABELS,
  formatForumDay,
} from '../analytics/chartRu';
import { hubDirections, isAllForumDay } from './hubQuery';
import { useInsights } from '../insights/InsightsContext';

type PhaseEmotions = {
  zones?: Record<string, number>;
  emotions?: Record<string, number>;
  n?: number;
};

type DirectionPhaseRow = {
  direction: string;
  byPhase: {
    morning?: PhaseEmotions;
    day?: PhaseEmotions;
    evening?: PhaseEmotions;
  };
};

type EnergyRow = {
  direction: string;
  day: number;
  energyAvg: number | null;
  responses: number;
  zones?: Record<string, number>;
  riskFatiguePct?: number;
  engagementLiftPct?: number;
  dominantZone?: string;
};

const PHASES = [
  { key: 'morning' as const, label: 'Утро' },
  { key: 'day' as const, label: 'День' },
  { key: 'evening' as const, label: 'Вечер' },
];

const NEGATIVE = new Set(['tired', 'anxiety', 'irritation', 'sadness']);
const POSITIVE = new Set(['joy', 'calm', 'interest', 'inspiration', 'confidence', 'surprise', 'focus']);

function emotionLabel(id: string): string {
  return EMOTION_LABELS[id] || id;
}

function emotionColor(id: string): string {
  return EMOTION_COLORS[id] ?? '#3182CE';
}

function zonePct(zones: Record<string, number> | undefined, key: string): number {
  if (!zones) return 0;
  const v = zones[key] ?? zones[ZONE_LABELS[key]] ?? 0;
  return typeof v === 'number' ? v : 0;
}

/** Доминирующая и минимальная эмоция в фазе (по %). */
function phaseTopBottom(emotions: Record<string, number> | undefined, n: number): {
  top: { id: string; label: string; pct: number } | null;
  bottom: { id: string; label: string; pct: number } | null;
} {
  if (!emotions || n <= 0) return { top: null, bottom: null };
  const entries = EMOTION_ORDER
    .map(id => ({ id, label: emotionLabel(id), pct: emotions[id] ?? 0 }))
    .filter(e => e.pct > 0);
  if (!entries.length) return { top: null, bottom: null };
  const sorted = [...entries].sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label, 'ru'));
  return { top: sorted[0]!, bottom: sorted[sorted.length - 1]! };
}

function avgEmotions(row: DirectionPhaseRow): { id: string; label: string; pct: number; count: number }[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const phase of PHASES) {
    const bucket = row.byPhase[phase.key];
    const n = bucket?.n ?? 0;
    total += n;
    for (const id of EMOTION_ORDER) {
      const pct = bucket?.emotions?.[id] ?? 0;
      counts.set(id, (counts.get(id) || 0) + Math.round((pct / 100) * n));
    }
  }
  if (!total) return [];
  return EMOTION_ORDER.map(id => {
    const count = counts.get(id) || 0;
    return {
      id,
      label: emotionLabel(id),
      count,
      pct: Math.round((count / total) * 1000) / 10,
    };
  }).filter(e => e.count > 0).sort((a, b) => b.pct - a.pct);
}

function mergedZones(row: DirectionPhaseRow): Record<string, number> {
  const acc: Record<string, number> = {};
  let totalN = 0;
  const weighted: Record<string, number> = {};
  for (const phase of PHASES) {
    const n = row.byPhase[phase.key]?.n ?? 0;
    totalN += n;
    for (const [k, v] of Object.entries(row.byPhase[phase.key]?.zones ?? {})) {
      weighted[k] = (weighted[k] || 0) + (v * n);
    }
  }
  if (!totalN) return acc;
  for (const [k, sum] of Object.entries(weighted)) {
    acc[k] = Math.round((sum / totalN) * 10) / 10;
  }
  return acc;
}

type TableRow = {
  direction: string;
  morning: ReturnType<typeof phaseTopBottom>;
  day: ReturnType<typeof phaseTopBottom>;
  evening: ReturnType<typeof phaseTopBottom>;
  avgTop: { id: string; label: string; pct: number } | null;
  avgBottom: { id: string; label: string; pct: number } | null;
  avg: ReturnType<typeof avgEmotions>;
  zones: Record<string, number>;
  totalN: number;
  dayTiredPct: number;
};

function buildTableRows(rows: DirectionPhaseRow[]): TableRow[] {
  return hubDirections(rows.map(r => r.direction))
    .map(dir => rows.find(r => r.direction === dir))
    .filter((r): r is DirectionPhaseRow => Boolean(r))
    .map(row => {
      const morning = phaseTopBottom(row.byPhase.morning?.emotions, row.byPhase.morning?.n ?? 0);
      const day = phaseTopBottom(row.byPhase.day?.emotions, row.byPhase.day?.n ?? 0);
      const evening = phaseTopBottom(row.byPhase.evening?.emotions, row.byPhase.evening?.n ?? 0);
      const avg = avgEmotions(row);
      const avgTop = avg[0] ? { id: avg[0].id, label: avg[0].label, pct: avg[0].pct } : null;
      const avgBottom = avg.length
        ? { id: avg[avg.length - 1]!.id, label: avg[avg.length - 1]!.label, pct: avg[avg.length - 1]!.pct }
        : null;
      const totalN = PHASES.reduce((s, p) => s + (row.byPhase[p.key]?.n ?? 0), 0);
      const dayTiredPct = row.byPhase.day?.emotions?.tired ?? 0;
      return {
        direction: row.direction,
        morning,
        day,
        evening,
        avgTop,
        avgBottom,
        avg,
        zones: mergedZones(row),
        totalN,
        dayTiredPct,
      };
    });
}

function cellDom(hit: { id: string; label: string; pct: number } | null): string {
  if (!hit) return '—';
  return `${hit.label} ${hit.pct}%`;
}

/** Локальные сигналы / заключения по направлению в духе штабного дайджеста. */
function buildConclusion(
  row: TableRow,
  peers: TableRow[],
  opts: {
    scopeLabel: string;
    energyAvg?: number | null;
  },
): string {
  const parts: string[] = [];
  const lift = zonePct(row.zones, 'lift');
  const fatigue = zonePct(row.zones, 'fatigue');
  const risk = zonePct(row.zones, 'risk');
  const engagement = zonePct(row.zones, 'engagement');

  const maxDayTired = Math.max(...peers.map(p => p.dayTiredPct), 0);
  if (row.dayTiredPct >= 18 && row.dayTiredPct >= maxDayTired - 0.1 && row.dayTiredPct > 0) {
    parts.push(
      `дневная усталость — ${row.dayTiredPct}%`
      + (peers.length > 1 ? ', самый заметный показатель среди направлений' : '')
      + '. Здесь стоит менять ритм блока.',
    );
  } else if (row.dayTiredPct >= 15) {
    parts.push(`дневная усталость ${row.dayTiredPct}% — держать паузы и смену формата.`);
  }

  const negAvg = row.avg.filter(e => NEGATIVE.has(e.id));
  const negShare = negAvg.reduce((s, e) => s + e.pct, 0);
  const posShare = row.avg.filter(e => POSITIVE.has(e.id)).reduce((s, e) => s + e.pct, 0);

  if (risk >= 7 || (row.avg.find(e => e.id === 'anxiety')?.pct ?? 0) >= 8) {
    parts.push(
      `зона риска / тревога заметны (риск ${risk}%`
      + (row.avg.find(e => e.id === 'anxiety')
        ? `, тревога ${row.avg.find(e => e.id === 'anxiety')!.pct}%`
        : '')
      + '). Стоит явно показывать новизну следующего шага.',
    );
  }

  if (lift >= 45 && fatigue < 8) {
    parts.push(
      `наиболее ресурсное: ${lift}% подъёма`
      + (fatigue < 1 ? ', почти без усталости' : `, усталость ${fatigue}%`)
      + (opts.energyAvg != null ? `, энергия ${opts.energyAvg}` : '')
      + '. Держать темп и давать им вести практику.',
    );
  } else if (lift >= 35 && posShare >= 55) {
    parts.push(`сильный позитив (${posShare.toFixed(0)}% ресурсных эмоций, подъём ${lift}%) — можно опираться на них в общем поле.`);
  }

  if (negShare > 0 && negShare < 12 && posShare >= 50) {
    parts.push(
      `стали менее негативными: негатив ~${negShare.toFixed(0)}%, основная масса в ресурсе`
      + (row.avgTop ? ` (лидирует ${row.avgTop.label} ${row.avgTop.pct}%)` : '')
      + '.',
    );
  }

  if (row.avg.find(e => e.id === 'inspiration' || e.id === 'confidence')?.pct
    && ((row.avg.find(e => e.id === 'inspiration')?.pct ?? 0)
      + (row.avg.find(e => e.id === 'confidence')?.pct ?? 0)) >= 20) {
    parts.push('высокий запрос на смысл и уверенность — хорошо заходят задачи «в работу» и перенос в среду.');
  }

  if (row.evening.top && NEGATIVE.has(row.evening.top.id) && row.morning.top && POSITIVE.has(row.morning.top.id)) {
    parts.push(
      `к вечеру доминирует ${row.evening.top.label} (${row.evening.top.pct}%) при утреннем ${row.morning.top.label}`
      + ' — проверить перегруз вечернего слота.',
    );
  }

  if (row.avgTop && row.avgBottom && row.avgTop.id !== row.avgBottom.id) {
    parts.push(
      `доминанта за срез: ${row.avgTop.label} ${row.avgTop.pct}%; слабее всего — ${row.avgBottom.label} ${row.avgBottom.pct}%.`,
    );
  }

  if (!parts.length) {
    parts.push(
      row.avgTop
        ? `в срезе «${opts.scopeLabel}» чаще всего ${row.avgTop.label} (${row.avgTop.pct}%), N=${row.totalN}.`
        : `мало ответов за «${opts.scopeLabel}» (N=${row.totalN}) — сигнал пока слабый.`,
    );
  }

  if (engagement >= 25 && !parts.some(p => p.includes('включение'))) {
    parts.push(`включение ${engagement}% — группа в работе, можно усложнять задание.`);
  }

  return parts.join(' ');
}

function DomCell({ hit }: { hit: { id: string; label: string; pct: number } | null }) {
  if (!hit) return <span className="adm-muted">—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: emotionColor(hit.id), display: 'inline-block',
      }}
      />
      <span>{hit.label}</span>
      <span className="adm-muted" style={{ fontSize: 11 }}>{hit.pct}%</span>
    </span>
  );
}

/**
 * Штаб · Форум: таблица доминирующих эмоций по направлениям,
 * заключения и столбчатые диаграммы 11 эмоций × 7 направлений.
 */
export function HubEmotionsDirectionInsights({
  byDirectionPhase,
  byDirectionPhaseForum,
  directionEmotionEnergy,
}: {
  byDirectionPhase?: DirectionPhaseRow[] | null;
  byDirectionPhaseForum?: DirectionPhaseRow[] | null;
  directionEmotionEnergy?: EnergyRow[] | null;
}) {
  const { forumDay, meta } = useInsights();
  const allForum = isAllForumDay(forumDay);
  const selectedDay = allForum
    ? null
    : (Number(forumDay) || meta?.currentForumDay || 1);

  const [barScope, setBarScope] = useState<'day' | 'forum'>(allForum ? 'forum' : 'day');

  const dayRows = useMemo(
    () => buildTableRows(byDirectionPhase ?? []),
    [byDirectionPhase],
  );
  const forumRows = useMemo(
    () => buildTableRows(byDirectionPhaseForum ?? byDirectionPhase ?? []),
    [byDirectionPhaseForum, byDirectionPhase],
  );

  /** Таблица и заключения — по текущему глобальному фильтру даты. */
  const insightRows = allForum ? forumRows : dayRows;
  const scopeLabel = allForum
    ? 'весь форум'
    : `день ${formatForumDay(selectedDay ?? 1)}`;

  const energyByDir = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    const list = directionEmotionEnergy ?? [];
    for (const r of list) {
      if (selectedDay != null && r.day !== selectedDay) continue;
      if (r.energyAvg == null) continue;
      const cur = map.get(r.direction) ?? { sum: 0, n: 0 };
      cur.sum += r.energyAvg;
      cur.n += 1;
      map.set(r.direction, cur);
    }
    const out = new Map<string, number | null>();
    for (const [dir, { sum, n }] of map) {
      out.set(dir, n ? Math.round((sum / n) * 100) / 100 : null);
    }
    return out;
  }, [directionEmotionEnergy, selectedDay]);

  const conclusions = useMemo(() => {
    return insightRows.map(row => ({
      direction: row.direction,
      text: buildConclusion(row, insightRows, {
        scopeLabel,
        energyAvg: energyByDir.get(row.direction) ?? null,
      }),
    }));
  }, [insightRows, scopeLabel, energyByDir]);

  const barRows = barScope === 'forum' ? forumRows : dayRows;
  const barScopeLabel = barScope === 'forum'
    ? 'весь форум'
    : (allForum ? 'срез фильтра' : `день ${formatForumDay(selectedDay ?? 1)}`);

  if (!insightRows.length && !forumRows.length && !dayRows.length) {
    return null;
  }

  return (
    <>
      <DashCard title="Доминирующие эмоции по направлениям">
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
          Срез: <strong>{scopeLabel}</strong>
          {' · '}
          в ячейке — что доминирует в фазе; «слабее» — минимальная ненулевая доля среди 11 эмоций.
        </p>
        {insightRows.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет данных по направлениям.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ width: '100%', fontSize: 12, minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Направление</th>
                  <th>Утро</th>
                  <th>День</th>
                  <th>Вечер</th>
                  <th>Среднее</th>
                  <th>Слабее всего</th>
                  <th style={{ textAlign: 'right' }}>N</th>
                </tr>
              </thead>
              <tbody>
                {insightRows.map(row => (
                  <tr key={row.direction}>
                    <td style={{ fontWeight: 600 }}>{row.direction}</td>
                    <td><DomCell hit={row.morning.top} /></td>
                    <td><DomCell hit={row.day.top} /></td>
                    <td><DomCell hit={row.evening.top} /></td>
                    <td><DomCell hit={row.avgTop} /></td>
                    <td>
                      <DomCell hit={row.avgBottom} />
                      {row.avgBottom && NEGATIVE.has(row.avgBottom.id) ? null : (
                        row.dayTiredPct >= 12 ? (
                          <div className="adm-muted" style={{ fontSize: 10, marginTop: 2 }}>
                            уст. днём {row.dayTiredPct}%
                          </div>
                        ) : null
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }} className="adm-muted">{row.totalN}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {conclusions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="adm-dash-card-title" style={{ marginBottom: 8 }}>
              Локальные сигналы · {scopeLabel}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
              {conclusions.map(c => (
                <li key={c.direction} style={{ marginBottom: 10 }}>
                  <strong>{c.direction}:</strong>
                  {' '}
                  {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashCard>

      <DashCard title="11 эмоций · столбцы по направлениям">
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
        >
          <p className="adm-muted" style={{ fontSize: 12, margin: 0, flex: '1 1 220px' }}>
            У каждого направления — доли всех 11 эмоций за выбранный срез (все фазы дня вместе).
          </p>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              className={barScope === 'day' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
              onClick={() => setBarScope('day')}
              disabled={!dayRows.length}
            >
              {allForum ? 'Текущий срез' : `День ${formatForumDay(selectedDay ?? 1)}`}
            </button>
            <button
              type="button"
              className={barScope === 'forum' ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-sm'}
              onClick={() => setBarScope('forum')}
              disabled={!forumRows.length}
            >
              Весь форум
            </button>
          </div>
        </div>
        <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
          Показано: {barScopeLabel}
        </p>

        {barRows.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет данных для диаграмм.</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
          >
            {barRows.map(row => {
              const chartData = EMOTION_ORDER.map(id => {
                const hit = row.avg.find(e => e.id === id);
                return {
                  id,
                  name: emotionLabel(id),
                  pct: hit?.pct ?? 0,
                  count: hit?.count ?? 0,
                };
              });
              return (
                <div
                  key={row.direction}
                  style={{
                    border: '1px solid #e5e5ea',
                    borderRadius: 10,
                    padding: '10px 10px 4px',
                    background: '#fff',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                    gap: 8,
                  }}
                  >
                    <strong style={{ fontSize: 13 }}>{row.direction}</strong>
                    <span className="adm-muted" style={{ fontSize: 11 }}>
                      {row.avgTop ? `${row.avgTop.label} ${row.avgTop.pct}%` : '—'}
                      {' · N='}
                      {row.totalN}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 9, fill: '#86868b' }}
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        domain={[0, 'auto']}
                        tick={{ fontSize: 10, fill: '#86868b' }}
                        width={36}
                        unit="%"
                      />
                      <Tooltip content={<ChartTooltipRu />} />
                      <Bar dataKey="pct" name="Доля" radius={[3, 3, 0, 0]}>
                        {chartData.map(d => (
                          <Cell key={d.id} fill={emotionColor(d.id)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </DashCard>
    </>
  );
}

