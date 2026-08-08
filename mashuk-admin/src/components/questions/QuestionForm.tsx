import type { ReactNode } from 'react';
import type { QuestionDraft } from './types';
import { ANSWER_TYPES, REFLECTIVE_KINDS } from './types';

type Props = {
  draft: QuestionDraft;
  totalDays: number;
  isNew: boolean;
  currentQuestionId?: number | null;
  answerCount?: number;
  versionNotice?: string | null;
  formTab: 'main' | 'versions';
  versions: { id: number; title: string; status?: string; createdAt?: string; answerCount?: number }[];
  directions?: { id: number; name: string }[];
  groups?: { id: number; name: string }[];
  roleOptions?: { key: string; name: string }[];
  onFormTab: (t: 'main' | 'versions') => void;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onCancel: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  onReorderOption: (from: number, to: number) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  programEvents?: any[];
  /** Published questions for showWhen parent picker (same day / earlier). */
  branchParents?: { id: number; title: string; options: { label: string; value: string }[] }[];
  previewSlot?: ReactNode;
};

export function QuestionForm({
  draft,
  totalDays,
  isNew,
  currentQuestionId = null,
  answerCount,
  versionNotice,
  formTab,
  versions,
  directions = [],
  groups = [],
  roleOptions = [],
  onFormTab,
  onChange,
  onSaveDraft,
  onPublish,
  onCancel,
  showPreview,
  onTogglePreview,
  onReorderOption,
  onAddOption,
  onRemoveOption,
  programEvents = [],
  branchParents = [],
  previewSlot,
}: Props) {
  const toggleDay = (d: number) => {
    const has = draft.dayNumbers.includes(d);
    const next = has ? draft.dayNumbers.filter(x => x !== d) : [...draft.dayNumbers, d].sort((a, b) => a - b);
    onChange({ dayNumbers: next.length ? next : [d] });
  };

  const applyDayRange = () => {
    const from = Math.min(...draft.dayNumbers, 1);
    const to = totalDays;
    const range: number[] = [];
    for (let d = from; d <= to; d++) range.push(d);
    onChange({ dayNumbers: range });
  };

  const needsOptions = ['choice', 'multi', 'dependent'].includes(draft.answerType);

  return (
    <div className="card adm-task-form">
      <div className="adm-forum-toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{isNew ? 'Новый вопрос' : 'Редактирование вопроса'}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onTogglePreview}>
            👁 {showPreview ? 'Скрыть превью' : 'Посмотреть как участник'}
          </button>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onCancel}>К списку</button>
        </div>
      </div>

      {versionNotice && (
        <p className="card" style={{ fontSize: 13, marginBottom: 12, background: '#FFFAF0' }}>{versionNotice}</p>
      )}
      {!isNew && answerCount != null && answerCount > 0 && !versionNotice && (
        <p className="adm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
          На текущую формулировку уже {answerCount} ответ(ов). Смена текста создаст новую версию.
        </p>
      )}

      <div className="adm-seg" style={{ marginBottom: 12 }}>
        <button type="button" className={formTab === 'main' ? 'on' : ''} onClick={() => onFormTab('main')}>Основное</button>
        {!isNew && (
          <button type="button" className={formTab === 'versions' ? 'on' : ''} onClick={() => onFormTab('versions')}>
            История версий
          </button>
        )}
      </div>

      {showPreview && previewSlot}

      {formTab === 'versions' && (
        <div className="card adm-forum-block">
          {versions.length === 0 && <p className="adm-muted">Нет других версий</p>}
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {versions.map(v => (
              <li key={v.id} style={{ marginBottom: 6 }}>
                <strong>#{v.id}</strong> {v.title}
                {currentQuestionId != null && v.id === currentQuestionId && (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#B8621A' }}>текущая</span>
                )}
                <span className="adm-muted" style={{ marginLeft: 8, fontSize: 11 }}>
                  {v.status} · {v.answerCount ?? 0} отв. · {v.createdAt ? new Date(v.createdAt).toLocaleString('ru-RU') : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {formTab === 'main' && (
        <>
          <label className="adm-field">
            <span className="adm-label">Заголовок (внутренний)</span>
            <input className="adm-input" value={draft.title} onChange={e => onChange({ title: e.target.value })} />
          </label>

          <label className="adm-field">
            <span className="adm-label">Подзаголовок (в списке участника)</span>
            <input className="adm-input" value={draft.subtitle} onChange={e => onChange({ subtitle: e.target.value })} />
          </label>

          <fieldset className="adm-field">
            <legend className="adm-label">Тип вопроса</legend>
            <div className="adm-radio-row">
              {REFLECTIVE_KINDS.map(k => (
                <label key={k} className="adm-forum-check">
                  <input
                    type="radio"
                    name="questionKind"
                    checked={draft.questionKind === k}
                    onChange={() => onChange({ questionKind: k })}
                  />
                  {{
                    input: 'Входные',
                    diagnostic: 'Диагностика',
                    state_check: 'Проверка состояния',
                    after_blocks: 'После блоков',
                    day_summary: 'Итоги дня',
                    extra: 'Дополнительные',
                  }[k]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-row">
            <label className="adm-field" style={{ flex: 1 }}>
              <span className="adm-label">Подтип (метка)</span>
              <select className="adm-input" value={draft.reflectionKind} onChange={e => onChange({ reflectionKind: e.target.value })}>
                <option value="">—</option>
                <option value="state_check">Проверка состояния</option>
                <option value="after_event">После события</option>
                <option value="after_blocks">После блоков</option>
                <option value="evening_summary">Итоги дня</option>
                <option value="point_a">Точка А</option>
                <option value="point_b">Точка Б</option>
              </select>
            </label>
            <label className="adm-field" style={{ flex: 1 }}>
              <span className="adm-label">Фаза дня</span>
              <select className="adm-input" value={draft.timePoint} onChange={e => onChange({ timePoint: e.target.value })}>
                <option value="">—</option>
                <option value="утро">Утро</option>
                <option value="день">День</option>
                <option value="вечер">Вечер</option>
              </select>
            </label>
          </div>

          {(draft.questionKind === 'after_blocks' || draft.reflectionKind === 'after_blocks') && (
            <div className="adm-field">
              <span className="adm-label">Связать с блоками программы</span>
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                Выберите блоки программы из списка, после которых будет показан этот вопрос.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 200, overflowY: 'auto', padding: 10, background: '#f9f9f9', borderRadius: 8, border: '1px solid #eee' }}>
                {programEvents
                  .filter(ev => draft.dayNumbers.includes(ev.dayNumber))
                  .sort((a, b) => (a.dayNumber - b.dayNumber) || (a.startTime || '').localeCompare(b.startTime || '') || a.id - b.id)
                  .map(ev => {
                    const checked = draft.linkedEventIds.includes(ev.id);
                    return (
                      <label key={ev.id} className="adm-forum-check" style={{ display: 'flex', gap: 6, minWidth: '45%', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? draft.linkedEventIds.filter(id => id !== ev.id)
                              : [...draft.linkedEventIds, ev.id];
                            onChange({ linkedEventIds: next });
                          }}
                        />
                        <span style={{ color: '#888', marginRight: 4 }}>D{ev.dayNumber}</span>
                        {ev.title}
                      </label>
                    );
                  })}
                {programEvents.filter(ev => draft.dayNumbers.includes(ev.dayNumber)).length === 0 && (
                  <p className="adm-muted" style={{ fontSize: 12 }}>Нет событий в выбранные дни.</p>
                )}
              </div>
            </div>
          )}

          {(draft.questionKind === 'day_summary'
            || draft.reflectionKind === 'evening_summary'
            || draft.block === 'Итоги дня'
            || /итоговая анкета/i.test(draft.title)) && (
            <p className="adm-muted" style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 12px', padding: '10px 12px', background: 'var(--vkui--color_background_secondary, #f5f5f5)', borderRadius: 8 }}>
              Это вопрос в «Общении» (7-я точка дня), обычно с одним свободным ответом. Полная анкета с десятками полей —
              на главной у участника; править её: «Форум» → «Итоговая анкета вечера» → «Заводские настройки» или копирование с другого дня.
            </p>
          )}

          <label className="adm-field">
            <span className="adm-label">Текст вопроса участнику</span>
            <textarea className="adm-input" rows={3} value={draft.text} onChange={e => onChange({ text: e.target.value })} />
          </label>

          <label className="adm-field">
            <span className="adm-label">Тип ответа</span>
            <select className="adm-input" value={draft.answerType} onChange={e => onChange({ answerType: e.target.value })}>
              {ANSWER_TYPES.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>

          {needsOptions && (
            <div className="adm-field">
              <span className="adm-label">Варианты ответа</span>
              {draft.options.map((opt, i) => (
                <div key={opt.id ?? i} className="form-row" style={{ marginBottom: 6 }}>
                  <input
                    className="adm-input"
                    value={opt.label}
                    onChange={e => {
                      const options = [...draft.options];
                      options[i] = { ...options[i], label: e.target.value, value: e.target.value };
                      onChange({ options });
                    }}
                    placeholder="Подпись"
                  />
                  <button type="button" className="adm-btn adm-btn-sm" disabled={i === 0} onClick={() => onReorderOption(i, i - 1)}>↑</button>
                  <button type="button" className="adm-btn adm-btn-sm" disabled={i === draft.options.length - 1} onClick={() => onReorderOption(i, i + 1)}>↓</button>
                  <button type="button" className="adm-btn adm-btn-sm btn-danger" onClick={() => onRemoveOption(i)}>×</button>
                </div>
              ))}
              <button type="button" className="adm-btn adm-btn-sm" onClick={onAddOption}>+ Вариант</button>
              {(draft.answerType === 'choice' || draft.answerType === 'multi') && (
                <label className="adm-forum-check" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={draft.allowOther}
                    onChange={e => onChange({ allowOther: e.target.checked })}
                  />
                  Пункт «Свой вариант» (поле ввода текста)
                </label>
              )}
            </div>
          )}

          {(draft.answerType === 'choice' || draft.answerType === 'multi') && branchParents.length > 0 && (
            <div className="adm-field">
              <span className="adm-label">Показывать по условию</span>
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                Вопрос появится у участника только если на выбранный выше вопрос дан нужный ответ.
              </p>
              <select
                className="adm-input"
                value={draft.showWhenQuestionId}
                onChange={e => onChange({
                  showWhenQuestionId: e.target.value,
                  showWhenOptionValues: [],
                })}
              >
                <option value="">Без условия (всегда)</option>
                {branchParents.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              {draft.showWhenQuestionId && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {(branchParents.find(p => String(p.id) === draft.showWhenQuestionId)?.options || []).map(opt => {
                    const val = opt.value || opt.label;
                    const checked = draft.showWhenOptionValues.includes(val);
                    return (
                      <label key={val} className="adm-forum-check" style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? draft.showWhenOptionValues.filter(v => v !== val)
                              : [...draft.showWhenOptionValues, val];
                            onChange({ showWhenOptionValues: next });
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                  <label className="adm-forum-check" style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={draft.showWhenOptionValues.includes('__other__')}
                      onChange={() => {
                        const checked = draft.showWhenOptionValues.includes('__other__');
                        const next = checked
                          ? draft.showWhenOptionValues.filter(v => v !== '__other__')
                          : [...draft.showWhenOptionValues, '__other__'];
                        onChange({ showWhenOptionValues: next });
                      }}
                    />
                    Свой вариант
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="adm-field">
            <span className="adm-label">День показа</span>
            <div className="form-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
                <label key={d} className="adm-forum-check">
                  <input type="checkbox" checked={draft.dayNumbers.includes(d)} onChange={() => toggleDay(d)} />
                  {d}
                </label>
              ))}
              <button type="button" className="adm-btn adm-btn-sm adm-btn-secondary" onClick={applyDayRange}>
                Диапазон до конца смены
              </button>
            </div>
          </div>

          <div className="form-row">
            <label className="adm-field">
              <span className="adm-label">Открытие</span>
              <input type="datetime-local" className="adm-input" value={draft.publishTime} onChange={e => onChange({ publishTime: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-label">Закрытие</span>
              <input type="datetime-local" className="adm-input" value={draft.closeTime} onChange={e => onChange({ closeTime: e.target.value })} />
            </label>
          </div>

          <fieldset className="adm-field">
            <legend className="adm-label">Аудитория</legend>
            <select className="adm-input" value={draft.audienceType} onChange={e => onChange({ audienceType: e.target.value })}>
              <option value="all">Все</option>
              <option value="direction">Направление</option>
              <option value="group">Группа</option>
              <option value="role">Роль</option>
            </select>
            {draft.audienceType === 'direction' && (
              <select className="adm-input" style={{ marginTop: 6 }} value={draft.audienceDirectionId} onChange={e => onChange({ audienceDirectionId: e.target.value })}>
                <option value="">— направление —</option>
                {directions.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
              </select>
            )}
            {draft.audienceType === 'group' && (
              <select className="adm-input" style={{ marginTop: 6 }} value={draft.audienceGroupId} onChange={e => onChange({ audienceGroupId: e.target.value })}>
                <option value="">— группа —</option>
                {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
              </select>
            )}
            {draft.audienceType === 'role' && (
              <select className="adm-input" style={{ marginTop: 6 }} value={draft.audienceRole} onChange={e => onChange({ audienceRole: e.target.value })}>
                <option value="">— роль —</option>
                {roleOptions.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            )}
          </fieldset>

          <div className="form-row">
            <label className="adm-forum-check">
              <input type="checkbox" checked={draft.isRequired} onChange={e => onChange({ isRequired: e.target.checked })} />
              Обязательный
            </label>
            <label className="adm-field">
              <span className="adm-label">Баллы (Путь)</span>
              <input type="number" className="adm-input" style={{ width: 80 }} value={draft.points} onChange={e => onChange({ points: Number(e.target.value) })} />
            </label>
            <label className="adm-field">
              <span className="adm-label">Приоритет в списке</span>
              <input type="number" className="adm-input" style={{ width: 80 }} value={draft.sortOrder} onChange={e => onChange({ sortOrder: Number(e.target.value) })} />
              <span className="adm-muted" style={{ fontSize: 11 }}>Больше число — выше у участника</span>
            </label>
          </div>

          <label className="adm-forum-check">
            <input type="checkbox" checked={draft.pushOnPublish} onChange={e => onChange({ pushOnPublish: e.target.checked })} />
            Уведомление при публикации
          </label>
          {draft.pushOnPublish && (
            <label className="adm-field">
              <span className="adm-label">Шаблон push</span>
              <input className="adm-input" value={draft.pushTemplate} onChange={e => onChange({ pushTemplate: e.target.value })} placeholder="Новый вопрос: {title}" />
            </label>
          )}

          <div className="form-row" style={{ marginTop: 16, gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-secondary" onClick={onSaveDraft}>Сохранить черновик</button>
            <button type="button" className="adm-btn" onClick={onPublish}>Опубликовать</button>
          </div>
        </>
      )}
    </div>
  );
}
