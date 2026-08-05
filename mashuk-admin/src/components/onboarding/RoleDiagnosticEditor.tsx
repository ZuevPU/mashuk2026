import { DEFAULT_DIAG_MATRIX, DEFAULT_DIAG_QUESTIONS } from './constants';
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

const MAX_Q = 12;
const MIN_Q = 1;
const MAX_OPT = 8;
const MIN_OPT = 2;

function defaultRoleFor(qi: number, oi: number): string {
  const row = DEFAULT_DIAG_MATRIX[qi] ?? DEFAULT_DIAG_MATRIX[0];
  return row?.[oi % (row?.length || 1)] || ROLE_OPTIONS[oi % ROLE_OPTIONS.length].key;
}

export function RoleDiagnosticEditor({
  questions,
  matrix,
  onQuestionsChange,
  onMatrixChange,
  onSave,
  dirty,
}: Props) {
  const syncMatrix = (nextQuestions: DiagQuestion[], prevMatrix: string[][]) => {
    return nextQuestions.map((q, qi) => {
      const prev = prevMatrix[qi] || [];
      return q.options.map((_, oi) => prev[oi] || defaultRoleFor(qi, oi));
    });
  };

  const updateQuestions = (next: DiagQuestion[]) => {
    onQuestionsChange(next);
    onMatrixChange(syncMatrix(next, matrix));
  };

  return (
    <div className="adm-forum-block card">
      <h3>Диагностика роли</h3>
      <p className="adm-forum-hint">
        Вопросы навигационной диагностики: у каждого варианта выберите, какую роль он засчитывает.
        Можно добавить вопросы и варианты ответа (сейчас {questions.length} вопр.).
        Итоговая роль — та, что чаще набралась по ответам участника.
      </p>
      {questions.map((q, qi) => (
        <details key={qi} className="card adm-forum-nested-card adm-forum-details" open={qi === 0}>
          <summary className="adm-forum-summary">
            Вопрос {qi + 1}
            <span className="adm-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
              {q.options.length} вариант(ов)
            </span>
          </summary>
          <div className="adm-forum-toolbar" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn-danger adm-btn-sm"
              disabled={questions.length <= MIN_Q}
              onClick={() => updateQuestions(questions.filter((_, idx) => idx !== qi))}
            >
              Удалить вопрос
            </button>
          </div>
          <textarea
            className="adm-input adm-textarea"
            value={q.text}
            rows={2}
            placeholder="Текст вопроса…"
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
                  const nextQ = questions.map((item, idx) => {
                    if (idx !== qi) return item;
                    const options = [...item.options];
                    options[oi] = e.target.value;
                    return { ...item, options };
                  });
                  onQuestionsChange(nextQ);
                }}
              />
              <label className="adm-forum-diag-role-label">
                <span className="adm-muted">Засчитывается как</span>
                <select
                  className="adm-input"
                  value={matrix[qi]?.[oi] || defaultRoleFor(qi, oi)}
                  onChange={e => {
                    const next = matrix.map(r => [...r]);
                    while (next.length <= qi) next.push([]);
                    const row = [...(next[qi] || [])];
                    while (row.length <= oi) row.push(defaultRoleFor(qi, row.length));
                    row[oi] = e.target.value;
                    next[qi] = row;
                    onMatrixChange(next);
                  }}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.key} value={r.key}>{r.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                disabled={q.options.length <= MIN_OPT}
                title="Удалить вариант"
                onClick={() => {
                  const nextQ = questions.map((item, idx) => {
                    if (idx !== qi) return item;
                    return { ...item, options: item.options.filter((_, i) => i !== oi) };
                  });
                  const nextM = matrix.map((row, ri) => (
                    ri === qi ? row.filter((_, i) => i !== oi) : [...row]
                  ));
                  onQuestionsChange(nextQ);
                  onMatrixChange(nextM);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="adm-btn adm-btn-secondary adm-btn-sm"
            style={{ marginTop: 8 }}
            disabled={q.options.length >= MAX_OPT}
            onClick={() => {
              const nextQ = questions.map((item, idx) => (
                idx === qi
                  ? { ...item, options: [...item.options, ''] }
                  : item
              ));
              const nextM = matrix.map((row, ri) => (
                ri === qi
                  ? [...row, defaultRoleFor(qi, row.length)]
                  : [...row]
              ));
              onQuestionsChange(nextQ);
              onMatrixChange(nextM);
            }}
          >
            + Вариант ответа
          </button>
        </details>
      ))}
      <button
        type="button"
        className="adm-btn adm-btn-secondary"
        style={{ marginTop: 12 }}
        disabled={questions.length >= MAX_Q}
        onClick={() => {
          updateQuestions([
            ...questions,
            { text: '', options: ['', ''] },
          ]);
        }}
      >
        + Добавить вопрос
      </button>
      <div className="adm-forum-actions">
        <button
          type="button"
          className="adm-btn adm-btn-secondary"
          onClick={() => {
            if (!confirm('Подставить шаблон навигационной диагностики (8 вопросов × 6 вариантов)? Текущие правки диагностики будут заменены.')) return;
            onQuestionsChange(DEFAULT_DIAG_QUESTIONS.map(q => ({ text: q.text, options: [...q.options] })));
            onMatrixChange(DEFAULT_DIAG_MATRIX.map(r => [...r]));
          }}
        >
          Шаблон 8×6 из файла
        </button>
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          Сохранить диагностику{dirty ? ' •' : ''}
        </button>
      </div>
    </div>
  );
}
