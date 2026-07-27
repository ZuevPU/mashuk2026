type Props = {
  questions: string[];
  onChange: (next: string[]) => void;
  onSave: () => void;
  dirty: boolean;
};

export function GoalsStepEditor({ questions, onChange, onSave, dirty }: Props) {
  return (
    <div className="adm-forum-block card">
      <h3>Шаг «Цели» (Точка А)</h3>
      <p className="adm-forum-hint">
        Пять коротких вопросов при первом входе. Ответы участника попадут в профиль и PDF.
      </p>
      {questions.map((q, i) => (
        <div key={i} className="card adm-forum-nested-card">
          <label className="adm-label">Вопрос {i + 1}</label>
          <textarea
            className="adm-input adm-textarea"
            value={q}
            rows={2}
            onChange={e => {
              const next = [...questions];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        </div>
      ))}
      <div className="adm-forum-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={onSave}>
          Сохранить цели{dirty ? ' •' : ''}
        </button>
      </div>
    </div>
  );
}
