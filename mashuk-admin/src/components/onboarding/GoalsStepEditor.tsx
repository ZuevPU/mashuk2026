type Props = {
  questions: string[];
  onChange: (next: string[]) => void;
  onSave: () => void;
  dirty: boolean;
};

const MAX_GOALS = 12;

export function GoalsStepEditor({ questions, onChange, onSave, dirty }: Props) {
  return (
    <div className="adm-forum-block card">
      <h3>Шаг «Цели» (Точка А)</h3>
      <p className="adm-forum-hint">
        Вопросы целеполагания при регистрации. Можно добавить или убрать пункты (1–{MAX_GOALS}) —
        тексты можно дописать позже. Ответы попадут в профиль и PDF; на выезде (Точка Б) будут те же вопросы.
      </p>
      {questions.map((q, i) => (
        <div key={i} className="card adm-forum-nested-card">
          <div className="adm-forum-toolbar" style={{ marginBottom: 6 }}>
            <label className="adm-label" style={{ margin: 0 }}>Вопрос {i + 1}</label>
            <button
              type="button"
              className="adm-btn adm-btn-danger adm-btn-sm"
              disabled={questions.length <= 1}
              onClick={() => onChange(questions.filter((_, idx) => idx !== i))}
            >
              Удалить
            </button>
          </div>
          <textarea
            className="adm-input adm-textarea"
            value={q}
            rows={2}
            placeholder="Текст вопроса для участника…"
            onChange={e => {
              const next = [...questions];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn adm-btn-secondary"
        disabled={questions.length >= MAX_GOALS}
        onClick={() => onChange([...questions, ''])}
      >
        + Добавить вопрос
      </button>
      <div className="adm-forum-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          Сохранить цели{dirty ? ' •' : ''}
        </button>
      </div>
    </div>
  );
}
