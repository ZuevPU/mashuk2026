import { useEffect, useState } from 'react';

type PracticeResultRow = {
  id: string;
  title: string;
  participantName: string;
  direction: string;
  likes: number;
  resultPlace: string | null;
  resultTime: string | null;
};

type Props = {
  questionId: number;
  title: string;
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
  onClose: () => void;
};

export function PracticesResultsModal({ questionId, title, adminFetch, act, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [totalVoters, setTotalVoters] = useState(0);
  const [resultsPublished, setResultsPublished] = useState(false);
  const [rows, setRows] = useState<PracticeResultRow[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/questions/${questionId}/practices-results`);
      setTotalVoters(res.totalVoters || 0);
      setResultsPublished(!!res.resultsPublished);
      setRows((res.practices || []).map((p: PracticeResultRow) => ({
        ...p,
        resultPlace: p.resultPlace || '',
        resultTime: p.resultTime || '',
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [questionId]);

  const patchRow = (id: string, patch: Partial<PracticeResultRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal" style={{ maxWidth: 900, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Результаты · {title}</h3>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>Закрыть</button>
        </div>
        {loading ? (
          <p className="adm-muted">Загрузка…</p>
        ) : (
          <>
            <p className="adm-muted" style={{ fontSize: 13 }}>
              Проголосовали: {totalVoters}. Статус результатов:{' '}
              <strong>{resultsPublished ? 'опубликованы участникам' : 'скрыты'}</strong>
            </p>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Практика</th>
                  <th>Участник</th>
                  <th>Направление</th>
                  <th>Лайки</th>
                  <th>Место</th>
                  <th>Время</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.participantName || '—'}</td>
                    <td>{r.direction || '—'}</td>
                    <td><strong>{r.likes}</strong></td>
                    <td>
                      <input
                        className="adm-input"
                        placeholder="Зал / площадка"
                        value={r.resultPlace || ''}
                        onChange={e => patchRow(r.id, { resultPlace: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="adm-input"
                        placeholder="Напр. 15:00"
                        value={r.resultTime || ''}
                        onChange={e => patchRow(r.id, { resultTime: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="adm-forum-toolbar" style={{ marginTop: 16, gap: 8 }}>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={() => act(async () => {
                  await adminFetch(`/questions/${questionId}/practices-results/publish`, {
                    method: 'POST',
                    body: JSON.stringify({
                      practices: rows.map(r => ({
                        id: r.id,
                        resultPlace: r.resultPlace || null,
                        resultTime: r.resultTime || null,
                      })),
                    }),
                  });
                  setResultsPublished(true);
                }, 'Результаты опубликованы')}
              >
                Опубликовать результаты
              </button>
              {resultsPublished && (
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => act(async () => {
                    await adminFetch(`/questions/${questionId}/practices-results/unpublish`, { method: 'POST', body: '{}' });
                    setResultsPublished(false);
                  }, 'Результаты скрыты')}
                >
                  Скрыть результаты
                </button>
              )}
              <button type="button" className="adm-btn adm-btn-ghost" onClick={() => load()}>Обновить</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
