import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, CustomSelect, FormItem } from '@vkontakte/vkui';
import { apiPatch, apiPost } from '../../api/client';

export type EveningField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  allowOther?: boolean;
  otherLabel?: string;
  linkedEventIds?: number[];
  visibleWhen?: { field: string; equals: boolean | string | number };
};

export type EveningStep = {
  id: string;
  title: string;
  fields: EveningField[];
};

type RoleOpt = { roleKey: string; name: string };

export type EveningProgramEventNode = {
  id: number;
  title: string;
  place?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  children: EveningProgramEventNode[];
};

export type EveningProgramEventValue = {
  eventId: number;
  eventTitle: string;
  parentEventId?: number | null;
  parentEventTitle?: string | null;
};

function formatEventTimeRange(
  start?: string | Date | null,
  end?: string | Date | null,
): string {
  const fmt = (v: string | Date | null | undefined) => {
    if (!v) return '';
    const d = typeof v === 'string' ? new Date(v) : v;
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a}–${b}`;
  return a || b || '';
}

function countProgramLeaves(nodes: EveningProgramEventNode[] | undefined): number {
  if (!nodes?.length) return 0;
  return nodes.reduce((n, ch) => n + (ch.children?.length ? countProgramLeaves(ch.children) : 1), 0);
}

export type EveningExperimentContext = {
  status?: string;
  title?: string;
  body?: string;
  hint?: string;
  roleName?: string;
} | null;

export type EveningQuestionnaireProps = {
  currentDay: number;
  questionnaire: {
    /** Forum day this evening survey belongs to (may differ from clock currentDay). */
    dayNumber?: number;
    config?: { steps: EveningStep[] };
    roles?: RoleOpt[];
    askTomorrowRole?: boolean;
    savedDraft?: { step?: number; form?: Record<string, unknown>; tomorrowRoleKey?: string } | null;
    pointBQuestionId?: number | null;
    hasPointB?: boolean;
    programEventOptions?: Record<string, {
      events: EveningProgramEventNode[];
      emptyReason?: 'none' | 'none_in_program' | 'none_conducted_yet';
    }>;
  };
  experiment?: EveningExperimentContext;
  onClose: () => void;
  onSubmitted: () => void;
};

function isProgramEventValue(raw: unknown): raw is EveningProgramEventValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return Number.isFinite(Number(o.eventId)) && Number(o.eventId) > 0;
}

function isFieldValueSet(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (isProgramEventValue(value)) return true;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return false;
}

function fieldVisible(
  field: EveningField,
  form: Record<string, unknown>,
  allFields: EveningField[] = [],
): boolean {
  if (!field.visibleWhen) return true;
  const v = form[field.visibleWhen.field];
  const expected = field.visibleWhen.equals;
  if (expected === '__set__') return isFieldValueSet(v);
  if (expected === '__other__') {
    const parent = allFields.find(f => f.key === field.visibleWhen!.field);
    const opts = parent?.options ?? [];
    return typeof v === 'string' && v.trim().length > 0 && !opts.includes(v);
  }
  return v === expected;
}

/** Flatten nested sub-blocks to selectable leaves under a large program block. */
function flattenSelectableLeaves(node: EveningProgramEventNode): EveningProgramEventNode[] {
  if (!node.children?.length) return [node];
  return node.children.flatMap(ch => flattenSelectableLeaves(ch));
}

function ProgramEventPicker({
  field,
  value,
  nodes,
  emptyReason,
  onChange,
}: {
  field: EveningField;
  value: EveningProgramEventValue | null;
  nodes: EveningProgramEventNode[];
  emptyReason?: string;
  onChange: (v: EveningProgramEventValue | null) => void;
}) {
  const initialParentId = value?.parentEventId ?? (
    value?.eventId && nodes.some(n => n.id === value.eventId) ? value.eventId : null
  );
  const [selectedParentId, setSelectedParentId] = useState<number | null>(initialParentId);

  useEffect(() => {
    if (!value) return;
    const pid = value.parentEventId
      ?? (nodes.some(n => n.id === value.eventId) ? value.eventId : null);
    if (pid != null) setSelectedParentId(pid);
  }, [value?.eventId, value?.parentEventId, nodes]);

  const selectedParent = nodes.find(n => n.id === selectedParentId) || null;
  const subtopics = selectedParent
    ? flattenSelectableLeaves(selectedParent).filter(l => l.id !== selectedParent.id)
    : [];
  const needsSubtopic = subtopics.length > 0;
  const waitingForSubtopic = !!selectedParent && needsSubtopic && !value;

  const pickParent = (root: EveningProgramEventNode) => {
    setSelectedParentId(root.id);
    if (!root.children?.length) {
      onChange({
        eventId: root.id,
        eventTitle: root.title,
        parentEventId: root.id,
        parentEventTitle: root.title,
      });
      return;
    }
    // Wait for subtopic pick — clear incomplete answer
    if (value?.parentEventId !== root.id) onChange(null);
  };

  const pickSubtopic = (leaf: EveningProgramEventNode, root: EveningProgramEventNode) => {
    onChange({
      eventId: leaf.id,
      eventTitle: leaf.title,
      parentEventId: root.id,
      parentEventTitle: root.title,
    });
  };

  return (
    <FormItem top={<span className="evening-q__label">{field.label}</span>}>
      {nodes.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.4 }}>
          {emptyReason === 'none_in_program'
            ? 'В программе дня пока нет блоков для выбора.'
            : 'В программе дня пока нет блоков для выбора.'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            1. Событие программы
          </div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 1.4 }}>
            Выберите крупный блок — затем тему / подсобытие внутри него.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nodes.map(root => {
              const active = selectedParentId === root.id;
              const timeRange = formatEventTimeRange(root.startTime, root.endTime);
              const leafCount = countProgramLeaves(root.children);
              const hasKids = (root.children?.length ?? 0) > 0;
              return (
                <button
                  key={root.id}
                  type="button"
                  onClick={() => pickParent(root)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: active ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                    background: active ? '#D8F3DC' : '#FBF9F5',
                    cursor: 'pointer',
                  }}
                >
                  {timeRange && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2D6A4F', marginBottom: 4 }}>
                      {timeRange}
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
                    {root.title}
                    {hasKids ? (
                      <span style={{ fontWeight: 500, color: '#666' }}> · {leafCount} тем</span>
                    ) : null}
                  </div>
                  {hasKids && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                      {active ? '▼ выберите подсобытие ниже' : '▼ есть подсобытия'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedParent && needsSubtopic && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                2. Подсобытие / тема
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, lineHeight: 1.35 }}>
                {selectedParent.title}
              </div>
              {waitingForSubtopic && (
                <div style={{ fontSize: 12, color: '#9B2C2C', marginBottom: 8 }}>
                  Выберите тему внутри блока — без этого ответ не сохранится.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {subtopics.map(leaf => {
                  const selected = value?.eventId === leaf.id;
                  return (
                    <button
                      key={leaf.id}
                      type="button"
                      onClick={() => pickSubtopic(leaf, selectedParent)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: selected ? '2px solid #2D6A4F' : '1px solid #E0DAD0',
                        background: selected ? '#D8F3DC' : '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        lineHeight: 1.35,
                      }}
                    >
                      <span style={{ color: '#888' }}>·</span>
                      <span style={{ flex: 1 }}>{leaf.title}</span>
                      <span style={{ color: '#888' }}>›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value && (
            <div style={{ fontSize: 12, color: '#2D6A4F', marginTop: 12, fontWeight: 600 }}>
              Выбрано: {value.parentEventTitle && value.parentEventTitle !== value.eventTitle
                ? `${value.parentEventTitle} → ${value.eventTitle}`
                : value.eventTitle}
            </div>
          )}
        </>
      )}
    </FormItem>
  );
}

function programEventAnswerComplete(
  field: EveningField,
  form: Record<string, unknown>,
  options: EveningQuestionnaireProps['questionnaire']['programEventOptions'],
): boolean {
  const nodes = options?.[field.key]?.events || [];
  const raw = form[field.key];
  if (!isProgramEventValue(raw)) return false;
  const parent = nodes.find(n => n.id === raw.parentEventId) || nodes.find(n => n.id === raw.eventId);
  if (!parent) return true;
  const leaves = flattenSelectableLeaves(parent).filter(l => l.id !== parent.id);
  if (leaves.length === 0) return raw.eventId === parent.id;
  return leaves.some(l => l.id === raw.eventId);
}

function stepHasVisibleFields(
  step: EveningStep,
  form: Record<string, unknown>,
  experiment: EveningExperimentContext,
  questionnaire: EveningQuestionnaireProps['questionnaire'],
  currentDay: number,
): boolean {
  return step.fields.some(f => {
    if (!fieldVisible(f, form, step.fields)) return false;
    if (f.type === 'experiment_text' && !experiment) return false;
    if (f.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || currentDay > 6) return false;
    }
    return true;
  });
}

function isExperimentStep(step: EveningStep): boolean {
  return step.id === 'experiment'
    || step.fields.some(f => f.type === 'experiment_text');
}

export const EveningQuestionnaire: React.FC<EveningQuestionnaireProps> = ({
  currentDay,
  questionnaire,
  experiment,
  onClose,
  onSubmitted,
}) => {
  const rawSteps = questionnaire.config?.steps?.length
    ? questionnaire.config.steps
    : [{ id: 'legacy', title: 'Анкета', fields: [] }];
  const draft = questionnaire.savedDraft;
  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    tripYes: false,
    practiceYes: false,
    recommendYes: false,
    ...(draft?.form || {}),
  }));
  const [tomorrowRole, setTomorrowRole] = useState(
    draft?.tomorrowRoleKey || questionnaire.roles?.[0]?.roleKey || '',
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Forum day of this evening survey (not necessarily clock/admin currentDay). */
  const surveyDay = questionnaire.dayNumber ?? currentDay;

  const steps = useMemo(
    () => rawSteps.filter(s => stepHasVisibleFields(s, form, experiment ?? null, questionnaire, surveyDay)),
    [rawSteps, form, experiment, questionnaire, surveyDay],
  );

  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, Math.max(steps.length - 1, 0)));

  useEffect(() => {
    if (step >= steps.length) setStep(Math.max(0, steps.length - 1));
  }, [step, steps.length]);

  const persistDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiPatch('/day-state/evening/draft', {
        dayNumber: surveyDay,
        step,
        form,
        tomorrowRoleKey: tomorrowRole || undefined,
      }).catch(() => undefined);
    }, 400);
  }, [surveyDay, step, form, tomorrowRole]);

  useEffect(() => {
    persistDraft();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persistDraft]);

  const setField = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const currentStep = steps[Math.min(step, Math.max(steps.length - 1, 0))] ?? steps[0];
  const visibleFields = useMemo(
    () => (currentStep?.fields ?? []).filter(f => fieldVisible(f, form, currentStep?.fields ?? [])),
    [currentStep, form],
  );
  const showExperimentBlock = currentStep && isExperimentStep(currentStep) && !!experiment;

  const stepReady = useMemo(() => {
    for (const f of visibleFields) {
      if (f.type === 'program_event') {
        const answered = programEventAnswerComplete(f, form, questionnaire.programEventOptions);
        if (f.required && !answered) return false;
        // Partial / invalid object must not pass
        if (form[f.key] != null && !answered) return false;
        continue;
      }
      if (f.required && f.type !== 'role_select' && !isFieldValueSet(form[f.key])) return false;
    }
    return true;
  }, [visibleFields, form, questionnaire.programEventOptions]);

  const fieldTop = (label: string) => (
    <span className="evening-q__label">{label}</span>
  );

  const renderField = (field: EveningField) => {
    if (field.type === 'scale_1_5') {
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setField(field.key, n)}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: form[field.key] === n ? '2px solid #2D6A4F' : '1px solid #ddd',
                  background: form[field.key] === n ? '#D8F3DC' : '#fff',
                  fontWeight: 700, cursor: 'pointer',
                }}
              >{n}</button>
            ))}
          </div>
        </FormItem>
      );
    }
    if (field.type === 'scale_1_10') {
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" onClick={() => setField(field.key, n)}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', fontWeight: 700 }}>
                {n}
              </button>
            ))}
          </div>
        </FormItem>
      );
    }
    if (field.type === 'yes_no') {
      const val = !!form[field.key];
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button mode={val ? 'primary' : 'secondary'} onClick={() => setField(field.key, true)}>Да</Button>
            <Button mode={!val ? 'primary' : 'secondary'} onClick={() => setField(field.key, false)}>Нет</Button>
          </div>
        </FormItem>
      );
    }
    if (field.type === 'choice') {
      const opts = (field.options || []).map(o => String(o).trim()).filter(Boolean);
      const raw = String(form[field.key] ?? '');
      const otherOn = !!field.allowOther && raw.length > 0 && !opts.includes(raw);
      const otherLabel = field.otherLabel || 'Свой вариант';
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setField(field.key, opt)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: raw === opt ? '2px solid #2D6A4F' : '1px solid #ddd',
                  background: raw === opt ? '#D8F3DC' : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {opt}
              </button>
            ))}
            {field.allowOther && (
              <>
                <button
                  type="button"
                  onClick={() => setField(field.key, otherOn ? raw : ' ')}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: otherOn ? '2px solid #2D6A4F' : '1px solid #ddd',
                    background: otherOn ? '#D8F3DC' : '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {otherLabel}
                </button>
                {otherOn && (
                  <textarea
                    value={raw.trim() ? raw : ''}
                    onChange={e => setField(field.key, e.target.value)}
                    placeholder="Введите свой вариант…"
                    style={{ width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
                  />
                )}
              </>
            )}
          </div>
        </FormItem>
      );
    }
    if (field.type === 'program_event') {
      const pack = questionnaire.programEventOptions?.[field.key];
      const current = isProgramEventValue(form[field.key]) ? form[field.key] as EveningProgramEventValue : null;
      return (
        <ProgramEventPicker
          key={field.key}
          field={field}
          value={current}
          nodes={pack?.events || []}
          emptyReason={pack?.emptyReason}
          onChange={v => setField(field.key, v)}
        />
      );
    }
    if (field.type === 'text' || field.type === 'experiment_text') {
      if (field.type === 'experiment_text' && !experiment) return null;
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <textarea
            value={String(form[field.key] || '')}
            onChange={e => setField(field.key, e.target.value)}
            placeholder={field.type === 'experiment_text' ? 'Кратко: что попробовали, что сработало, что нет…' : undefined}
            style={{ width: '100%', minHeight: field.type === 'experiment_text' ? 88 : 48, borderRadius: 10, border: '1px solid #ddd', padding: 10 }}
          />
        </FormItem>
      );
    }
    if (field.type === 'role_select') {
      if (!questionnaire.askTomorrowRole || surveyDay > 6) return null;
      return (
        <FormItem key={field.key} top={fieldTop(field.label)}>
          <CustomSelect
            options={(questionnaire.roles || []).map(r => ({ label: r.name, value: r.roleKey }))}
            value={tomorrowRole || undefined}
            onChange={e => setTomorrowRole(String(e.target.value))}
          />
        </FormItem>
      );
    }
    return null;
  };

  const handleSubmit = async () => {
    const askRole = questionnaire.askTomorrowRole !== false && surveyDay <= 6;
    const ratings = { ...form };
    delete (ratings as Record<string, unknown>).tomorrowRoleKey;
    await apiPost('/day-state/evening', {
      dayNumber: surveyDay,
      tomorrowRoleKey: askRole && tomorrowRole ? tomorrowRole : undefined,
      ratings,
      experimentStatus: experiment?.status === 'done' ? 'done' : undefined,
    });
    onSubmitted();
  };

  if (!currentStep) {
    return (
      <div className="m-card">
        <div style={{ fontSize: 13 }}>Нет шагов анкеты для этого дня.</div>
        <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={onClose}>Закрыть</Button>
      </div>
    );
  }

  return (
    <div className="m-card evening-q">
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Итоговая анкета · день {surveyDay}</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        {currentStep.title} · шаг {step + 1} из {steps.length} · можно закрыть и вернуться
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${((step + 1) / steps.length) * 100}%`, height: 4, background: '#2D6A4F', borderRadius: 4 }} />
      </div>

      {showExperimentBlock && (
        <div className="evening-experiment-block">
          <div className="evening-experiment-block__tag">Эксперимент с ролью</div>
          {experiment?.roleName && (
            <div className="evening-experiment-block__role">Роль дня: {experiment.roleName}</div>
          )}
          {experiment?.title && (
            <div className="evening-experiment-block__title">{experiment.title}</div>
          )}
          {experiment?.body && (
            <p className="evening-experiment-block__body">{experiment.body}</p>
          )}
          {experiment?.hint && (
            <div className="evening-experiment-block__hint">{experiment.hint}</div>
          )}
        </div>
      )}

      {visibleFields.map(renderField)}

      {surveyDay === 7 && currentStep.fields.some(f => f.type === 'role_select') && (
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          День 7 — роль на день отъезда не выбираем.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {step > 0 && (
          <Button size="l" mode="secondary" onClick={() => setStep(s => s - 1)}>Назад</Button>
        )}
        {step < steps.length - 1 ? (
          <Button
            size="l"
            stretched
            disabled={!stepReady}
            onClick={() => { if (stepReady) setStep(s => s + 1); }}
          >
            Далее
          </Button>
        ) : (
          <Button
            size="l"
            stretched
            disabled={!stepReady}
            onClick={() => { if (stepReady) void handleSubmit(); }}
          >
            Сохранить
          </Button>
        )}
      </div>
      <Button size="l" stretched mode="tertiary" style={{ marginTop: 8 }} onClick={onClose}>
        Отложить
      </Button>
    </div>
  );
};
