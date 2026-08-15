import type { ReactNode } from 'react';
import type { QuestionDraft } from './types';
import { ANSWER_TYPES, AFTER_BLOCKS_PROMPT_TYPES, REFLECTIVE_KINDS, emptyPracticeRow, emptyAfterBlocksPrompt } from './types';
import { QuestionTagCloudConstructor } from './QuestionTagCloudConstructor';

type ParticipantOption = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  direction?: string | null;
};

type Props = {
  draft: QuestionDraft;
  totalDays: number;
  isNew: boolean;
  currentQuestionId?: number | null;
  answerCount?: number;
  versionNotice?: string | null;
  formTab: 'main' | 'versions' | 'tagcloud';
  versions: { id: number; title: string; status?: string; createdAt?: string; answerCount?: number }[];
  directions?: { id: number; name: string }[];
  groups?: { id: number; name: string }[];
  roleOptions?: { key: string; name: string }[];
  participants?: ParticipantOption[];
  adminFetch?: (path: string, init?: RequestInit) => Promise<any>;
  onFormTab: (t: 'main' | 'versions' | 'tagcloud') => void;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPublishNow?: () => void;
  onUnpublish?: () => void;
  onRevokePoints?: () => void;
  onViewPracticesResults?: () => void;
  onOpenDashboard?: () => void;
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
  participants = [],
  adminFetch,
  onFormTab,
  onChange,
  onSaveDraft,
  onPublish,
  onPublishNow,
  onUnpublish,
  onRevokePoints,
  onViewPracticesResults,
  onOpenDashboard,
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
          {!isNew && onOpenDashboard && (
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onOpenDashboard}>
              Дашборд
            </button>
          )}
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
        {!isNew && currentQuestionId != null && (answerCount ?? 0) > 0 && (
          <button type="button" className={formTab === 'tagcloud' ? 'on' : ''} onClick={() => onFormTab('tagcloud')}>
            Облако тегов
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

      {formTab === 'tagcloud' && currentQuestionId != null && adminFetch && (
        <div className="card adm-forum-block">
          <QuestionTagCloudConstructor questionId={currentQuestionId} adminFetch={adminFetch} />
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
                    onChange={() => onChange(
                      k === 'practices_vote'
                        ? { questionKind: k, answerType: 'practices_vote', allowRetry: true }
                        : k === 'after_blocks'
                          ? {
                            questionKind: k,
                            reflectionKind: draft.reflectionKind && draft.reflectionKind !== 'after_blocks'
                              ? draft.reflectionKind
                              : 'after_event',
                            afterBlocksConfig: draft.afterBlocksConfig.prompts.some(p => p.text.trim())
                              ? draft.afterBlocksConfig
                              : {
                                prompts: [emptyAfterBlocksPrompt({
                                  text: draft.text.trim() || 'Что вынесли из этого блока?',
                                  answerType: ['text', 'scale_5', 'scale_10', 'choice', 'multi'].includes(draft.answerType)
                                    ? draft.answerType as 'text'
                                    : 'text',
                                })],
                              },
                          }
                          : { questionKind: k },
                    )}
                  />
                  {{
                    input: 'Входные',
                    diagnostic: 'Диагностика',
                    state_check: 'Проверка состояния',
                    after_blocks: 'После блоков',
                    day_summary: 'Итоги дня',
                    practices_vote: 'Практики участников',
                    extra: 'Дополнительные',
                  }[k]}
                </label>
              ))}
            </div>
          </fieldset>

          {draft.questionKind === 'practices_vote' && (
            <div className="adm-forum-block" style={{ marginBottom: 16 }}>
              <div className="adm-forum-toolbar" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0 }}>Голосование за практики</h4>
                {currentQuestionId && onViewPracticesResults && (
                  <button
                    type="button"
                    className="adm-btn adm-btn-primary adm-btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={onViewPracticesResults}
                  >
                    Результаты голосования
                  </button>
                )}
              </div>
              {!currentQuestionId && (
                <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                  Сначала сохраните черновик — затем откроется кнопка «Результаты голосования».
                </p>
              )}
              <label className="adm-field">
                <span className="adm-label">Приамбула (что это и зачем)</span>
                <textarea
                  className="adm-input"
                  rows={3}
                  value={draft.practicesConfig.preamble}
                  onChange={e => onChange({
                    practicesConfig: { ...draft.practicesConfig, preamble: e.target.value },
                    text: e.target.value,
                  })}
                />
              </label>
              <label className="adm-field">
                <span className="adm-label">Лайков на участника</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="adm-input"
                  style={{ width: 100 }}
                  value={draft.practicesConfig.likesPerParticipant}
                  onChange={e => onChange({
                    practicesConfig: {
                      ...draft.practicesConfig,
                      likesPerParticipant: Math.max(1, Number(e.target.value) || 1),
                    },
                  })}
                />
              </label>
              <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                В колонке «Участник» сразу список ({participants.length}): первый пункт — «ФИО вручную».
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Название</th>
                      <th>Описание</th>
                      <th>Участник</th>
                      <th>Направление</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.practicesConfig.practices.map((row, idx) => {
                      const selectValue = row.source === 'manual'
                        ? '__manual__'
                        : (row.participantId != null ? String(row.participantId) : '__manual__');
                      return (
                        <tr key={row.id}>
                          <td>{idx + 1}</td>
                          <td>
                            <input
                              className="adm-input"
                              value={row.title}
                              placeholder="Название практики"
                              onChange={e => {
                                const practices = draft.practicesConfig.practices.map((p, i) =>
                                  i === idx ? { ...p, title: e.target.value } : p);
                                onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                              }}
                            />
                          </td>
                          <td>
                            <textarea
                              className="adm-input"
                              rows={2}
                              value={row.description}
                              placeholder="Описание"
                              onChange={e => {
                                const practices = draft.practicesConfig.practices.map((p, i) =>
                                  i === idx ? { ...p, description: e.target.value } : p);
                                onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                              }}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                              <select
                                className="adm-input"
                                value={selectValue}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '__manual__') {
                                    const practices = draft.practicesConfig.practices.map((pr, i) =>
                                      i === idx
                                        ? {
                                          ...pr,
                                          source: 'manual' as const,
                                          participantId: null,
                                          participantName: pr.source === 'manual' ? pr.participantName : '',
                                        }
                                        : pr);
                                    onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                                    return;
                                  }
                                  const pid = val ? Number(val) : null;
                                  const p = participants.find(x => x.id === pid);
                                  const name = p ? `${p.lastName || ''} ${p.firstName || ''}`.trim() : '';
                                  const practices = draft.practicesConfig.practices.map((pr, i) =>
                                    i === idx
                                      ? {
                                        ...pr,
                                        source: 'participant' as const,
                                        participantId: pid,
                                        participantName: name,
                                        direction: p?.direction || '',
                                      }
                                      : pr);
                                  onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                                }}
                              >
                                <option value="__manual__">ФИО вручную</option>
                                {participants.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {`${p.lastName || ''} ${p.firstName || ''}`.trim() || `#${p.id}`}
                                    {p.direction ? ` · ${p.direction}` : ''}
                                  </option>
                                ))}
                              </select>
                              {participants.length === 0 && (
                                <span className="adm-muted" style={{ fontSize: 11 }}>
                                  Список участников пуст — проверьте смену или обновите страницу
                                </span>
                              )}
                              {(row.source === 'manual' || selectValue === '__manual__') && (
                                <input
                                  className="adm-input"
                                  value={row.participantName}
                                  placeholder="Введите ФИО"
                                  onChange={e => {
                                    const practices = draft.practicesConfig.practices.map((p, i) =>
                                      i === idx
                                        ? {
                                          ...p,
                                          source: 'manual' as const,
                                          participantId: null,
                                          participantName: e.target.value,
                                        }
                                        : p);
                                    onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                                  }}
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            <input
                              className="adm-input"
                              value={row.direction}
                              placeholder="Направление"
                              readOnly={row.source === 'participant' && !!row.participantId}
                              title={row.source === 'participant' && row.participantId
                                ? 'Подтягивается из профиля участника'
                                : undefined}
                              onChange={e => {
                                if (row.source === 'participant' && row.participantId) return;
                                const practices = draft.practicesConfig.practices.map((p, i) =>
                                  i === idx ? { ...p, direction: e.target.value } : p);
                                onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                              }}
                            />
                          </td>
                          <td>
                            {draft.practicesConfig.practices.length > 1 && (
                              <button
                                type="button"
                                className="adm-btn adm-btn-danger adm-btn-sm"
                                onClick={() => {
                                  const practices = draft.practicesConfig.practices.filter((_, i) => i !== idx);
                                  onChange({ practicesConfig: { ...draft.practicesConfig, practices } });
                                }}
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => onChange({
                  practicesConfig: {
                    ...draft.practicesConfig,
                    practices: [
                      ...draft.practicesConfig.practices,
                      { ...emptyPracticeRow(), source: 'manual', sortOrder: draft.practicesConfig.practices.length },
                    ],
                  },
                })}
              >
                Добавить строку
              </button>
            </div>
          )}

          <div className="form-row">
            <label className="adm-field" style={{ flex: 1 }}>
              <span className="adm-label">Подтип (метка)</span>
              <select
                className="adm-input"
                value={draft.reflectionKind === 'after_blocks' ? 'after_event' : draft.reflectionKind}
                onChange={e => onChange({ reflectionKind: e.target.value })}
              >
                <option value="">—</option>
                <option value="state_check">Проверка состояния</option>
                <option value="after_event">После события</option>
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

          {(draft.questionKind === 'after_blocks' || draft.reflectionKind === 'after_blocks') && (() => {
            const dayEvs = programEvents
              .filter(ev => draft.dayNumbers.includes(ev.dayNumber)
                && String(ev.blockType || '').toLowerCase() !== 'break')
              .sort((a, b) => (a.dayNumber - b.dayNumber)
                || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
                || (a.startTime || '').localeCompare(b.startTime || '')
                || a.id - b.id);
            const byParent = new Map<number, typeof dayEvs>();
            for (const ev of dayEvs) {
              if (ev.parentEventId) {
                const list = byParent.get(ev.parentEventId) || [];
                list.push(ev);
                byParent.set(ev.parentEventId, list);
              }
            }
            const leafThemes = (rootId: number): typeof dayEvs => {
              const walk = (id: number): typeof dayEvs => {
                const kids = byParent.get(id) || [];
                if (!kids.length) {
                  const self = dayEvs.find(e => e.id === id);
                  return self && self.id !== rootId ? [self] : [];
                }
                return kids.flatMap(k => {
                  const nested = walk(k.id);
                  return nested.length ? nested : [k];
                });
              };
              return walk(rootId);
            };
            const roots = dayEvs.filter(ev => !ev.parentEventId);
            const toggleLinked = (id: number, checked: boolean) => {
              const next = checked
                ? draft.linkedEventIds.filter(x => x !== id)
                : [...draft.linkedEventIds, id];
              onChange({ linkedEventIds: next });
            };
            return (
              <div className="adm-field">
                <span className="adm-label">Связать с событиями программы</span>
                <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                  Отметьте параллельные блоки (уроки, практики и т.п.). Участник выберет блок,
                  затем одну или несколько подтем и ответит по каждой по очереди. Подтемы — справочно;
                  сценарий смотрите в «Посмотреть как участник».
                </p>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 280,
                  overflowY: 'auto',
                  padding: 10,
                  background: '#f9f9f9',
                  borderRadius: 8,
                  border: '1px solid #eee',
                }}>
                  {roots.map(ev => {
                    const checked = draft.linkedEventIds.includes(ev.id);
                    const kids = leafThemes(ev.id);
                    return (
                      <div key={ev.id} style={{ borderBottom: '1px solid #eee', paddingBottom: 6 }}>
                        <label className="adm-forum-check" style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLinked(ev.id, checked)}
                          />
                          <span style={{ color: '#888', marginRight: 4 }}>D{ev.dayNumber}</span>
                          {ev.title}
                        </label>
                        {kids.length > 0 && (
                          <div style={{ marginLeft: 28, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {kids.map(child => (
                              <div key={child.id} style={{ fontSize: 12, color: '#555', padding: '2px 0' }}>
                                · {child.title}
                                <span className="adm-muted" style={{ fontSize: 11, marginLeft: 6 }}>подтема</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {roots.length === 0 && (
                    <p className="adm-muted" style={{ fontSize: 12 }}>Нет событий в выбранные дни.</p>
                  )}
                </div>
                {draft.linkedEventIds.length > 0 && (
                  <p className="adm-muted" style={{ fontSize: 12, marginBottom: 0 }}>
                    Выбрано событий: {draft.linkedEventIds.length}
                  </p>
                )}
              </div>
            );
          })()}

          {(draft.questionKind === 'day_summary'
            || draft.reflectionKind === 'evening_summary'
            || draft.block === 'Итоги дня'
            || /итоговая анкета/i.test(draft.title)) && (
            <p className="adm-muted" style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 12px', padding: '10px 12px', background: 'var(--vkui--color_background_secondary, #f5f5f5)', borderRadius: 8 }}>
              Это вопрос в «Общении» (7-я точка дня), обычно с одним свободным ответом. Полная анкета с десятками полей —
              на главной у участника; править её: «Форум» → «Итоговая анкета вечера» → «Заводские настройки» или копирование с другого дня.
            </p>
          )}

          {draft.questionKind !== 'practices_vote' && draft.questionKind !== 'after_blocks' && (
            <label className="adm-field">
              <span className="adm-label">Текст вопроса участнику</span>
              <textarea className="adm-input" rows={3} value={draft.text} onChange={e => onChange({ text: e.target.value })} />
            </label>
          )}

          {draft.questionKind !== 'practices_vote' && draft.questionKind !== 'after_blocks' && (
            <label className="adm-field">
              <span className="adm-label">Тип ответа</span>
              <select className="adm-input" value={draft.answerType} onChange={e => onChange({ answerType: e.target.value })}>
                {ANSWER_TYPES.filter(a => a.value !== 'practices_vote').map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>
          )}

          {draft.questionKind === 'after_blocks' && (
            <div className="adm-field">
              <span className="adm-label">Вопросы участнику</span>
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 0 }}>
                После выбора блока участник отвечает на эти вопросы по каждой выбранной подтеме.
              </p>
              {draft.afterBlocksConfig.prompts.map((prompt, idx) => (
                <div
                  key={prompt.id}
                  className="adm-forum-step-card"
                  style={{ marginBottom: 10, padding: 12 }}
                >
                  <div className="adm-forum-toolbar" style={{ marginBottom: 8, gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>Вопрос {idx + 1}</strong>
                    {draft.afterBlocksConfig.prompts.length > 1 && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-sm btn-danger"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => onChange({
                          afterBlocksConfig: {
                            prompts: draft.afterBlocksConfig.prompts.filter((_, i) => i !== idx),
                          },
                        })}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <label className="adm-field">
                    <span className="adm-label">Текст вопроса участнику</span>
                    <textarea
                      className="adm-input"
                      rows={2}
                      value={prompt.text}
                      onChange={e => {
                        const prompts = draft.afterBlocksConfig.prompts.map((p, i) => (
                          i === idx ? { ...p, text: e.target.value } : p
                        ));
                        onChange({
                          afterBlocksConfig: { prompts },
                          text: idx === 0 ? e.target.value : draft.text,
                        });
                      }}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-label">Тип ответа</span>
                    <select
                      className="adm-input"
                      value={prompt.answerType}
                      onChange={e => {
                        const answerType = e.target.value as typeof prompt.answerType;
                        const prompts = draft.afterBlocksConfig.prompts.map((p, i) => (
                          i === idx ? { ...p, answerType } : p
                        ));
                        onChange({
                          afterBlocksConfig: { prompts },
                          answerType: idx === 0 ? answerType : draft.answerType,
                        });
                      }}
                    >
                      {AFTER_BLOCKS_PROMPT_TYPES.map(a => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </label>
                  {(prompt.answerType === 'choice' || prompt.answerType === 'multi') && (
                    <div className="adm-field">
                      <span className="adm-label">Варианты ответа</span>
                      {prompt.options.map((opt, oi) => (
                        <div key={oi} className="form-row" style={{ marginBottom: 6 }}>
                          <input
                            className="adm-input"
                            value={opt}
                            onChange={e => {
                              const options = [...prompt.options];
                              options[oi] = e.target.value;
                              const prompts = draft.afterBlocksConfig.prompts.map((p, i) => (
                                i === idx ? { ...p, options } : p
                              ));
                              onChange({ afterBlocksConfig: { prompts } });
                            }}
                            placeholder="Подпись"
                          />
                          <button
                            type="button"
                            className="adm-btn adm-btn-sm btn-danger"
                            onClick={() => {
                              const options = prompt.options.filter((_, i) => i !== oi);
                              const prompts = draft.afterBlocksConfig.prompts.map((p, i) => (
                                i === idx ? { ...p, options } : p
                              ));
                              onChange({ afterBlocksConfig: { prompts } });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="adm-btn adm-btn-sm"
                        onClick={() => {
                          const prompts = draft.afterBlocksConfig.prompts.map((p, i) => (
                            i === idx ? { ...p, options: [...p.options, ''] } : p
                          ));
                          onChange({ afterBlocksConfig: { prompts } });
                        }}
                      >
                        + Вариант
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="adm-btn adm-btn-primary adm-btn-sm"
                onClick={() => onChange({
                  afterBlocksConfig: {
                    prompts: [...draft.afterBlocksConfig.prompts, emptyAfterBlocksPrompt()],
                  },
                })}
              >
                Добавить вопрос
              </button>
            </div>
          )}

          {needsOptions && draft.questionKind !== 'after_blocks' && (
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
              <span className="adm-label">Открытие (МСК)</span>
              <input type="datetime-local" className="adm-input" value={draft.publishTime} onChange={e => onChange({ publishTime: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-label">Закрытие (МСК)</span>
              <input type="datetime-local" className="adm-input" value={draft.closeTime} onChange={e => onChange({ closeTime: e.target.value })} />
            </label>
          </div>
          <p className="adm-forum-hint" style={{ marginTop: 0 }}>
            После времени закрытия вопрос пропадает у участников (ответить больше нельзя).
            Если закрытие не задано — вопрос висит, пока не нажмёте «Снять с публикации».
            «Опубликовать сейчас» открывает сразу, даже если в поле открытия стоит будущее время.
          </p>

          <fieldset className="adm-field">
            <legend className="adm-label">Аудитория</legend>
            <p className="adm-forum-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Чтобы вопрос видели только участники одного направления — выберите «Направление»
              и укажите его ниже. Остальные направления этот вопрос не увидят.
            </p>
            <select
              className="adm-input"
              value={draft.audienceType}
              onChange={e => {
                const audienceType = e.target.value;
                onChange({
                  audienceType,
                  ...(audienceType !== 'direction' ? { audienceDirectionId: '' } : {}),
                  ...(audienceType !== 'group' ? { audienceGroupId: '' } : {}),
                  ...(audienceType !== 'role' ? { audienceRole: '' } : {}),
                });
              }}
            >
              <option value="all">Все участники</option>
              <option value="direction">Только одно направление</option>
              <option value="group">Только одна группа</option>
              <option value="role">Только роль</option>
            </select>
            {draft.audienceType === 'direction' && (
              <select
                className="adm-input"
                style={{ marginTop: 6 }}
                value={draft.audienceDirectionId}
                onChange={e => onChange({ audienceDirectionId: e.target.value })}
                required
              >
                <option value="">— выберите направление —</option>
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

          <p className="adm-muted" style={{ fontSize: 12, margin: '8px 0' }}>
            Точки осмысления и проверки состояния сами рассылают уведомление (мини-приложение + ЛС сообщества),
            когда вы публикуете сейчас или наступает время публикации. Повтор в тот же день не шлётся.
          </p>
          <label className="adm-forum-check">
            <input type="checkbox" checked={draft.pushOnPublish} onChange={e => onChange({ pushOnPublish: e.target.checked })} />
            Доп. уведомление с своим текстом (для других типов вопросов)
          </label>
          {draft.pushOnPublish && (
            <label className="adm-field">
              <span className="adm-label">Текст доп. push</span>
              <input className="adm-input" value={draft.pushTemplate} onChange={e => onChange({ pushTemplate: e.target.value })} placeholder="Новый вопрос: …" />
            </label>
          )}
        </>
      )}

      <div className="form-row" style={{ marginTop: 16, gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="adm-btn adm-btn-secondary" onClick={onSaveDraft}>Сохранить черновик</button>
        <button
          type="button"
          className="adm-btn"
          onClick={onPublish}
          disabled={!draft.publishTime}
          title={draft.publishTime ? 'Станет виден участникам в указанное время открытия' : 'Сначала укажите время открытия'}
        >
          Опубликовать по времени
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          onClick={onPublishNow || onPublish}
        >
          Опубликовать сейчас
        </button>
        {onUnpublish && (
          <button
            type="button"
            className="adm-btn adm-btn-danger"
            onClick={onUnpublish}
            disabled={isNew || draft.status !== 'published'}
            title={isNew || draft.status !== 'published' ? 'Сначала опубликуйте вопрос' : 'Скрыть у всех участников, включая копии того же слота'}
          >
            Снять с публикации
          </button>
        )}
        {onRevokePoints && !isNew && currentQuestionId && (
          <button
            type="button"
            className="adm-btn adm-btn-danger"
            onClick={onRevokePoints}
            title="Снять у всех начисленные за этот вопрос баллы"
          >
            Аннулировать баллы
          </button>
        )}
      </div>
      <p className="adm-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        Сейчас: {draft.status === 'published' ? (draft.isHidden ? 'скрыт' : 'опубликован') : 'черновик'}
        {draft.publishTime ? ` · открытие ${draft.publishTime.replace('T', ' ')} МСК` : ''}
        {draft.closeTime ? ` · закрытие ${draft.closeTime.replace('T', ' ')} МСК` : ''}
      </p>
    </div>
  );
}
