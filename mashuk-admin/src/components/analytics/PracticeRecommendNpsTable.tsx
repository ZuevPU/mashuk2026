import { DashCard } from './dashboardUi';

export type PracticeRecommendNpsRow = {
  practice: string;
  responses: number;
  scores: Record<string, number>;
  avgScore?: number;
  promoters?: number;
  passives?: number;
  detractors?: number;
  nps: number;
};

export type PracticeRecommendNpsData = {
  available?: boolean;
  note?: string;
  byPractice?: PracticeRecommendNpsRow[];
};

const SCORE_KEYS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'] as const;

function npsTone(nps: number): string | undefined {
  if (nps >= 50) return '#166534';
  if (nps >= 0) return '#375623';
  if (nps >= -50) return '#B8621A';
  return '#b91c1c';
}

/**
 * Таблица: практики с оценкой · распределение 10…1 · эталонный NPS.
 * Вместо графика «Готов ли рекомендовать / Оцени практику».
 */
export function PracticeRecommendNpsTable({
  data,
  title = 'Готов ли рекомендовать эту практику коллегам?',
}: {
  data: PracticeRecommendNpsData | null | undefined;
  title?: string;
}) {
  const rows = data?.byPractice ?? [];
  if (!rows.length) {
    if (!data?.note) return null;
    return (
      <DashCard title={title}>
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>{data.note}</p>
      </DashCard>
    );
  }

  const totals = SCORE_KEYS.reduce((acc, k) => {
    acc[k] = rows.reduce((s, r) => s + (r.scores?.[k] ?? 0), 0);
    return acc;
  }, {} as Record<string, number>);
  const totalResponses = rows.reduce((s, r) => s + (r.responses ?? 0), 0);
  const totalPromoters = rows.reduce((s, r) => s + (r.promoters ?? 0), 0);
  const totalDetractors = rows.reduce((s, r) => s + (r.detractors ?? 0), 0);
  const totalNps = totalResponses
    ? Math.round(((totalPromoters - totalDetractors) / totalResponses) * 100)
    : 0;

  return (
    <DashCard title={title}>
      <p className="adm-muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 8 }}>
        {data?.note
          || 'Только практики, которые участники выбрали и оценили. NPS = %промоутеров (9–10) − %детракторов (1–6).'}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Практика</th>
              <th title="Сколько человек поставили оценку">Оценок</th>
              {SCORE_KEYS.map(k => (
                <th key={k} style={{ textAlign: 'center' }}>{k}</th>
              ))}
              <th title="Эталонный NPS (−100…100)">NPS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.practice}>
                <td>{row.practice}</td>
                <td style={{ fontWeight: 600, textAlign: 'center' }}>{row.responses}</td>
                {SCORE_KEYS.map(k => {
                  const n = row.scores?.[k] ?? 0;
                  return (
                    <td
                      key={k}
                      style={{
                        textAlign: 'center',
                        color: n === 0 ? 'var(--adm-muted, #94a3b8)' : undefined,
                      }}
                    >
                      {n || '·'}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'center', fontWeight: 700, color: npsTone(row.nps) }}>
                  {row.nps}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td>Итого</td>
              <td style={{ textAlign: 'center' }}>{totalResponses}</td>
              {SCORE_KEYS.map(k => (
                <td key={k} style={{ textAlign: 'center' }}>{totals[k] || '·'}</td>
              ))}
              <td style={{ textAlign: 'center', color: npsTone(totalNps) }}>{totalNps}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DashCard>
  );
}
