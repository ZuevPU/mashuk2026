import { useEffect, useState, type CSSProperties } from 'react';
import { DashCard } from '../analytics/dashboardUi';
import { ConclusionCard } from '../hub/directionNarrative';
import { STATE_ZONE_COLORS, StateQuotesBlock } from '../hub/StateQuotesBlock';

type DirRow = {
  direction: string;
  answers: number;
  uniqueParticipants: number;
  registered: number;
  fillRatePct: number;
};

type HeatRow = {
  direction: string;
  total: number;
  cells: Array<{ n: number; pct: number }>;
};

type Dash = {
  question: {
    id: number;
    title: string;
    text: string;
    isStateCheck: boolean;
    dayNumber: number | null;
    timePoint: string | null;
  };
  totals: {
    answers: number;
    uniqueParticipants: number;
    registered: number;
    fillRatePct: number;
  };
  byDirection: DirRow[];
  state: null | {
    zones: Array<{ key: string; label: string; n: number; pct: number }>;
    heatmap: {
      zones: Array<{ key: string; label: string }>;
      rows: HeatRow[];
    };
    summary: { h: string; p: string; a: string };
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
    quotesTotal: number;
  };
};

type Props = {
  questionId: number;
  title: string;
  adminFetch: (path: string, init?: RequestInit) => Promise<any>;
  onClose: () => void;
};

function heatCellStyle(n: number, max: number, zoneLabel: string): CSSProperties {
  if (n <= 0) {
    return { background: '#f3f4f6', color: '#9aa1ab' };
  }
  const t = Math.min(1, n / Math.max(max, 1));
  const hex = STATE_ZONE_COLORS[zoneLabel] || '#6f7d95';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    background: `rgba(${r}, ${g}, ${b}, ${(0.18 + t * 0.72).toFixed(2)})`,
    color: t >= 0.55 ? '#fff' : '#11151d',
    fontWeight: 700,
  };
}

export function QuestionDashboardModal({ questionId, title, adminFetch, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    adminFetch(`/questions/${questionId}/dashboard`)
      .then((res: Dash) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Не удалось загрузить дашборд');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [adminFetch, questionId]);

  const heatMax = data?.state
    ? Math.max(1, ...data.state.heatmap.rows.flatMap(r => r.cells.map(c => c.n)))
    : 1;

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal adm-q-dash-modal"
        style={{ maxWidth: 1100, width: '96%', maxHeight: '92vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Дашборд · {data?.question.title || title}</h3>
            {data?.question.text && data.question.text !== data.question.title && (
              <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{data.question.text}</p>
            )}
          </div>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>Закрыть</button>
        </div>

        {loading && <p className="adm-muted">Загрузка…</p>}
        {err && <p className="adm-muted" style={{ color: '#b91c1c' }}>{err}</p>}

        {data && (
          <>
            <DashCard title="Ответы по направлениям">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Направление</th>
                    <th>Ответы</th>
                    <th>Участники</th>
                    <th>В смене</th>
                    <th>Охват</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Всего</strong></td>
                    <td><strong>{data.totals.answers}</strong></td>
                    <td><strong>{data.totals.uniqueParticipants}</strong></td>
                    <td>{data.totals.registered}</td>
                    <td>{data.totals.fillRatePct}%</td>
                  </tr>
                  {data.byDirection.map(row => (
                    <tr key={row.direction}>
                      <td>{row.direction}</td>
                      <td>{row.answers}</td>
                      <td>{row.uniqueParticipants}</td>
                      <td>{row.registered}</td>
                      <td>{row.fillRatePct}%</td>
                    </tr>
                  ))}
                  {data.byDirection.length === 0 && (
                    <tr>
                      <td colSpan={5} className="adm-muted">Ответов пока нет</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DashCard>

            {data.state && (
              <>
                <ConclusionCard c={data.state.summary} />

                <DashCard title="Сводная: зоны × направления">
                  <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                    Число в клетке — сколько ответов. Цвет плотнее там, где зона сильнее.
                  </p>
                  {data.state.heatmap.rows.length === 0 ? (
                    <p className="adm-muted">Недостаточно данных для тепловой карты.</p>
                  ) : (
                    <div className="adm-q-heat-wrap">
                      <table className="adm-table adm-q-heat">
                        <thead>
                          <tr>
                            <th>Направление</th>
                            {data.state.heatmap.zones.map(z => (
                              <th key={z.key}>
                                <i
                                  className="adm-state-quote-zone-dot"
                                  style={{ background: STATE_ZONE_COLORS[z.label] }}
                                  aria-hidden
                                />
                                {z.label}
                              </th>
                            ))}
                            <th>Всего</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.state.heatmap.rows.map(row => (
                            <tr key={row.direction}>
                              <td>{row.direction}</td>
                              {row.cells.map((cell, i) => {
                                const zone = data.state!.heatmap.zones[i];
                                return (
                                  <td
                                    key={zone.key}
                                    style={heatCellStyle(cell.n, heatMax, zone.label)}
                                    title={`${row.direction} · ${zone.label}: ${cell.n} (${cell.pct}%)`}
                                  >
                                    {cell.n || '·'}
                                  </td>
                                );
                              })}
                              <td>{row.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DashCard>

                <StateQuotesBlock
                  quotes={data.state.quotes}
                  quotesTotal={data.state.quotesTotal}
                  hidePhaseFilter
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
