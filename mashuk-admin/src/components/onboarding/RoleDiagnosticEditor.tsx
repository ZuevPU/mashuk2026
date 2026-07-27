import { DEFAULT_DIAG_MATRIX } from './constants';
import { ROLE_OPTIONS } from './roleOptions';
import type { DiagQuestion } from './types';

type Props = {
  questions: DiagQuestion[];
  matrix: string[][];
  onQuestionsChange: (next: DiagQuestion[]) => void;
  onMatrixChange: (next: string[][]) => void;
  onSave: () => void;
  dirty: boolean;
};

export function RoleDiagnosticEditor({
  questions,
  matrix,
  onQuestionsChange,
  onMatrixChange,
  onSave,
  dirty,
}: Props) {
  return (
    <div className="adm-forum-block card">
      <h3>Диагностика роли</h3>
      <p className="adm-forum-hint">
        Шесть вопросов с четырьмя вариантами. У каждого варианта выберите, какую роль он засчитывает.
        Итоговая роль — та, что чаще всего «набралась» по ответам участника.
      </p>
      {questions.map((q, qi) => (
        <details key={qi} className="card adm-forum-nested-card adm-forum-details" open={qi === 0}>
          <summary className="adm-forum-summary">Вопрос {qi + 1}</summary>
          <textarea
            className="adm-input adm-textarea"
            value={q.text}
            rows={2}
            onChange={e => {
              onQuestionsChange(questions.map((item, idx) => (
                idx === qi ? { ...item, text: e.target.value } : item
              )));
            }}
          />
          {q.options.map((opt, oi) => (
            <div key={oi} className="adm-forum-diag-row">
              <span className="adm-muted adm-forum-diag-opt-label">Вариант {oi + 1}</span>
              <input
                className="adm-input adm-forum-diag-opt-input"
                value={opt}
                onChange={e => {
                  onQuestionsChange(questions.map((item, idx) => {
                    if (idx !== qi) return item;
                    const options = [...item.options];
                    options[oi] = e.target.value;
                    return { ...item, options };
                  }));
                }}
              />
              <label className="adm-forum-diag-role-label">
                <span className="adm-muted">Засчитывается как</span>
                <select
                  className="adm-input"
                  value={matrix[qi]?.[oi] || DEFAULT_DIAG_MATRIX[qi][oi]}
                  onChange={e => {
                    const next = matrix.map(r => [...r]);
                    if (!next[qi]) next[qi] = [...DEFAULT_DIAG_MATRIX[qi]];
                    next[qi][oi] = e.target.value;
                    onMatrixChange(next);
                  }}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.key} value={r.key}>{r.name}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </details>
      ))}
      <div className="adm-forum-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          Сохранить диагностику{dirty ? ' •' : ''}
        </button>
      </div>
    </div>
  );
}
