type AnswerRow = {
  id: number;
  participantName?: string;
  answerData: unknown;
  questionTextSnapshot?: string | null;
  createdAt?: string;
};

type Props = {
  questionTitle: string;
  open: boolean;
  loading: boolean;
  answers: AnswerRow[];
  onClose: () => void;
};

export function QuestionAnswersModal({ questionTitle, open, loading, answers, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="adm-modal-backdrop" role="dialog" aria-modal="true">
      <div className="card adm-modal" style={{ maxWidth: 640, width: '92%', maxHeight: '80vh', overflow: 'auto' }}>
        <div className="adm-forum-toolbar">
          <h3 style={{ margin: 0 }}>Ответы · {questionTitle}</h3>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Закрыть</button>
        </div>
        {loading && <p className="adm-muted">Загрузка…</p>}
        {!loading && answers.length === 0 && <p className="adm-muted">Пока нет ответов</p>}
        {!loading && answers.map(a => (
          <div key={a.id} className="card" style={{ marginTop: 8, fontSize: 13 }}>
            <strong>{a.participantName || `Участник #${a.id}`}</strong>
            <span className="adm-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              {a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : ''}
            </span>
            {a.questionTextSnapshot && (
              <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>Снэпшот: {a.questionTextSnapshot.slice(0, 120)}…</div>
            )}
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12 }}>
              {typeof a.answerData === 'string' ? a.answerData : JSON.stringify(a.answerData, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
