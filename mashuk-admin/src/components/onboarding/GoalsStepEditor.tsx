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

const TYPE_OPTIONS: { value: GoalQuestion['type']; label: string; hint: string }[] = [
  { value: 'open', label: 'Открытый ответ', hint: 'Участник сам вводит текст' },
  { value: 'choice', label: 'Один ответ', hint: 'Выбор одного варианта из списка' },
  { value: 'multi', label: 'Несколько ответов', hint: 'Можно отметить несколько вариантов' },
];

function emptyQuestion(): GoalQuestion {
  return { text: '', type: 'open', options: [] };
}

function filledOptions(options: string[]): string[] {
  return options.map(o => o.trim()).filter(Boolean);
}

function questionError(q: GoalQuestion): string | null {
  if (!q.text.trim()) return 'Введите текст вопроса';
  if (q.type === 'choice' || q.type === 'multi') {
    if (filledOptions(q.options).length < MIN_OPT) {
      return `Добавьте минимум ${MIN_OPT} варианта ответа`;
    }
  }
  return null;
}

export function GoalsStepEditor({ questions, onChange, onSave, dirty }: Props) {
  const updateAt = (i: number, patch: Partial<GoalQuestion>) => {
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };

  const setType = (i: number, type: GoalQuestion['type']) => {
    const q = questions[i];
    if (type === 'open') {
      updateAt(i, { type, options: [] });
      return;
    }
    const options = q.options.length >= MIN_OPT
      ? q.options
      : [...q.options, '', ''].slice(0, Math.max(MIN_OPT, q.options.length));
    while (options.length < MIN_OPT) options.push('');
    updateAt(i, { type, options });
  };

  const errors = questions.map(questionError);
  const canSave = errors.every(e => !e);

  return (
    <div className="adm-forum-block card">
      <h3>Шаг «Цели» (Точка А)</h3>
      <p className="adm-forum-hint">
        Вопросы целеполагания при регистрации. Для каждого вопроса выберите формат ответа:
        открытый текст, один вариант или несколько. Варианты для выбора админ добавляет кнопкой.
        Ответы попадут в профиль и PDF; на выезде (Точка Б) будут те же вопросы.
      </p>
      {questions.map((q, i) => {
        const needsOptions = q.type === 'choice' || q.type === 'multi';
        const err = errors[i];
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

            <div className="adm-label" style={{ marginTop: 10 }}>Формат ответа</div>
            <div className="adm-seg" style={{ flexWrap: 'wrap', marginTop: 6 }}>
              {TYPE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={q.type === o.value ? 'on' : ''}
                  title={o.hint}
                  onClick={() => setType(i, o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="adm-muted" style={{ marginTop: 6, fontSize: 12 }}>
              {TYPE_OPTIONS.find(o => o.value === q.type)?.hint}
            </p>

            {needsOptions && (
              <div style={{ marginTop: 10 }}>
                <div className="adm-label">Варианты ответа</div>
                <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                  Добавляйте варианты кнопкой ниже — участник увидит их как
                  {q.type === 'choice' ? ' радиокнопки (один выбор)' : ' чекбоксы (несколько)'}.
                </p>
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
                  + Добавить вариант ответа
                </button>
              </div>
            )}

            {err && (
              <p className="adm-insights-warn" style={{ marginTop: 8, marginBottom: 0 }}>{err}</p>
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
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          disabled={!canSave}
          onClick={onSave}
          title={canSave ? undefined : 'Исправьте ошибки в вопросах перед сохранением'}
        >
          Сохранить цели{dirty ? ' •' : ''}
        </button>
      </div>
    </div>
  );
}
