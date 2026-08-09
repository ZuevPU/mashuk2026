import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  collectFieldKeys,
  EVENING_FIELD_TYPE_OPTIONS,
  slugKey,
  type EveningField,
  type EveningFieldType,
  type EveningQuestionnaireConfig,
  type EveningStep,
} from './types';
import { EveningQuestionnaireParticipantPreview } from './EveningQuestionnaireParticipantPreview';
import {
  buildEveningProgramPickNodes,
  countProgramLeaves,
  flattenProgramEvents,
  type ProgramEventRow,
  type ProgramPickNode,
} from './programEventTree';

type Props = {
  adminFetch: (path: string, opts?: RequestInit) => Promise<any>;
  act: (fn: () => Promise<void>, msg?: string) => void;
};

const EMPTY_CONFIG: EveningQuestionnaireConfig = {
  steps: [{ id: 'step_1', title: 'Новый шаг', fields: [] }],
};

export function EveningQuestionnaireBuilder({ adminFetch, act }: Props) {
  const [day, setDay] = useState(1);
  const [config, setConfig] = useState<EveningQuestionnaireConfig>(EMPTY_CONFIG);
  const [opensAtMsk, setOpensAtMsk] = useState('22:00');
  const [forcePublished, setForcePublished] = useState(false);
  const [forceUnpublished, setForceUnpublished] = useState(false);
  const [isOpenNow, setIsOpenNow] = useState(false);
  const [copyFromDay, setCopyFromDay] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [programEvents, setProgramEvents] = useState<ProgramEventRow[]>([]);

  const applyPublishState = (res: {
    opensAtMsk?: string;
    forcePublished?: boolean;
    forceUnpublished?: boolean;
    isOpenNow?: boolean;
    config?: EveningQuestionnaireConfig;
  }) => {
    setOpensAtMsk(res.opensAtMsk || opensAtMsk);
    setForcePublished(!!res.forcePublished);
    setForceUnpublished(!!res.forceUnpublished);
    setIsOpenNow(!!res.isOpenNow);
    if (res.config?.steps) setConfig(JSON.parse(JSON.stringify(res.config)));
  };

  const loadDay = async (d: number) => {
    setLoading(true);
    try {
      const ev = await adminFetch(`/evening-questionnaire?day=${d}`);
      const c = ev.config as EveningQuestionnaireConfig;
      const fallback = ev.defaultConfig as EveningQuestionnaireConfig | undefined;
      if (c?.steps?.length) setConfig(JSON.parse(JSON.stringify(c)));
      else if (fallback?.steps?.length) setConfig(JSON.parse(JSON.stringify(fallback)));
      else setConfig(JSON.parse(JSON.stringify(EMPTY_CONFIG)));
      setOpensAtMsk(ev.opensAtMsk || c?.opensAtMsk || '22:00');
      setForcePublished(!!ev.forcePublished || !!c?.forcePublished);
      setForceUnpublished(!!ev.forceUnpublished || !!c?.forceUnpublished);
      setIsOpenNow(!!ev.isOpenNow);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDay(day).catch(() => {});
  }, [day]);

  useEffect(() => {
    adminFetch('/events')
      .then((res: { events?: ProgramEventRow[] }) => {
        // /events returns a nested tree — flatten so subtopics keep parentEventId.
        setProgramEvents(flattenProgramEvents(res.events || []));
      })
      .catch(() => setProgramEvents([]));
  }, [adminFetch]);

  const dayProgramTrees = useMemo(
    () => buildEveningProgramPickNodes(programEvents, day, null),
    [programEvents, day],
  );

  const updateStep = (index: number, patch: Partial<EveningStep>) => {
    setConfig(prev => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], ...patch };
      return { ...prev, steps };
    });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= config.steps.length) return;
    setConfig(prev => {
      const steps = [...prev.steps];
      [steps[index], steps[j]] = [steps[j], steps[index]];
      return { ...prev, steps };
    });
  };

  const removeStep = (index: number) => {
    if (config.steps.length <= 1) return;
    if (!confirm('Удалить этот шаг анкеты?')) return;
    setConfig(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  };

  const addStep = () => {
    const n = config.steps.length + 1;
    setConfig(prev => ({
      ...prev,
      steps: [...prev.steps, { id: `step_${n}`, title: `Шаг ${n}`, fields: [] }],
    }));
  };

  const updateField = (stepIndex: number, fieldIndex: number, patch: Partial<EveningField>) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const fields = s.fields.map((f, fi) => (fi === fieldIndex ? { ...f, ...patch } : f));
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  const addField = (stepIndex: number) => {
    const keys = collectFieldKeys(config);
    const key = slugKey('new_field', keys);
    const field: EveningField = { key, type: 'text', label: 'Новый вопрос', required: false };
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: [...s.fields, field] } : s,
      );
      return { ...prev, steps };
    });
  };

  /** Ready-made chain: Да/Нет → события/подтемы с оценкой 1–10 под каждой */
  const addProgramRateChain = (stepIndex: number) => {
    const keys = collectFieldKeys(config);
    const yesKey = slugKey('attended_block', keys);
    const eventKey = slugKey('program_block', keys);
    const chain: EveningField[] = [
      {
        key: yesKey,
        type: 'yes_no',
        label: 'Участвовал(а) в блоке программы сегодня?',
        required: false,
      },
      {
        key: eventKey,
        type: 'program_event',
        label: 'Выберите блоки и темы из программы (можно несколько) и оцените каждую',
        required: true,
        linkedEventIds: [],
        visibleWhen: { field: yesKey, equals: true },
      },
    ];
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: [...s.fields, ...chain] } : s,
      );
      return { ...prev, steps };
    });
  };

  const removeField = (stepIndex: number, fieldIndex: number) => {
    setConfig(prev => {
      const steps = prev.steps.map((s, si) =>
        si === stepIndex ? { ...s, fields: s.fields.filter((_, fi) => fi !== fieldIndex) } : s,
      );
      return { ...prev, steps };
    });
  };

  const moveField = (stepIndex: number, fieldIndex: number, dir: -1 | 1) => {
    const j = fieldIndex + dir;
    const step = config.steps[stepIndex];
    if (!step || j < 0 || j >= step.fields.length) return;
    setConfig(prev => {
      const steps = prev.steps.map((s, si) => {
        if (si !== stepIndex) return s;
        const fields = [...s.fields];
        [fields[fieldIndex], fields[j]] = [fields[j], fields[fieldIndex]];
        return { ...s, fields };
      });
      return { ...prev, steps };
    });
  };

  const onLabelChange = (stepIndex: number, fieldIndex: number, label: string) => {
    updateField(stepIndex, fieldIndex, { label });
  };

  const save = () => {
    for (const step of config.steps) {
      if (!step.title.trim()) {
        alert('У каждого шага должно быть название.');
        return;
      }
      for (const f of step.fields) {
        if (!f.label.trim()) {
          alert('У каждого поля должна быть подпись для участника.');
          return;
        }
      }
    }
    act(async () => {
      const res = await adminFetch(`/evening-questionnaire?day=${day}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            ...config,
            opensAtMsk,
            forcePublished: forcePublished || undefined,
            forceUnpublished: forceUnpublished || undefined,
          },
          opensAtMsk,
          forcePublished,
          forceUnpublished,
        }),
      });
      applyPublishState(res);
    }, `Анкета дня ${day} сохранена`);
  };

  /** publish | schedule | unpublish */
  const setPublishMode = (mode: 'publish' | 'schedule' | 'unpublish') => {
    const forcePublishedNext = mode === 'publish';
    const forceUnpublishedNext = mode === 'unpublish';
    const msg =
      mode === 'publish'
        ? `Анкета дня ${day} опубликована сейчас`
        : mode === 'unpublish'
          ? `Анкета дня ${day} снята с публикации`
          : `Анкета дня ${day}: публикация по времени ${opensAtMsk} МСК`;
    act(async () => {
      const res = await adminFetch(`/evening-questionnaire?day=${day}`, {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            ...config,
            opensAtMsk,
            forcePublished: forcePublishedNext || undefined,
            forceUnpublished: forceUnpublishedNext || undefined,
          },
          opensAtMsk,
          forcePublished: forcePublishedNext,
          forceUnpublished: forceUnpublishedNext,
        }),
      });
      applyPublishState(res);
    }, msg);
  };

  const conditionParentsInStep = (step: EveningStep, fieldKey: string) =>
    step.fields.filter(f =>
      f.key !== fieldKey && (f.type === 'yes_no' || f.type === 'choice' || f.type === 'program_event'),
    );

  const fieldTypeOptions = EVENING_FIELD_TYPE_OPTIONS.filter(o => o.value !== 'point_b_cta');

  const renderSubtopicLines = (nodes: ProgramPickNode[], depth = 0): ReactNode => (
    nodes.map(n => (
      <div key={n.id}>
        <div style={{ marginLeft: 12 + depth * 14, fontSize: 12, color: '#555', padding: '2px 0' }}>
          · {n.title}
          {n.children.length > 0 ? (
            <span style={{ color: '#888' }}> · {countProgramLeaves(n.children)} тем</span>
          ) : (
            <span style={{ color: '#aaa' }}> ›</span>
          )}
        </div>
        {n.children.length > 0 && renderSubtopicLines(n.children, depth + 1)}
      </div>
    ))
  );

  return (
    <div className="adm-forum-block">
      <h3>Итоговая анкета вечера</h3>
      <p className="adm-forum-hint">
        Участники заполняют эту анкету вечером на главной (дни 1–7). Точка Б — отдельный вопрос в последний день смены (день 8), в эту анкету не входит.
        Поле «Эксперимент с ролью» лучше выносить в отдельный шаг — на главной оно показывается отдельным блоком с текстом эксперимента дня.
        Тип «Событие / тема из программы» берёт блоки дня из раздела «Программа»; можно ограничить список галочками и собрать цепочку «Да → событие → оценка».
      </p>
      <div className="adm-seg adm-forum-day-seg">
        {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
          <button key={d} type="button" className={day === d ? 'on' : ''} onClick={() => setDay(d)}>
            День {d}
          </button>
        ))}
      </div>
      {loading && <p className="adm-muted">Загрузка…</p>}

      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label className="adm-forum-inline">
          Открыть с (МСК)
          <input
            type="time"
            className="adm-input"
            style={{ width: 120 }}
            value={opensAtMsk}
            onChange={e => setOpensAtMsk(e.target.value)}
          />
        </label>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          {forceUnpublished
            ? 'Снята с публикации — участники не видят анкету.'
            : forcePublished
              ? 'Открыта вручную («Опубликовать сейчас»).'
              : isOpenNow
                ? `Сейчас открыта по расписанию (≥ ${opensAtMsk} МСК).`
                : `Появится автоматически в ${opensAtMsk} МСК.`}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => setPublishMode('schedule')}
          title="Сохранить время и убрать ручные флаги публикации"
        >
          Опубликовать во время
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary adm-btn-sm"
          onClick={() => setPublishMode('publish')}
          disabled={forcePublished && isOpenNow}
        >
          Опубликовать сейчас
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-danger adm-btn-sm"
          onClick={() => setPublishMode('unpublish')}
          disabled={forceUnpublished}
        >
          Снять с публикации
        </button>
      </div>

      <div className="adm-forum-toolbar">
        <label className="adm-forum-inline">
          Скопировать настройки с дня
          <select value={copyFromDay} onChange={e => setCopyFromDay(Number(e.target.value))}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>День {d}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => act(async () => {
            await adminFetch('/evening-questionnaire/copy', {
              method: 'POST',
              body: JSON.stringify({ fromDay: copyFromDay, toDay: day }),
            });
            await loadDay(day);
          }, 'Скопировано')}
        >
          Копировать
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={() => {
            if (!confirm(`Сбросить анкету дня ${day} к заводским настройкам?`)) return;
            act(async () => {
              await adminFetch(`/evening-questionnaire/reset?day=${day}`, { method: 'POST' });
              await loadDay(day);
            }, 'Сброшено');
          }}
        >
          Заводские настройки
        </button>
        <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setPreviewOpen(v => !v)}>
          {previewOpen ? 'Скрыть предпросмотр' : 'Предпросмотр'}
        </button>
        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={save}>
          Сохранить анкету
        </button>
      </div>
      {previewOpen && (
        <EveningQuestionnaireParticipantPreview
          day={day}
          config={config}
          programEvents={programEvents}
        />
      )}
      {config.steps.map((step, stepIndex) => (
        <div key={`${step.id}-${stepIndex}`} className="adm-forum-step-card">
          <div className="adm-forum-step-head">
            <input
              className="adm-input adm-forum-step-title"
              value={step.title}
              onChange={e => updateStep(stepIndex, { title: e.target.value })}
              placeholder="Название шага (видит участник)"
            />
            <div className="adm-forum-step-actions">
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveStep(stepIndex, -1)} title="Выше">↑</button>
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveStep(stepIndex, 1)} title="Ниже">↓</button>
              <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => removeStep(stepIndex)}>Удалить шаг</button>
            </div>
          </div>
          {step.fields.map((field, fieldIndex) => (
            <div key={field.key} className="adm-forum-field-row">
              <input
                className="adm-input"
                value={field.label}
                onChange={e => onLabelChange(stepIndex, fieldIndex, e.target.value)}
                placeholder="Текст вопроса для участника"
              />
              <select
                className="adm-input"
                value={field.type}
                onChange={e => {
                  const type = e.target.value as EveningFieldType;
                  const patch: Partial<EveningField> = { type };
                  if (type === 'choice' && !(field.options?.length)) {
                    patch.options = ['Вариант 1', 'Вариант 2'];
                  }
                  if (type !== 'choice') {
                    patch.options = undefined;
                    patch.allowOther = undefined;
                    patch.otherLabel = undefined;
                  }
                  if (type === 'program_event' && !field.linkedEventIds) {
                    patch.linkedEventIds = [];
                  }
                  if (type !== 'program_event') {
                    patch.linkedEventIds = undefined;
                  }
                  updateField(stepIndex, fieldIndex, patch);
                }}
              >
                {fieldTypeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <label className="adm-forum-check">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={e => updateField(stepIndex, fieldIndex, { required: e.target.checked })}
                />
                Обязательное
              </label>
              {conditionParentsInStep(step, field.key).length > 0 && (
                <label className="adm-forum-check">
                  <input
                    type="checkbox"
                    checked={!!field.visibleWhen}
                    onChange={e => {
                      if (!e.target.checked) {
                        updateField(stepIndex, fieldIndex, { visibleWhen: undefined });
                        return;
                      }
                      const dep = conditionParentsInStep(step, field.key)[0];
                      if (!dep) return;
                      const equals = dep.type === 'yes_no'
                        ? true
                        : dep.type === 'program_event'
                          ? '__set__'
                          : (dep.options?.filter(Boolean)[0] || '');
                      updateField(stepIndex, fieldIndex, { visibleWhen: { field: dep.key, equals } });
                    }}
                  />
                  Условие
                </label>
              )}
              {field.visibleWhen && (() => {
                const parents = conditionParentsInStep(step, field.key);
                const parent = parents.find(f => f.key === field.visibleWhen!.field) || parents[0];
                return (
                  <>
                    <select
                      className="adm-input adm-input-narrow"
                      value={field.visibleWhen.field}
                      onChange={e => {
                        const dep = parents.find(f => f.key === e.target.value);
                        const equals = dep?.type === 'yes_no'
                          ? true
                          : dep?.type === 'program_event'
                            ? '__set__'
                            : (dep?.options?.filter(Boolean)[0] || '');
                        updateField(stepIndex, fieldIndex, {
                          visibleWhen: { field: e.target.value, equals },
                        });
                      }}
                    >
                      {parents.map(f => (
                        <option key={f.key} value={f.key}>{f.label.slice(0, 40)}</option>
                      ))}
                    </select>
                    <select
                      className="adm-input adm-input-narrow"
                      value={String(field.visibleWhen.equals)}
                      onChange={e => {
                        const raw = e.target.value;
                        let equals: boolean | string = raw;
                        if (raw === 'true') equals = true;
                        else if (raw === 'false') equals = false;
                        updateField(stepIndex, fieldIndex, {
                          visibleWhen: { field: field.visibleWhen!.field, equals },
                        });
                      }}
                    >
                      {parent?.type === 'yes_no' ? (
                        <>
                          <option value="true">= Да</option>
                          <option value="false">= Нет</option>
                        </>
                      ) : parent?.type === 'program_event' ? (
                        <option value="__set__">= событие выбрано</option>
                      ) : (
                        <>
                          {(parent?.options || []).filter(Boolean).map(opt => (
                            <option key={opt} value={opt}>= {opt}</option>
                          ))}
                          {parent?.allowOther && (
                            <option value="__other__">= {parent.otherLabel || 'Свой вариант'}</option>
                          )}
                        </>
                      )}
                    </select>
                  </>
                );
              })()}
              <div className="adm-forum-field-actions">
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveField(stepIndex, fieldIndex, -1)}>↑</button>
                <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => moveField(stepIndex, fieldIndex, 1)}>↓</button>
                <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => removeField(stepIndex, fieldIndex)}>×</button>
              </div>
              {field.type === 'choice' && (
                <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                  <div className="adm-label">Варианты ответа</div>
                  {(field.options || []).map((opt, oi) => (
                    <div key={oi} className="adm-forum-diag-row" style={{ marginTop: 4 }}>
                      <input
                        className="adm-input"
                        value={opt}
                        onChange={e => {
                          const options = [...(field.options || [])];
                          options[oi] = e.target.value;
                          updateField(stepIndex, fieldIndex, { options });
                        }}
                      />
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={(field.options || []).length <= 2}
                        onClick={() => updateField(stepIndex, fieldIndex, {
                          options: (field.options || []).filter((_, idx) => idx !== oi),
                        })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => updateField(stepIndex, fieldIndex, {
                      options: [...(field.options || []), `Вариант ${(field.options || []).length + 1}`],
                    })}
                  >
                    + Вариант
                  </button>
                  <label className="adm-forum-check" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!field.allowOther}
                      onChange={e => updateField(stepIndex, fieldIndex, {
                        allowOther: e.target.checked,
                        otherLabel: e.target.checked ? (field.otherLabel || 'Свой вариант') : undefined,
                      })}
                    />
                    Свой вариант (текст)
                  </label>
                </div>
              )}
              {field.type === 'program_event' && (
                <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                  <div className="adm-label">Связь с программой дня {day}</div>
                  <p className="adm-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                    Отметьте крупные блоки. Участник сначала выбирает блок, затем подтему внутри
                    (как в «Программе»). Если ничего не отмечено — покажем все блоки дня с их подтемами.
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
                    {dayProgramTrees.map(ev => {
                      const linked = field.linkedEventIds || [];
                      const checked = linked.includes(ev.id);
                      const leafCount = countProgramLeaves(ev.children);
                      return (
                        <div key={ev.id} style={{ borderBottom: '1px solid #eee', paddingBottom: 6 }}>
                          <label className="adm-forum-check" style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? linked.filter(id => id !== ev.id)
                                  : [...linked, ev.id];
                                updateField(stepIndex, fieldIndex, { linkedEventIds: next });
                              }}
                            />
                            {ev.title}
                            {leafCount > 0 && (
                              <span style={{ fontWeight: 500, color: '#666' }}>· {leafCount} подтем</span>
                            )}
                          </label>
                          {ev.children.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              {renderSubtopicLines(ev.children)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayProgramTrees.length === 0 && (
                      <p className="adm-muted" style={{ fontSize: 12, margin: 0 }}>
                        Нет событий программы на день {day}. Добавьте крупный блок и подтемы во вкладке «Программа».
                      </p>
                    )}
                  </div>
                  {(field.linkedEventIds?.length || 0) > 0 && (
                    <p className="adm-muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Выбрано крупных блоков: {field.linkedEventIds!.length}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => addField(stepIndex)}>
              + Добавить вопрос
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => addProgramRateChain(stepIndex)}
              title="Да/нет → несколько тем из программы, оценка 1–10 под каждой"
            >
              + Цепочка: Да → темы + оценки
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-secondary" onClick={addStep} style={{ marginTop: 12 }}>
        + Добавить шаг
      </button>
    </div>
  );
}
