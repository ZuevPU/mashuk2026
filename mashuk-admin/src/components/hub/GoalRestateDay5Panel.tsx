import { useMemo, useState } from 'react';
import { DashCard, SrcBars, TagPills } from '../analytics/dashboardUi';

const PAGE = 50;

export type GoalRestateDay5Data = {
  label?: string;
  answered?: number;
  skipped?: number;
  summary?: string;
  themes?: { token: string; count: number }[];
  phrases?: { token: string; count: number }[];
  byDirection?: {
    direction: string;
    answered: number;
    themes: { token: string; count: number }[];
  }[];
  comments?: { text: string; direction: string; group?: string }[];
};

export function GoalRestateDay5Panel({
  data,
  onOpenDirection,
}: {
  data: GoalRestateDay5Data | null | undefined;
  onOpenDirection?: (direction: string) => void;
}) {
  const comments = data?.comments ?? [];
  const [limit, setLimit] = useState(PAGE);
  const visible = useMemo(() => comments.slice(0, limit), [comments, limit]);
  const themes = data?.themes ?? [];
  const phrases = data?.phrases ?? [];
  const byDirection = data?.byDirection ?? [];

  if (!data || (!comments.length && !themes.length)) return null;

  const remaining = Math.max(0, comments.length - limit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DashCard title="Уточнённая цель · день 5">
        <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          {data.label || 'Если цель изменилась / уточнилась, как бы ты сформулировал(а) её сейчас?'}
        </p>
        <p style={{ fontSize: 13, margin: '0 0 10px' }}>
          {data.summary}
          {data.skipped ? ` · пропусков и коротких: ${data.skipped}` : ''}
        </p>
        {themes.length > 0 && (
          <>
            <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Семантика · частые слова</p>
            <SrcBars items={themes.slice(0, 16).map(t => ({ label: t.token, count: t.count }))} />
            <div style={{ marginTop: 10 }}>
              <TagPills
                tone="accent"
                items={themes.slice(0, 20).map(t => ({ label: `${t.token} · ${t.count}` }))}
              />
            </div>
          </>
        )}
        {phrases.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Устойчивые словосочетания</p>
            <TagPills
              items={phrases.map(t => ({ label: `${t.token} · ${t.count}` }))}
            />
          </div>
        )}
      </DashCard>

      {byDirection.length > 0 && (
        <DashCard title="Темы по направлениям">
          <table className="adm-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Направление</th>
                <th>Ответов</th>
                <th>Топ тем</th>
              </tr>
            </thead>
            <tbody>
              {byDirection.map(row => (
                <tr key={row.direction}>
                  <td>
                    {onOpenDirection ? (
                      <button type="button" className="adm-link" onClick={() => onOpenDirection(row.direction)}>
                        {row.direction}
                      </button>
                    ) : row.direction}
                  </td>
                  <td>{row.answered}</td>
                  <td>{row.themes.map(t => `${t.token} (${t.count})`).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      )}

      <DashCard title={`Комментарии · ${comments.length}`} className="adm-hub-quotes-card">
        {comments.length === 0 ? (
          <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет развёрнутых формулировок.</p>
        ) : (
          <>
            {visible.map((q, i) => (
              <div key={`${i}-${q.text.slice(0, 24)}`} className="adm-state-quote">
                {q.text}
                <span className="adm-state-quote-m">
                  {q.direction}{q.group ? ` · ${q.group}` : ''}
                </span>
              </div>
            ))}
            {remaining > 0 && (
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => setLimit(n => Math.min(n + PAGE, comments.length))}
              >
                Показать ещё {Math.min(PAGE, remaining)}
                {' '}
                ({remaining} осталось)
              </button>
            )}
          </>
        )}
      </DashCard>
    </div>
  );
}
