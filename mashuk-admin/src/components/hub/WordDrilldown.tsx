import { useMemo, useState } from 'react';
import { DashCard, TagPills } from '../analytics/dashboardUi';

export type WordAnswerRow = {
  participantId: number;
  name: string;
  group?: string;
  answer: string;
};

/** Облако слов с клик-фильтром по уже загруженным сырым ответам (без нового бэка). */
export function WordDrilldown({
  title,
  tokens,
  answers,
  onOpenCard,
}: {
  title: string;
  tokens: { token: string; count: number }[];
  answers: WordAnswerRow[];
  onOpenCard?: (id: number) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!selected) return [];
    const needle = selected.toLowerCase();
    return answers.filter(a => (a.answer || '').toLowerCase().includes(needle));
  }, [answers, selected]);

  if (!tokens.length) return null;

  return (
    <DashCard title={title}>
      <TagPills
        items={tokens.map(t => ({
          label: `${t.token} · ${t.count}`,
          tone: selected === t.token ? ('accent' as const) : undefined,
        }))}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {tokens.map(t => (
          <button
            key={t.token}
            type="button"
            className={selected === t.token ? 'adm-btn adm-btn-primary adm-btn-sm' : 'adm-btn adm-btn-secondary adm-btn-sm'}
            onClick={() => setSelected(prev => (prev === t.token ? null : t.token))}
          >
            {t.token}
          </button>
        ))}
        {selected && (
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setSelected(null)}>
            Сбросить
          </button>
        )}
      </div>
      {selected && (
        <div style={{ marginTop: 12 }}>
          <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
            Ответы со словом «{selected}»: {filtered.length}
          </p>
          {filtered.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет совпадений в загруженных ответах.</p>
          ) : (
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              <table className="adm-table">
                <thead>
                  <tr><th>Участник</th><th>Группа</th><th>Ответ</th></tr>
                </thead>
                <tbody>
                  {filtered.map((a, idx) => (
                    <tr key={`${a.participantId}-${idx}`}>
                      <td>
                        {onOpenCard ? (
                          <button type="button" className="adm-link" onClick={() => onOpenCard(a.participantId)}>
                            {a.name || `#${a.participantId}`}
                          </button>
                        ) : (
                          a.name || `#${a.participantId}`
                        )}
                      </td>
                      <td>{a.group || '—'}</td>
                      <td style={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>{a.answer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </DashCard>
  );
}
