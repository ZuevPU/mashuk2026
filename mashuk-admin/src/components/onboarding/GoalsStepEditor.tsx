import type { GoalQuestion } from './types';
import { GOAL_OTHER_VALUE, newGoalQuestionId } from './types';

type Props = {
  questions: GoalQuestion[];
  onChange: (next: GoalQuestion[]) => void;
  onSave: () => void;
  dirty: boolean;
};

const MAX_GOALS = 24;
const MAX_OPT = 12;
const MIN_OPT = 2;

const TYPE_OPTIONS: { value: GoalQuestion['type']; label: string; hint: string }[] = [
  { value: 'open', label: 'Открытый ответ', hint: 'Участник сам вводит текст' },
  { value: 'choice', label: 'Один ответ', hint: 'Выбор одного варианта из списка' },
  { value: 'multi', label: 'Несколько ответов', hint: 'Можно отметить несколько вариантов' },
];

function emptyQuestion(): GoalQuestion {
  return { id: newGoalQuestionId(), text: '', type: 'open', options: [] };
}

function filledOptions(options: string[]): string[] {
  return options.map(o => o.trim()).filter(Boolean);
}

function questionError(q: GoalQuestion, all: GoalQuestion[], index: number): string | null {
  if (!q.text.trim()) return 'Введите текст вопроса';
  if (q.type === 'choice' || q.type === 'multi') {
    if (filledOptions(q.options).length < MIN_OPT) {
      return `Добавьте минимум ${MIN_OPT} варианта ответа`;
    }
  }
  if (q.showWhen?.questionId) {
    const parentIdx = all.findIndex(x => x.id === q.showWhen!.questionId);
    if (parentIdx < 0) return 'Условие ссылается на удалённый вопрос';
    if (parentIdx >= index) return 'Условие можно ставить только на вопрос выше по списку';
    if (!q.showWhen.options?.length) return 'Выберите варианты ответа для условия';
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
      updateAt(i, { type, options: [], allowOther: false, otherLabel: undefined });
      return;
    }
    const options = q.options.length >= MIN_OPT
      ? q.options
      : [...q.options, '', ''].slice(0, Math.max(MIN_OPT, q.options.length));
    while (options.length < MIN_OPT) options.push('');
    updateAt(i, { type, options });
  };

  const errors = questions.map((q, i) => questionError(q, questions, i));
  const canSave = errors.every(e => !e);

  const toggleShowWhenOption = (qi: number, opt: string) => {
    const q = questions[qi];
    const sw = q.showWhen;
    if (!sw) return;
    const has = sw.options.includes(opt);
    const options = has ? sw.options.filter(o => o !== opt) : [...sw.options, opt];
    updateAt(qi, { showWhen: { ...sw, options } });
  };

  return (
    <div className="adm-forum-block card">
      <h3>Шаг «Цели» (Точка А)</h3>
      <p className="adm-forum-hint">
        Вопросы целеполагания при регистрации. Для выбора одного ответа можно включить «Свой вариант»
        и добавить цепочку: следующий вопрос появляется только если участник выбрал нужный вариант.
        Те же вопросы используются в Точке Б.
      </p>
      {questions.map((q, i) => {
        const needsOptions = q.type === 'choice' || q.type === 'multi';
        const err = errors[i];
        const parents = questions.slice(0, i).filter(p =>
          (p.type === 'choice' || p.type === 'multi') && filledOptions(p.options).length >= MIN_OPT,
        );
        const parent = q.showWhen
          ? questions.find(x => x.id === q.showWhen!.questionId)
          : undefined;
        return (
          <div key={q.id} className="card adm-forum-nested-card">
            <div className="adm-forum-toolbar" style={{ marginBottom: 6 }}>
              <label className="adm-label" style={{ margin: 0 }}>Вопрос {i + 1}</label>
              <button
                type="button"
                className="adm-btn adm-btn-danger adm-btn-sm"
                disabled={questions.length <= 1}
                onClick={() => {
                  const removedId = q.id;
                  onChange(
                    questions
                      .filter((_, idx) => idx !== i)
                      .map(item => (
                        item.showWhen?.questionId === removedId
                          ? { ...item, showWhen: null }
                          : item
                      )),
                  );
                }}
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
                  + Добавить вариант ответа
                </button>
                <label className="adm-forum-check" style={{ display: 'flex', marginTop: 10, gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!q.allowOther}
                    onChange={e => updateAt(i, {
                      allowOther: e.target.checked,
                      otherLabel: e.target.checked ? (q.otherLabel || 'Свой вариант') : undefined,
                    })}
                  />
                  Пункт «Свой вариант» (поле ввода текста)
                </label>
                {q.allowOther && (
                  <input
                    className="adm-input"
                    style={{ marginTop: 6 }}
                    value={q.otherLabel || 'Свой вариант'}
                    onChange={e => updateAt(i, { otherLabel: e.target.value })}
                    placeholder="Подпись пункта…"
                  />
                )}
              </div>
            )}

            {i > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #EEE6DA' }}>
                <label className="adm-forum-check" style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!q.showWhen}
                    disabled={parents.length === 0}
                    onChange={e => {
                      if (!e.target.checked) {
                        updateAt(i, { showWhen: null });
                        return;
                      }
                      const p = parents[parents.length - 1];
                      if (!p) return;
                      updateAt(i, {
                        showWhen: {
                          questionId: p.id,
                          options: filledOptions(p.options).slice(0, 1),
                        },
                      });
                    }}
                  />
                  Показывать по условию (если участник выбрал определённый ответ выше)
                </label>
                {parents.length === 0 && (
                  <p className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Чтобы задать условие, выше нужен вопрос с выбором вариантов.
                  </p>
                )}
                {q.showWhen && (
                  <div style={{ marginTop: 8 }}>
                    <div className="adm-label">Если в вопросе</div>
                    <select
                      className="adm-input"
                      value={q.showWhen.questionId}
                      onChange={e => {
                        const p = questions.find(x => x.id === e.target.value);
                        updateAt(i, {
                          showWhen: {
                            questionId: e.target.value,
                            options: p ? filledOptions(p.options).slice(0, 1) : [],
                          },
                        });
                      }}
                    >
                      {parents.map((p, pi) => (
                        <option key={p.id} value={p.id}>
                          {pi + 1}. {p.text.trim().slice(0, 60) || 'Без текста'}
                        </option>
                      ))}
                    </select>
                    <div className="adm-label" style={{ marginTop: 8 }}>выбран ответ</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {(parent ? filledOptions(parent.options) : []).map(opt => (
                        <label key={opt} className="adm-forum-check" style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={q.showWhen!.options.includes(opt)}
                            onChange={() => toggleShowWhenOption(i, opt)}
                          />
                          {opt}
                        </label>
                      ))}
                      {parent?.allowOther && (
                        <label className="adm-forum-check" style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={q.showWhen!.options.includes(GOAL_OTHER_VALUE)}
                            onChange={() => toggleShowWhenOption(i, GOAL_OTHER_VALUE)}
                          />
                          {parent.otherLabel || 'Свой вариант'}
                        </label>
                      )}
                    </div>
                  </div>
                )}
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
