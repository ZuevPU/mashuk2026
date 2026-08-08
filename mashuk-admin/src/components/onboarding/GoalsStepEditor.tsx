import type { GoalQuestion } from './types';

type Props = {
  questions: GoalQuestion[];
  onChange: (next: GoalQuestion[]) => void;
  onSave: () => void;
  dirty: boolean;
};

const MAX_GOALS = 12;
const MAX_OPT = 12;
const MIN_OPT = 2;

const TYPE_OPTIONS: { value: GoalQuestion['type']; label: string }[] = [
  { value: 'open', label: 'Свободный ответ' },
  { value: 'choice', label: 'Один вариант' },
  { value: 'multi', label: 'Несколько вариантов' },
];

function emptyQuestion(): GoalQuestion {
  return { text: '', type: 'open', options: [] };
}

export function GoalsStepEditor({ questions, onChange, onSave, dirty }: Props) {
  const updateAt = (i: number, patch: Partial<GoalQuestion>) => {
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };

  return (
    <div className="adm-forum-block card">
      <h3>Шаг «Цели» (Точка А)</h3>
      <p className="adm-forum-hint">
        Вопросы целеполагания при регистрации. Можно добавить или убрать пункты (1–{MAX_GOALS}).
        Для каждого вопроса выберите формат: свободный текст, один вариант или несколько.
        Ответы попадут в профиль и PDF; на выезде (Точка Б) будут те же вопросы.
      </p>
      {questions.map((q, i) => {
        const needsOptions = q.type === 'choice' || q.type === 'multi';
        return (
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
              value={q.text}
              rows={2}
              placeholder="Текст вопроса для участника…"
              onChange={e => updateAt(i, { text: e.target.value })}
            />
            <label className="adm-label" style={{ marginTop: 8 }}>Формат ответа</label>
            <select
              className="adm-input"
              value={q.type}
              onChange={e => {
                const type = e.target.value as GoalQuestion['type'];
                if (type === 'open') {
                  updateAt(i, { type, options: [] });
                  return;
                }
                const options = q.options.length >= MIN_OPT
                  ? q.options
                  : [...q.options, '', ''].slice(0, MIN_OPT);
                updateAt(i, { type, options });
              }}
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {needsOptions && (
              <div style={{ marginTop: 10 }}>
                <div className="adm-label">Варианты ответа</div>
                {q.options.map((opt, oi) => (
                  <div key={oi} className="adm-forum-diag-row" style={{ marginTop: 6 }}>
                    <span className="adm-muted adm-forum-diag-opt-label">Вариант {oi + 1}</span>
                    <input
                      className="adm-input adm-forum-diag-opt-input"
                      value={opt}
                      placeholder="Текст варианта…"
                      onChange={e => {
                        const options = [...q.options];
                        options[oi] = e.target.value;
                        updateAt(i, { options });
                      }}
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost adm-btn-sm"
                      disabled={q.options.length <= MIN_OPT}
                      title="Удалить вариант"
                      onClick={() => updateAt(i, {
                        options: q.options.filter((_, idx) => idx !== oi),
                      })}
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
                  onClick={() => updateAt(i, { options: [...q.options, ''] })}
                >
                  + Вариант ответа
                </button>
                {q.options.filter(o => o.trim()).length < MIN_OPT && (
                  <p className="adm-muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Нужно минимум {MIN_OPT} заполненных варианта.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="adm-btn adm-btn-secondary"
        disabled={questions.length >= MAX_GOALS}
        onClick={() => onChange([...questions, emptyQuestion()])}
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
